/**
 * sync_products.js
 *
 * Deterministic product catalog sync: iterates IDs 1–1000, checks Supabase,
 * skips rows that already exist, fetches the individual product API for new
 * IDs, and inserts them.
 *
 * Safe to re-run at any time — existing rows are never touched.
 * Does NOT use /api/catalog (shuffled/non-deterministic).
 * Does NOT modify the price scraper.
 *
 * Usage:
 *   node sync_products.js [--start N] [--end N]
 *
 *   --start N   First ID to process (default: 1)
 *   --end   N   Last ID to process  (default: 1000)
 *
 * Environment (scraper/.env → backend/.env fallback):
 *   SUPABASE_URL         - required
 *   SUPABASE_SERVICE_KEY - required
 */

"use strict";

const path = require("path");

// ── Load env ──────────────────────────────────────────────────────────────────
require("dotenv").config();
if (!process.env.SUPABASE_URL) {
    require("dotenv").config({
        path: path.join(__dirname, "../backend/.env"),
        override: false,
    });
}

const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("❌  SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.");
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ── Constants ─────────────────────────────────────────────────────────────────
const PRODUCT_API   = "https://demo.inelabteamdev.com/api/product";
const PRODUCT_BASE  = "https://demo.inelabteamdev.com/product/";

const FIRST_ID      = 1;
const LAST_ID       = 1000;

// Pause between every product API call (ms).  ~500 ms keeps us well under the
// observed rate-limit threshold of ~6-8 req/s.
const INTER_REQUEST_DELAY_MS = 500;

// ── CLI args: optional --start / --end overrides ──────────────────────────────
let startId = FIRST_ID;
let endId   = LAST_ID;
for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--start" && process.argv[i + 1]) startId = parseInt(process.argv[++i], 10);
    if (process.argv[i] === "--end"   && process.argv[i + 1]) endId   = parseInt(process.argv[++i], 10);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch /api/product/{id} with exponential backoff on 429/503.
 * Returns:
 *   { status: 200, data: {...} }   — product found
 *   { status: 404, data: null }    — product does not exist in the store
 *   { status: N,   data: null }    — unrecoverable error after retries
 */
async function fetchProduct(id, maxAttempts = 6) {
    let delay = 1500;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(`${PRODUCT_API}/${id}`);
            if (res.status === 200)  return { status: 200, data: await res.json() };
            if (res.status === 404)  return { status: 404, data: null };
            if (res.status === 429 || res.status === 503) {
                if (attempt === maxAttempts) return { status: res.status, data: null };
                await sleep(delay);
                delay = Math.min(delay * 2, 20000);
                continue;
            }
            // Any other non-200: treat as a hard failure
            return { status: res.status, data: null };
        } catch (err) {
            if (attempt === maxAttempts) return { status: "ERR", data: null, error: err.message };
            await sleep(delay);
            delay = Math.min(delay * 2, 20000);
        }
    }
}

/**
 * Map a live API response to a products row.
 */
function toRow(data) {
    return {
        store_product_id: data.id,
        name:             data.name        ?? null,
        slug:             data.slug        ?? null,
        brand:            data.brand       ?? null,
        category:         data.category    ?? null,
        sku:              data.sku         ?? null,
        description:      data.description ?? null,
        url:              `${PRODUCT_BASE}${data.id}`,
    };
}

/**
 * Load the full set of existing store_product_ids from Supabase.
 * Uses a paginated read so it handles tables with > 1000 rows.
 */
