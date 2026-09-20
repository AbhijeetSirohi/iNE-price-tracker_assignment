'use strict';

/**
 * priceScraperJob.js
 *
 * Fetches all active tracked_products and runs the scraper on each one.
 * Called by the cron scheduler (every 2 hours) and by the manual trigger endpoint.
 *
 * Does NOT modify any scraper logic — only orchestrates existing services.
 */

const productService = require('../services/productService');
const scraperService = require('../services/scraperService');

/**
 * Run the full scrape job.
 * @returns {Promise<{processed: number, successes: number, failures: number, priceHistoryRows: number, scrapeLogRows: number, details: Array}>}
 */
async function runPriceScraperJob() {
  const jobStart = new Date().toISOString();
  console.log(`\n[PRICE-JOB] ===== Starting price scraper job at ${jobStart} =====`);

  // 1. Fetch only active tracked products (with product join)
  const allTracked = await productService.getTrackedProducts();
  const activeTracked = allTracked.filter(t => t.is_active === true);

  console.log(`[PRICE-JOB] ${activeTracked.length} active tracked product(s) found.`);

  const details = [];
  let successes = 0;
  let failures  = 0;

  // 2. Process each product independently — one failure must not stop the rest
  for (const trackedProduct of activeTracked) {
    const productName = trackedProduct.products?.name ?? `id:${trackedProduct.id}`;
    console.log(`\n[PRICE-JOB] → Scraping "${productName}" (tracked_id=${trackedProduct.id})`);

    try {
      const result = await scraperService.scrapeProduct(trackedProduct);

      if (result && result.success) {
        successes++;
        console.log(`[PRICE-JOB] ✅ Success — price: ${result.price}, stock: ${result.stockStatus}, qty: ${result.stockQuantity ?? '—'}`);
      } else {
        failures++;
        console.log(`[PRICE-JOB] ⚠️  Scrape returned failure — ${result?.error}`);
      }

      details.push({
        trackedId:     trackedProduct.id,
        productName,
        success:       result?.success       ?? false,
        price:         result?.price         ?? null,
        stockStatus:   result?.stockStatus   ?? null,
        stockQuantity: result?.stockQuantity ?? null,
        error:         result?.error         ?? null,
      });

    } catch (err) {
      // Unexpected error (e.g. DB write failed) — log and continue
      failures++;
      console.error(`[PRICE-JOB] ❌ Unexpected error for "${productName}": ${err.message}`);
      details.push({
        trackedId:     trackedProduct.id,
        productName,
        success:       false,
        price:         null,
        stockStatus:   null,
        stockQuantity: null,
        error:         err.message,
      });
    }
  }

  // 3. Tally rows written in this run
  //    scrapeProduct() writes exactly 1 scrape_log per attempt and 1 price_history on success,
  //    so we derive counts from our result details rather than extra DB round-trips.
  const priceHistoryRows = successes;          // 1 row per successful scrape
  const scrapeLogRows    = activeTracked.length; // at least 1 log per product (may be more on retry)

  const summary = {
    processed:       activeTracked.length,
    successes,
    failures,
    priceHistoryRows,
    scrapeLogRows,
    details,
  };

  console.log('\n[PRICE-JOB] ===== Job complete =====');
  console.log(`[PRICE-JOB] Processed:         ${summary.processed}`);
  console.log(`[PRICE-JOB] Successes:         ${summary.successes}`);
  console.log(`[PRICE-JOB] Failures:          ${summary.failures}`);
  console.log(`[PRICE-JOB] price_history rows: ${summary.priceHistoryRows}`);
  console.log(`[PRICE-JOB] scrape_logs rows:   ${summary.scrapeLogRows} (minimum; retries add more)`);
  console.log('[PRICE-JOB] ============================\n');

  return summary;
}

module.exports = { runPriceScraperJob };
