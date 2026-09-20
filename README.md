# INE Product Price Tracker

A full-stack product price & stock tracking platform built for the **INE Software Engineer Intern Assignment**.

The application lets users search products from the INE demo storefront, track selected products, collect price and stock observations, and inspect historical data and scraping logs.

---

## 🚀 Live Demo

| | |
|---|---|
| **Frontend** | `https://i-ne-price-tracker-assignment.vercel.app` |
| **Backend** | `https://ine-price-tracker-assignment.onrender.com` |
| **Database** | Supabase PostgreSQL |
| **Scheduler** | cron-job.org |

---

## ✨ What It Does

### 🔎 Product Search

Search the product catalog and find products by name.

### 📌 Track Products

Add products to your tracking dashboard and remove them whenever required.

### 💰 Price Tracking

The scraper retrieves the current product price and stores every successful observation in the database, allowing price history to be viewed over time.

### 📦 Stock Tracking

Stock information is extracted along with the price.

The application supports:

- In-stock products with quantity
- Out-of-stock products
- Unknown/unavailable stock information

### 📊 History

Each tracked product has a historical view containing:

- Timestamp
- Price
- Stock status
- Stock quantity

### 🧾 Scrape Logs

Every scraping attempt is logged with its outcome.

This makes failures observable instead of silently treating them as successful scrapes.

### ⚡ Manual Scraping

A tracked product can be scraped on demand directly from the application.

### ⏰ Automated Scraping

Tracked products are automatically scraped every **2 hours** using an external cron service.

---

# 🏗️ Architecture

