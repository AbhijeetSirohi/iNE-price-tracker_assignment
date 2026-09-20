-- 02_add_stock_quantity.sql
--
-- Adds a numeric stock_quantity column to price_history and scrape_logs.
-- The column is nullable — NULL means "not scraped" or "no quantity visible"
-- (e.g. generic "In stock" text with no count, or a failed scrape attempt).
--
-- Run this migration once against your Supabase project:
--   Project → SQL Editor → paste and execute.
--
-- Safe to run multiple times: each ALTER uses IF NOT EXISTS.

-- price_history: store the scraped quantity alongside the status text
ALTER TABLE public.price_history
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER;

-- scrape_logs: store the scraped quantity alongside the observed_stock text
ALTER TABLE public.scrape_logs
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER;

-- Optional indexes for querying low/zero stock across time
CREATE INDEX IF NOT EXISTS idx_price_history_stock_quantity
    ON public.price_history (stock_quantity);

CREATE INDEX IF NOT EXISTS idx_scrape_logs_stock_quantity
    ON public.scrape_logs (stock_quantity);
