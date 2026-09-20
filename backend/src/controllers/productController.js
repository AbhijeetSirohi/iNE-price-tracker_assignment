const productService = require('../services/productService');
const scraperService = require('../services/scraperService');

exports.searchProducts = async (req, res) => {
  try {
    const query = req.query.q || '';
    const products = await productService.searchProducts(query);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTrackedProducts = async (req, res) => {
  try {
    const tracked = await productService.getTrackedProducts();
    res.json(tracked);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.trackProduct = async (req, res) => {
  try {
    const { storeProductId } = req.body;
    if (!storeProductId) {
      return res.status(400).json({ error: 'storeProductId is required' });
    }
    const tracked = await productService.trackProduct(storeProductId);
    res.status(201).json(tracked);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.untrackProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await productService.untrackProduct(id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProductHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const history = await productService.getProductHistory(id);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProductLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await productService.getProductLogs(id);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.triggerScrape = async (req, res) => {
  try {
    const { id } = req.params; // tracked_product_id
    
    // First we need to get the product details
    const trackedList = await productService.getTrackedProducts();
    const tracked = trackedList.find(t => t.id === id);
    
    if (!tracked) {
      return res.status(404).json({ error: 'Tracked product not found' });
    }

    const product = tracked.products;
    
    // Trigger the scraper boundary service (handles its own logging and retries)
    const scrapeResult = await scraperService.scrapeProduct(tracked);

    res.json({
      message: 'Scrape triggered',
      result: scrapeResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
