/**
 * run_with_db.js
 *
 * Integration layer: runs the existing scraper logic (from scraper-helpers.js,
 * identical to test_scraper.js) and persists every result to Supabase using
 * the existing backend service layer.
 *
 * Usage:
 *   PRODUCT_START=1 PRODUCT_END=3 node run_with_db.js
 *
 * Environment variables (all read from .env or shell):
 *   PRODUCT_START        First product ID to scrape  (default: 1)
 *   PRODUCT_END          Last  product ID to scrape  (default: 3)
 *   MAX_PRODUCT_RETRIES  Full-run retries per product (default: 2)
 *   SCRAPER_HEADLESS     "true" to run headless       (default: false)
 *   SUPABASE_URL         Required for DB writes
 *   SUPABASE_SERVICE_KEY Required for DB writes
 *
 * What it does per product:
 *   1. Upsert a row in `products`          (upsertProductByStoreId)
 *   2. Upsert a row in `tracked_products`  (upsertTrackedProduct)
 *   3. On success → insert into `price_history`
 *   4. Always   → insert into `scrape_logs`
 *
 * test_scraper.js is NOT imported and NOT modified.
 */

"use strict";

const path = require("path");

// Load scraper/.env first; fall back to backend/.env for Supabase credentials.
require("dotenv").config();
if (!process.env.SUPABASE_URL) {
    require("dotenv").config({ path: path.join(__dirname, "../backend/.env"), override: false });
}
const { chromium } = require("playwright");

// ── Scraper helpers (identical logic to test_scraper.js) ─────────────────────
const { scrapeProduct, getProductName } = require("./scraper-helpers");

// ── Supabase service layer (from the existing backend) ───────────────────────
const {
    upsertProductByStoreId,
    upsertTrackedProduct,
    addPriceHistory,
    addScrapeLog
} = require(path.join(__dirname, "../backend/src/services/productService"));


// ============================================================
// CONFIG — all overridable via environment variables
// ============================================================

const BASE_URL           = "https://demo.inelabteamdev.com/product/";
const START_ID           = parseInt(process.env.PRODUCT_START  || "1",  10);
const END_ID             = parseInt(process.env.PRODUCT_END    || "3",  10);
const MAX_PRODUCT_RETRIES = parseInt(process.env.MAX_PRODUCT_RETRIES || "2", 10);
const HEADLESS           = process.env.SCRAPER_HEADLESS === "true";


// ============================================================
// SAFETY GUARD
// Refuse to run without explicit PRODUCT_END to prevent
// accidentally kicking off the full 1000-product run.
// ============================================================

if (!process.env.PRODUCT_END) {
    console.warn("⚠️  PRODUCT_END is not set. Defaulting to 3 products (IDs 1–3).");
    console.warn("    To run more, set PRODUCT_END explicitly.");
    console.warn("    Example: PRODUCT_START=1 PRODUCT_END=10 node run_with_db.js\n");
}

if (END_ID > START_ID + 99) {
    console.error("🛑 PRODUCT_END is more than 100 products ahead of PRODUCT_START.");
    console.error("   To run a large batch, remove this guard from run_with_db.js.");
    console.error("   This guard exists to prevent accidental full-1000 runs.");
    process.exit(1);
}


// ============================================================
// DB WRITE HELPER
// Writes product/tracked rows once, then writes price_history
// and scrape_log. Safe to call on failure (price may be null).
//
// stock shape (may be null on failure):
//   { status: "in_stock"|"out_of_stock"|"unknown", quantity: number|null, rawText: string|null }
// ============================================================

