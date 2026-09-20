require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const productRoutes = require('./src/routes/productRoutes');
const { runPriceScraperJob } = require('./src/jobs/priceScraperJob');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register API routes
app.use('/api', productRoutes);

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);

  // ── Scheduled price scraper: every 2 hours ──────────────────────────────
  // LOCAL / DEVELOPMENT ONLY.
  // In production (Render free tier) the dyno may sleep, so the authoritative
  // schedule is driven by cron-job.org, which calls:
  //   POST <backend-url>/api/jobs/run-scraper
  //   Header: X-Cron-Secret: <CRON_SECRET>
  // This local cron remains active so the job still runs during local dev
  // without needing an external service.
  // Cron expression: minute=0, every 2nd hour  →  "0 */2 * * *"
  cron.schedule('0 */2 * * *', () => {
    console.log('[CRON] Firing scheduled price scraper job (local node-cron)...');
    runPriceScraperJob().catch(err =>
      console.error('[CRON] Unhandled error in price scraper job:', err.message)
    );
  });

  console.log('[CRON] Local price scraper scheduled — runs every 2 hours (0 */2 * * *)');
  console.log('[CRON] Production scheduling: use cron-job.org → POST /api/jobs/run-scraper with X-Cron-Secret header');
});
