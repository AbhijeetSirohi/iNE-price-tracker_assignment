-- 01_initial_schema.sql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: products
-- Caches the catalog from the mock store
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_product_id INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    slug TEXT,
    brand TEXT,
    category TEXT,
    sku TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: tracked_products
-- Products selected by the user for tracking
CREATE TABLE IF NOT EXISTS public.tracked_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_tracked_products_product_id UNIQUE(product_id)
);

-- Table: price_history
-- Valid price and stock observations from successful scrapes
CREATE TABLE IF NOT EXISTS public.price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracked_product_id UUID NOT NULL REFERENCES public.tracked_products(id) ON DELETE CASCADE,
    price NUMERIC NOT NULL,
    stock_status TEXT NOT NULL,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: scrape_logs
-- Record of every scrape attempt (status is 'success' or 'failed')
CREATE TABLE IF NOT EXISTS public.scrape_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracked_product_id UUID NOT NULL REFERENCES public.tracked_products(id) ON DELETE CASCADE,
    attempt_timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    error_message TEXT,
    observed_price NUMERIC,
    observed_stock TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_store_product_id ON public.products(store_product_id);
CREATE INDEX IF NOT EXISTS idx_tracked_products_product_id ON public.tracked_products(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_tracked_product_id ON public.price_history(tracked_product_id);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_tracked_product_id ON public.scrape_logs(tracked_product_id);