async function persistResult(storeProductId, productName, price, stock, attemptNumber, errorMessage) {

    // Normalise stock arg — callers may pass null on failure
    const stockStatus   = stock?.status   ?? "unknown";
    const stockQuantity = stock?.quantity ?? null;
    const stockRaw      = stock?.rawText  ?? null;

    // 1. Ensure the product row exists.
    let product;
    try {
        product = await upsertProductByStoreId(storeProductId, BASE_URL, productName);
    } catch (err) {
        console.error(`   [DB] ❌ upsertProductByStoreId failed for ${storeProductId}: ${err.message}`);
        return;
    }

    // 2. Ensure the tracked_products row exists.
    let tracked;
    try {
        tracked = await upsertTrackedProduct(product.id);
    } catch (err) {
        console.error(`   [DB] ❌ upsertTrackedProduct failed for ${storeProductId}: ${err.message}`);
        return;
    }

    const trackedId    = tracked.id;
    const now          = new Date().toISOString();
    const scrapeStatus = price ? "success" : "failed";

    // Build a human-readable observed_stock string for the log.
    // Examples: "in_stock (qty=84)", "out_of_stock (qty=0)", "unknown"
    let observedStockText = stockStatus;
    if (stockQuantity !== null) observedStockText += ` (qty=${stockQuantity})`;
    else if (stockRaw) observedStockText += ` — "${stockRaw}"`;

    // 3. Always write a scrape_log entry.
    try {
        await addScrapeLog({
            tracked_product_id: trackedId,
            attempt_timestamp:  now,
            attempt_number:     attemptNumber,
            status:             scrapeStatus,
            error_message:      errorMessage || null,
            observed_price:     price ? parseFloat(price.replace(/[^0-9.]/g, "")) : null,
            observed_stock:     observedStockText,
            stock_quantity:     stockQuantity,
        });
        console.log(`   [DB] ✅ scrape_log written (status=${scrapeStatus}, stock=${observedStockText})`);
    } catch (err) {
        console.error(`   [DB] ❌ addScrapeLog failed: ${err.message}`);
    }

    // 4. On success, write price_history.
    if (price) {
        try {
            const numericPrice = parseFloat(price.replace(/[^0-9.]/g, ""));
            await addPriceHistory({
                tracked_product_id: trackedId,
                price:              numericPrice,
                stock_status:       stockStatus,
                stock_quantity:     stockQuantity,
                scraped_at:         now,
            });
            console.log(`   [DB] ✅ price_history written (price=${numericPrice}, stock=${stockStatus}, qty=${stockQuantity})`);
        } catch (err) {
            console.error(`   [DB] ❌ addPriceHistory failed: ${err.message}`);
        }
    }
}


// ============================================================
// MAIN
// ============================================================

