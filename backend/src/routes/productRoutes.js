const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const jobController = require('../controllers/jobController');

// Search catalog
router.get('/products/search', productController.searchProducts);

// Tracked products management
router.get('/tracked-products', productController.getTrackedProducts);
router.post('/tracked-products', productController.trackProduct);
router.delete('/tracked-products/:id', productController.untrackProduct);

// History and logs
router.get('/tracked-products/:id/history', productController.getProductHistory);
router.get('/tracked-products/:id/logs', productController.getProductLogs);

// Manual trigger
router.post('/tracked-products/:id/scrape', productController.triggerScrape);

// Job endpoints
router.post('/jobs/run-scraper', jobController.runScraperJob);

module.exports = router;