```text
                         ┌──────────────────────┐
                         │      User / Browser  │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   React + Vite       │
                         │      Frontend        │
                         │       Vercel         │
                         └──────────┬───────────┘
                                    │ REST API
                                    ▼
                         ┌──────────────────────┐
                         │   Node.js + Express  │
                         │       Backend        │
                         │        Render        │
                         └───────┬───────┬──────┘
                                 │       │
                    ┌────────────┘       └──────────────┐
                    ▼                                   ▼
          ┌──────────────────┐                ┌──────────────────┐
          │ Supabase         │                │ Playwright       │
          │ PostgreSQL       │                │ Scraper          │
          │                  │                │                  │
          │ products         │                │ Price            │
          │ tracked_products │                │ Stock            │
          │ price_history    │                │ Retry handling   │
          │ scrape_logs      │                └────────┬─────────┘
          └──────────────────┘                         │
                                                       ▼
                                            ┌────────────────────┐
                                            │ INE Demo Storefront│
                                            └────────────────────┘


                    Automated execution
                    ───────────────────

                    cron-job.org
                         │
                         │ POST + X-Cron-Secret
                         ▼
                /api/jobs/run-scraper
                         │
                         ▼
                  Background Job
                         │
                         ▼
                   Playwright
🛠️ Tech Stack
Layer	Technology
Frontend	React + Vite
Backend	Node.js + Express
Database	Supabase PostgreSQL
Scraping	Playwright
Scheduling	cron-job.org
Frontend Hosting	Vercel
Backend Hosting	Render
Version Control	Git + GitHub
🕷️ Scraping Pipeline

The scraper interacts with the storefront through a real browser using Playwright.

Open Product
     │
     ▼
Handle Cookie Banner
     │
     ▼
Move Mouse / Trigger Page Interaction
     │
     ▼
Find "Reveal Price"
     │
     ▼
Wait Until Button Is Enabled
     │
     ▼
Click Reveal Price
     │
     ▼
Wait For Revealed Data
     │
     ├───────────────┐
     ▼               ▼
Extract Price    Extract Stock
     │               │
     └───────┬───────┘
             ▼
      Validate Result
             │
        ┌────┴────┐
        │         │
      Success    Failure
        │         │
        ▼         ▼
   Save Data   Retry / Log
        │
        ▼
    Scrape Log

The scraper does not depend on a single fixed DOM structure for the revealed price or stock information.

Instead, it searches multiple relevant structures and normalizes the extracted result.

🔐 Reliability & Failure Handling

Reliability was a major part of the implementation because the target storefront contains asynchronous interactions and the price reveal process is not immediately available.

Reveal Price Handling

The scraper:

Locates the Reveal Price button dynamically.
Moves the mouse when required by the page interaction.
Waits for the button to become enabled.
Clicks the button.
Waits for the actual revealed price rather than assuming that the click immediately produced a result.
Price Extraction

The revealed price can appear in different nested DOM structures.

The scraper therefore extracts and evaluates candidate elements rather than relying on one exact HTML structure.

Stock Extraction

Stock information can also appear in different locations and formats.

Examples handled include:

IN STOCK · 190 LEFT
SELLING FAST — 33 LEFT
HURRY, JUST 179 LEFT
ONLY 96 LEFT
OUT OF STOCK

These are normalized into a consistent representation:

status: in_stock | out_of_stock | unknown
quantity: number | null
Retries

If scraping fails for a product, the scraper retries the same product rather than silently moving on.

The configured maximum retry count is:

MAX_PRODUCT_RETRIES=2
Honest Failure Recording

A failed scrape is not stored as a fake price.

Instead, the attempt is recorded in scrape_logs so that failures remain visible and debuggable.

⏱️ Scheduled Scraping

Production scraping is triggered by cron-job.org every 2 hours.

The scheduler sends:

POST /api/jobs/run-scraper
X-Cron-Secret: <CRON_SECRET>

The endpoint responds immediately with:

{
  "message": "Scraper job started"
}

with HTTP:

202 Accepted

The actual scraping job continues in the background.

This design prevents the external scheduler from timing out while a multi-product scraping job is still running.

The backend also prevents multiple scraper jobs from running concurrently.

🗄️ Database Design

The application uses four primary tables:

products
    │
    └── tracked_products
             │
             ├── price_history
             │
             └── scrape_logs
products

Stores the product catalog and product metadata.

tracked_products

Stores products currently being monitored.

price_history

Stores successful price and stock observations over time.

scrape_logs

Stores individual scraping attempts and their outcomes.

This separation allows historical data and scraper reliability to be analyzed independently.

🔌 API
Method	Endpoint	Purpose
GET	/api/health	Backend health check
GET	/api/products/search?q=	Search products
GET	/api/tracked-products	Get tracked products
POST	/api/tracked-products	Track a product
DELETE	/api/tracked-products/:id	Stop tracking
GET	/api/tracked-products/:id/history	Get price/stock history
GET	/api/tracked-products/:id/logs	Get scrape logs
POST	/api/tracked-products/:id/scrape	Trigger manual scrape
POST	/api/jobs/run-scraper	Start scheduled scraper

The scheduled scraper endpoint is protected using X-Cron-Secret.

⚙️ Local Development
Prerequisites
Node.js 18+
npm
Supabase project
Playwright-compatible browser
1. Clone
git clone https://github.com/AbhijeetSirohi/iNE-price-tracker_assignment.git
cd iNE-price-tracker_assignment
2. Backend
cd backend
npm install
npm run dev

Create backend/.env:

SUPABASE_URL=
SUPABASE_SERVICE_KEY=
CRON_SECRET=
SCRAPER_HEADLESS=true
MAX_PRODUCT_RETRIES=2
3. Frontend
cd frontend
npm install
npm run dev

Create frontend/.env:

VITE_API_URL=
4. Database

Create a Supabase PostgreSQL project and execute the SQL migrations located in:

backend/docs/migrations/
5. Scraper
cd scraper
npm install
node index.js

For local headed browser testing, configure:

SCRAPER_HEADLESS=false
☁️ Deployment
Frontend — Vercel

The React/Vite application is deployed on Vercel.

Backend — Render

The Express backend is deployed on Render.

The backend installs Playwright Chromium during deployment and starts with:

node server.js
Database — Supabase

Supabase PostgreSQL stores product data, tracked products, price history and scrape logs.

Scheduler — cron-job.org

cron-job.org triggers the protected scraper endpoint every 2 hours.

🔑 Environment Variables
Backend
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
CRON_SECRET=
SCRAPER_HEADLESS=true
MAX_PRODUCT_RETRIES=2
Frontend
VITE_API_URL=

Real credentials are stored only in deployment/local environment variables and are not committed to Git.

🧠 Engineering Decisions
Deterministic Product Discovery

The storefront's catalog pagination is shuffled/non-deterministic.

Therefore, the application does not assume that repeatedly fetching catalog pages will produce a complete unique catalog.

Product discovery instead uses deterministic product IDs and skips products already present in the database.

External Scheduling

The production scheduler is external rather than relying only on an in-process Node scheduler.

This is important for a hosted backend where the application may sleep or restart.

Asynchronous Scheduler Endpoint

A complete scrape can take significantly longer than an external scheduler's HTTP timeout.

Therefore:

cron-job.org
      │
      ▼
POST /api/jobs/run-scraper
      │
      ├── 202 immediately
      │
      └── scraper continues in background

This keeps the trigger request short while allowing the actual job to complete.

No Fake Successful Data

When the scraper cannot reliably obtain a price, it does not manufacture or reuse a value and mark it as a successful observation.

The attempt is logged as a failure instead.

This keeps the historical data trustworthy.

GitHub:
https://github.com/AbhijeetSirohi/iNE-price-tracker_assignment

Assignment Deliverables
✅ Deployed web application
✅ Public GitHub repository
✅ Automated 2-hour scraping
✅ Price history
✅ Stock history
✅ Scrape logs
✅ Reliability/retry handling
✅ Headed scraper demonstration
✅ Deployment and environment documentation