(async () => {

    console.log("========================================");
    console.log("🚀 INE PRICE SCRAPER  →  DATABASE");
    console.log("========================================");
    console.log(`📋 Product range : ${START_ID} – ${END_ID}`);
    console.log(`🔁 Max retries   : ${MAX_PRODUCT_RETRIES}`);
    console.log(`👁  Headless      : ${HEADLESS}`);
    console.log("========================================\n");


    // ── Launch browser ───────────────────────────────────────
    const browser = await chromium.launch({
        headless: HEADLESS,
        slowMo:   0
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });

    const page = await context.newPage();

    // Basic error listeners (same as test_scraper.js).
    page.on("requestfailed", req =>
        console.log("❌ REQUEST FAILED:", req.url(), req.failure()?.errorText)
    );
    page.on("pageerror", err =>
        console.log("❌ PAGE ERROR:", err.message)
    );


    // ── Results accumulator ──────────────────────────────────
    const results = [];


    // ── Product loop ─────────────────────────────────────────
    for (let productId = START_ID; productId <= END_ID; productId++) {

        console.log("\n############################################################");
        console.log(`############ PRODUCT ${productId} / ${END_ID} ############`);
        console.log("############################################################");

        let finalPrice = null;
        let finalStock = null;
        let finalName = null;
        let finalAttempt = MAX_PRODUCT_RETRIES;

        for (let run = 1; run <= MAX_PRODUCT_RETRIES; run++) {

            console.log(`\n🔁 PRODUCT ${productId} — COMPLETE RUN ${run}/${MAX_PRODUCT_RETRIES}`);
            console.log("------------------------------------------------------------");

            // ── Core scrape — returns { price, stock } or null ──────────────
            const scrapeResult = await scrapeProduct(page, productId, BASE_URL);
            finalAttempt = run;
            // Capture the real product name from the page that scrapeProduct loaded.
            const scrapedName = await getProductName(page);

            if (scrapeResult && scrapeResult.price) {
                finalPrice = scrapeResult.price;
                finalStock = scrapeResult.stock ?? null;
                results.push({
                    productId,
                    price:         finalPrice,
                    stockStatus:   finalStock?.status   ?? "unknown",
                    stockQuantity: finalStock?.quantity ?? null,
                    status:        "SUCCESS",
                    attempts:      run,
                });
                console.log(`\n✅ PRODUCT ${productId} COMPLETED`);
                console.log(`💰 ${finalPrice}`);
                console.log(`📦 stock=${finalStock?.status ?? "unknown"}, qty=${finalStock?.quantity ?? "—"}`);
                console.log(`🔁 Complete runs used: ${run}`);
                finalName = scrapedName;
                break;
            }

            console.log(`\n⚠️ PRODUCT ${productId} failed complete run ${run}/${MAX_PRODUCT_RETRIES}`);
            // Keep the best name we got even if pricing failed.
            if (scrapedName && !finalName) finalName = scrapedName;

            if (run < MAX_PRODUCT_RETRIES) {
                console.log(`🔄 Starting a COMPLETELY FRESH run for product ${productId}...`);
                await page.waitForTimeout(300);
            }
        }

        if (!finalPrice) {
            results.push({ productId, price: null, stockStatus: "unknown", stockQuantity: null, status: "FAILED", attempts: finalAttempt });
            console.log(`\n❌ PRODUCT ${productId} PERMANENTLY FAILED`);
        }

        // ── Persist to DB ─────────────────────────────────────
        const errorMsg = finalPrice ? null : "All scrape attempts failed";
        await persistResult(productId, finalName, finalPrice, finalStock, finalAttempt, errorMsg);


        // ── Progress snapshot every 10 products ──────────────
        if (productId % 10 === 0 || productId === END_ID) {
            const successful = results.filter(r => r.status === "SUCCESS").length;
            const failed     = results.filter(r => r.status === "FAILED").length;
            console.log("\n============================================================");
            console.log(`📊 PROGRESS: ${productId}/${END_ID}`);
            console.log(`   ✅ Success: ${successful}`);
            console.log(`   ❌ Failed:  ${failed}`);
            console.log("============================================================");
        }
    }


    // ── Final summary ─────────────────────────────────────────
    console.log("\n\n============================================================");
    console.log("🏁 SCRAPING + DB WRITE COMPLETED");
    console.log("============================================================");

    const successful = results.filter(r => r.status === "SUCCESS");
    const failed     = results.filter(r => r.status === "FAILED");

    console.log(`\n📦 Total products : ${results.length}`);
    console.log(`✅ Successful     : ${successful.length}`);
    console.log(`❌ Failed         : ${failed.length}`);

    console.log("\n📋 RESULTS:");
    for (const r of results) {
        if (r.status === "SUCCESS") {
            console.log(`  Product ${r.productId}: ${r.price} | stock=${r.stockStatus}, qty=${r.stockQuantity ?? "—"} | attempts=${r.attempts}`);
        } else {
            console.log(`  Product ${r.productId}: FAILED | attempts=${r.attempts}`);
        }
    }


    // ── Save local JSON (same as test_scraper.js) ─────────────
    const fs = require("fs");
    try {
        fs.writeFileSync(
            path.join(__dirname, "run_with_db_results.json"),
            JSON.stringify(results, null, 2)
        );
        console.log("\n💾 Results saved to run_with_db_results.json");
    } catch (err) {
        console.warn("\n⚠️ Could not save results JSON:", err.message);
    }


    // ── Close browser ─────────────────────────────────────────
    console.log("\n🔒 Closing browser...");
    await browser.close();
    console.log("✅ Done.");

})();