async function loadExistingIds() {
    const PAGE = 1000;
    let from = 0;
    const ids = new Set();
    while (true) {
        const { data, error } = await supabase
            .from("products")
            .select("store_product_id")
            .range(from, from + PAGE - 1);
        if (error) throw new Error("Supabase read failed: " + error.message);
        for (const row of data) ids.add(row.store_product_id);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return ids;
}

/**
 * Insert a single row into `products`.
 * Returns null on success, error message on failure.
 */
async function insertRow(row) {
    const { error } = await supabase.from("products").insert(row);
    if (error) return error.message;
    return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    const wallStart = Date.now();

    console.log("════════════════════════════════════════════════════");
    console.log("📦  DETERMINISTIC PRODUCT SYNC  (IDs 1 – 1000)");
    console.log("════════════════════════════════════════════════════\n");

    // ── Step 1: Load all IDs already in DB ────────────────────────────────────
    console.log("Step 1: Loading existing store_product_ids from Supabase…");
    const existingIds = await loadExistingIds();
    console.log(`   Already in DB: ${existingIds.size} rows\n`);

    // ── Step 2: Walk IDs startId…endId ───────────────────────────────────────
    const range = endId - startId + 1;
    console.log(`Step 2: Processing IDs ${startId}–${endId} (${range} total)…\n`);

    const skipped   = [];   // already in DB
    const added     = [];   // successfully inserted
    const notFound  = [];   // 404 from product API
    const failed    = [];   // fetch error or insert error

    for (let id = startId; id <= endId; id++) {
        const padId = String(id).padStart(4);

        // ── Skip if already in DB ──────────────────────────────────────────
        if (existingIds.has(id)) {
            process.stdout.write(`   ${padId}  SKIP  (already in DB)\n`);
            skipped.push(id);
            continue;
        }

        // ── Fetch product API ──────────────────────────────────────────────
        const result = await fetchProduct(id);

        if (result.status === 404) {
            process.stdout.write(`   ${padId}  404   (product does not exist in store)\n`);
            notFound.push(id);
            await sleep(INTER_REQUEST_DELAY_MS);
            continue;
        }

        if (result.status !== 200 || !result.data) {
            process.stdout.write(`   ${padId}  FAIL  (HTTP ${result.status}${result.error ? " – " + result.error : ""})\n`);
            failed.push({ id, reason: `HTTP ${result.status}` });
            await sleep(INTER_REQUEST_DELAY_MS);
            continue;
        }

        // ── Insert into Supabase ───────────────────────────────────────────
        const row = toRow(result.data);
        const insertErr = await insertRow(row);

        if (insertErr) {
            process.stdout.write(`   ${padId}  FAIL  (insert: ${insertErr})\n`);
            failed.push({ id, reason: insertErr });
        } else {
            process.stdout.write(`   ${padId}  ADD   ${row.name}\n`);
            added.push(id);
        }

        await sleep(INTER_REQUEST_DELAY_MS);
    }

    // ── Step 3: Final DB count ────────────────────────────────────────────────
    console.log("\nStep 3: Verifying final Supabase row count…");
    const { count: finalCount, error: countErr } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });

    const finalTotal = countErr ? "unknown" : finalCount;
    if (countErr) console.error("   ❌  Count error:", countErr.message);
    else          console.log(`   Total rows in products table: ${finalTotal}`);

    // ── Summary ───────────────────────────────────────────────────────────────
    const elapsed = ((Date.now() - wallStart) / 1000).toFixed(1);

    console.log("\n════════════════════════════════════════════════════");
    console.log("SUMMARY");
    console.log("════════════════════════════════════════════════════");
    console.log(`   ID range processed      : ${startId} – ${endId} (${range} IDs)`);
    console.log(`   Already in DB (skipped) : ${skipped.length}`);
    console.log(`   New products added      : ${added.length}`);
    console.log(`   Not in store (404)      : ${notFound.length}`);
    console.log(`   Failed (error)          : ${failed.length}`);
    console.log(`   Final DB total          : ${finalTotal}`);
    console.log(`   Runtime                 : ${elapsed}s`);

    if (notFound.length > 0)
        console.log(`\n   404 IDs : ${notFound.join(", ")}`);
    if (failed.length > 0)
        console.log(`\n   Failed IDs : ${failed.map(f => `${f.id}(${f.reason})`).join(", ")}`);
    if (added.length > 0)
        console.log(`\n   Added IDs  : ${added.join(", ")}`);

    console.log("\n✅  Sync complete.\n");
})();
