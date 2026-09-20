/**
 * sync_catalog.js
 *
 * Fetches every product from the INE catalog API and upserts them into the
 * Supabase `products` table.  Safe to run repeatedly — uses onConflict so
 * existing rows are updated, not duplicated.
 *
 * Usage:
 *   node sync_catalog.js
 *
 * Environment (read from scraper/.env, falls back to backend/.env):
 *   SUPABASE_URL         - required
 *   SUPABASE_SERVICE_KEY - required
 */

"use strict";

const path = require("path");

// ── Load env: scraper/.env first, then backend/.env as fallback ───────────────
require("dotenv").config();
if (!process.env.SUPABASE_URL) {
    require("dotenv").config({
        path: path.join(__dirname, "../backend/.env"),
        override: false,
    });
}

const { createClient } = require("@supabase/supabase-js");

// ── Validate env ──────────────────────────────────────────────────────────────
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("❌  SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.");
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ── Constants ─────────────────────────────────────────────────────────────────
const CATALOG_BASE = "https://demo.inelabteamdev.com/api/catalog";
const PRODUCT_BASE = "https://demo.inelabteamdev.com/product/";

// Rows per upsert batch — keeps individual requests small.
const UPSERT_BATCH_SIZE = 50;

// Pause between page fetches (ms) — avoids hammering the catalog API.
const PAGE_DELAY_MS = 150;

// ── Helper: sleep ─────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Helper: fetch one catalog page with basic retry ───────────────────────────
async function fetchPage(pageNum, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(`${CATALOG_BASE}?page=${pageNum}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            if (attempt === maxAttempts) throw err;
            console.warn(`   ⚠️  Page ${pageNum} attempt ${attempt} failed (${err.message}), retrying…`);
            await sleep(500 * attempt);
        }
    }
}

// ── Helper: upsert a batch of rows into `products` ────────────────────────────
// Deduplicates by store_product_id first — the catalog API occasionally returns
// the same product on multiple pages, which would cause a Postgres conflict
// ("ON CONFLICT DO UPDATE command cannot affect row a second time").
async function upsertBatch(rows) {
    const seen  = new Map();
    for (const row of rows) seen.set(row.store_product_id, row); // last write wins
    const deduped = Array.from(seen.values());

    const { error } = await supabase
        .from("products")
        .upsert(deduped, { onConflict: "store_product_id" });
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
    return deduped.length;
}

// ── Map a catalog item to a products row ──────────────────────────────────────
function toRow(item) {
    return {
        store_product_id: item.id,
        name:             item.name,
        slug:             item.slug        ?? null,
        brand:            item.brand       ?? null,
        category:         item.category    ?? null,
        sku:              item.sku         ?? null,
        description:      item.description ?? null,
        url:              `${PRODUCT_BASE}${item.id}`,
    };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    const startTime = Date.now();

    console.log("════════════════════════════════════════");
    console.log("📦  INE CATALOG SYNC");
    console.log("════════════════════════════════════════\n");

    // ── Step 1: Fetch page 1 to learn the total page count ────────────────────
    console.log("🔍  Fetching page 1 to determine catalog size…");
    const firstPage = await fetchPage(1);
    const totalPages    = firstPage.pages;
    const totalProducts = firstPage.total;

    console.log(`   pages    : ${totalPages}`);
    console.log(`   pageSize : ${firstPage.pageSize}`);
    console.log(`   total    : ${totalProducts}\n`);

    // ── Step 2: Walk every page and collect all rows ──────────────────────────
    const allRows = new Map();   // store_product_id → row (dedup globally)
    let totalFetched  = 0;
    let errors = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        process.stdout.write(`   Page ${String(pageNum).padStart(2)} / ${totalPages}  `);

        let data;
        if (pageNum === 1) {
            data = firstPage;            // already fetched above
        } else {
            try {
                data = await fetchPage(pageNum);
            } catch (err) {
                console.log(`❌  FAILED — ${err.message}`);
                errors++;
                continue;
            }
        }

        const rows = (data.items ?? []).map(toRow);
        for (const row of rows) allRows.set(row.store_product_id, row);
        totalFetched += rows.length;
        process.stdout.write(`✓ (${rows.length} items, ${totalFetched} fetched, ${allRows.size} unique)\n`);

        // Short pause to be polite to the API (skip on last page)
        if (pageNum < totalPages) await sleep(PAGE_DELAY_MS);
    }

    // ── Step 3: Upsert in batches ─────────────────────────────────────────────
    const uniqueRows  = Array.from(allRows.values());
    let totalUpserted = 0;
    console.log(`\n📤  Upserting ${uniqueRows.length} unique products to Supabase…`);

    for (let i = 0; i < uniqueRows.length; i += UPSERT_BATCH_SIZE) {
        const batch = uniqueRows.slice(i, i + UPSERT_BATCH_SIZE);
        const n = await upsertBatch(batch);
        totalUpserted += n;
        process.stdout.write(`   Upserted ${totalUpserted} / ${uniqueRows.length}\r`);
    }
    process.stdout.write("\n");

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n════════════════════════════════════════");
    console.log("✅  SYNC COMPLETE");
    console.log("════════════════════════════════════════");
    console.log(`   Pages processed   : ${totalPages - errors} / ${totalPages}`);
    console.log(`   Products fetched  : ${totalFetched}`);
    console.log(`   Unique products   : ${uniqueRows.length}`);
    console.log(`   Products upserted : ${totalUpserted}`);
    if (errors > 0) console.log(`   Page errors       : ${errors}`);
    console.log(`   Runtime           : ${elapsed}s\n`);

    // ── Step 4: Post-run DB verification ──────────────────────────────────────
    console.log("🔎  Verifying Supabase…");

    const { count: dbCount, error: countErr } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });

    if (countErr) {
        console.error("   ❌  Could not read product count:", countErr.message);
    } else {
        console.log(`   Total rows in products table : ${dbCount}`);
    }

    const { count: uniqueCount, error: uniqErr } = await supabase
        .from("products")
        .select("store_product_id", { count: "exact", head: true });

    if (!uniqErr) {
        console.log(`   Unique store_product_id rows : ${uniqueCount}`);
    }

    console.log("\n✅  Done.");
})();
