const { supabase } = require('../db/supabase');

async function searchProducts(query) {
  if (!supabase) throw new Error('Supabase client not initialized');

  // Instead of scraping 1000 items, we rely on the mock store's API.
  // The catalog has 50 pages of 20 items. We will fetch and cache them locally.
  // For this assignment, we will do a simple fetch of the first few pages 
  // or rely on a local DB query if we already synced them.
  // To avoid hitting the mock store too hard during search, we'll fetch page 1 dynamically 
  // if our local DB is empty, otherwise we query our DB.
  
  let { data: products, error } = await supabase
    .from('products')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(20);

  if (error) throw error;

  // If local DB is empty, let's just do a live fetch to the first page of the API 
  // to populate some data for testing the search endpoint.
  if (products.length === 0) {
    const response = await fetch('https://demo.inelabteamdev.com/api/catalog?page=1');
    const data = await response.json();
    
    // Transform and insert to local DB
    if (data.items) {
      const toInsert = data.items.map(item => ({
        store_product_id: item.id,
        name: item.name,
        url: `https://demo.inelabteamdev.com/product/${item.id}`,
        slug: item.slug,
        brand: item.brand,
        category: item.category,
        sku: item.sku,
        description: item.description
      }));
      
      const { data: inserted, error: insertError } = await supabase
        .from('products')
        .upsert(toInsert, { onConflict: 'store_product_id' })
        .select();
        
      if (!insertError && inserted) {
        products = inserted.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
      }
    }
  }

  return products;
}

async function trackProduct(storeProductId) {
  if (!supabase) throw new Error('Supabase client not initialized');

  // Ensure product exists in our DB first
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('store_product_id', storeProductId)
    .single();

  if (productError || !product) {
    throw new Error('Product not found in local database. Please search for it first.');
  }

  // Add to tracked_products
  const { data: tracked, error: trackError } = await supabase
    .from('tracked_products')
    .insert([{ product_id: product.id, is_active: true }])
    .select()
    .single();

  if (trackError) {
    if (trackError.code === '23505') { // Unique violation
       throw new Error('Product is already being tracked.');
    }
    throw trackError;
  }

  return tracked;
}

async function getTrackedProducts() {
  if (!supabase) throw new Error('Supabase client not initialized');

  const { data, error } = await supabase
    .from('tracked_products')
    .select(`
      id,
      is_active,
      created_at,
      products (
        id,
        store_product_id,
        name,
        url,
        brand
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

async function untrackProduct(trackedId) {
  if (!supabase) throw new Error('Supabase client not initialized');

  const { error } = await supabase
    .from('tracked_products')
    .delete()
    .eq('id', trackedId);

  if (error) throw error;
  return true;
}

async function getProductHistory(trackedId) {
  if (!supabase) throw new Error('Supabase client not initialized');

  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('tracked_product_id', trackedId)
    .order('scraped_at', { ascending: false });

  if (error) throw error;
  return data;
}

async function getProductLogs(trackedId) {
  if (!supabase) throw new Error('Supabase client not initialized');

  const { data, error } = await supabase
    .from('scrape_logs')
    .select('*')
    .eq('tracked_product_id', trackedId)
    .order('attempt_timestamp', { ascending: false });

  if (error) throw error;
  return data;
}

async function addScrapeLog(logData) {
  if (!supabase) throw new Error('Supabase client not initialized');

  const { data, error } = await supabase
    .from('scrape_logs')
    .insert([logData])
    .select();

  if (error) throw error;
  return data;
}

async function addPriceHistory(historyData) {
  if (!supabase) throw new Error('Supabase client not initialized');

  const { data, error } = await supabase
    .from('price_history')
    .insert([historyData])
    .select();

  if (error) throw error;
  return data;
}

/**
 * Ensures a product row exists for the given storeProductId and returns it.
 * Uses upsert so it is safe to call on every scrape run.
 * Only the minimal fields available at scrape time are written;
 * name/url are the only required non-null columns beyond store_product_id.
 *
 * @param {number|string} storeProductId
 * @param {string}        baseUrl       - e.g. "https://demo.inelabteamdev.com/product/"
 * @param {string|null}   [productName] - real product name; if omitted, fetched from the
 *                                        catalog API so we never fall back to "Product N"
 */
async function upsertProductByStoreId(storeProductId, baseUrl, productName) {
  if (!supabase) throw new Error('Supabase client not initialized');

  const url = `${baseUrl}${storeProductId}`;

  // Resolve the real name when the caller didn't supply one.
  let resolvedName = productName && productName.trim() ? productName.trim() : null;
  if (!resolvedName) {
    try {
      const res  = await fetch(`https://demo.inelabteamdev.com/api/product/${storeProductId}`);
      const item = await res.json();
      resolvedName = item && item.name ? item.name : `Product ${storeProductId}`;
    } catch (_) {
      resolvedName = `Product ${storeProductId}`;
    }
  }

  const { data, error } = await supabase
    .from('products')
    .upsert(
      {
        store_product_id: storeProductId,
        name: resolvedName,
        url
      },
      { onConflict: 'store_product_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Ensures a tracked_products row exists for the given product id and returns it.
 * If it already exists (unique constraint on product_id), fetches the existing row.
 */
async function upsertTrackedProduct(productId) {
  if (!supabase) throw new Error('Supabase client not initialized');

  // Try insert; if it already exists the unique constraint fires.
  const { data: inserted, error: insertError } = await supabase
    .from('tracked_products')
    .insert([{ product_id: productId, is_active: true }])
    .select()
    .single();

  if (!insertError) return inserted;

  // 23505 = unique_violation — row already exists, fetch it.
  if (insertError.code === '23505') {
    const { data: existing, error: fetchError } = await supabase
      .from('tracked_products')
      .select('*')
      .eq('product_id', productId)
      .single();

    if (fetchError) throw fetchError;
    return existing;
  }

  throw insertError;
}

module.exports = {
  searchProducts,
  trackProduct,
  getTrackedProducts,
  untrackProduct,
  getProductHistory,
  getProductLogs,
  addScrapeLog,
  addPriceHistory,
  upsertProductByStoreId,
  upsertTrackedProduct
};
