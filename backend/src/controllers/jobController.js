'use strict';

const { runPriceScraperJob } = require('../jobs/priceScraperJob');

/**
 * In-memory guard — true while a scraper job is in flight.
 * Prevents overlapping runs when cron-job.org fires concurrent requests.
 */
let jobRunning = false;

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
 *
 * The job is started asynchronously so the HTTP response is returned immediately
 * (within the 30-second timeout imposed by cron-job.org).
 */
exports.runScraperJob = (req, res) => {
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

  // Prevent overlapping runs.
  if (jobRunning) {
    console.warn('[JOB-CTRL] Job already running — rejecting duplicate trigger.');
    return res.status(409).json({ error: 'A scraper job is already running.' });
  }

  // Mark as running and fire off the job without awaiting it.
  jobRunning = true;
  console.log('[JOB-CTRL] Authorized trigger received — starting scraper job in background.');

  runPriceScraperJob()
    .then((summary) => {
      console.log('[JOB-CTRL] Background scraper job completed.', summary);
    })
    .catch((error) => {
      console.error('[JOB-CTRL] Background scraper job failed:', error.message);
    })
    .finally(() => {
      jobRunning = false;
    });

  // Respond immediately — well within the 30-second cron-job.org timeout.
  return res.status(202).json({ message: 'Scraper job started' });
};
