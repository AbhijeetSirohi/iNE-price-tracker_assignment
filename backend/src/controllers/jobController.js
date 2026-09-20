'use strict';

const { runPriceScraperJob } = require('../jobs/priceScraperJob');

/**
 * POST /api/jobs/run-scraper
 *
 * Triggers the price scraper job immediately.
 * Used by two callers:
 *   1. cron-job.org (production) — hits this endpoint on a schedule with the secret header.
 *   2. Manual / local testing — same call, same header.
 *
 * Authentication:
 *   Requires header  X-Cron-Secret: <value of CRON_SECRET env var>
 *   If CRON_SECRET is not set the endpoint is disabled entirely (returns 503)
 *   so a misconfigured production deploy fails loudly rather than silently open.
 */
exports.runScraperJob = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;

  // Hard-fail if the secret is not configured — prevents accidental open access.
  if (!cronSecret) {
    console.error('[JOB-CTRL] CRON_SECRET env var is not set. Endpoint disabled.');
    return res.status(503).json({
      error: 'Endpoint not configured: CRON_SECRET env var is missing on this server.',
    });
  }

  // Constant-time string comparison is not critical here (no timing oracle on HTTP),
  // but we keep it simple and explicit.
  const provided = req.headers['x-cron-secret'];
  if (!provided || provided !== cronSecret) {
    console.warn('[JOB-CTRL] Unauthorized trigger attempt — bad or missing X-Cron-Secret header.');
    return res.status(401).json({ error: 'Unauthorized: invalid or missing X-Cron-Secret header.' });
  }

  try {
    console.log('[JOB-CTRL] Authorized trigger received via POST /api/jobs/run-scraper');
    const summary = await runPriceScraperJob();
    res.json({ message: 'Job completed', summary });
  } catch (error) {
    console.error('[JOB-CTRL] Job failed with unexpected error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
