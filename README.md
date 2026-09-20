# INE Product Price Tracker

This repository contains the full-stack scaffolding for the Product Price Tracker assignment.

## Project Structure

- `frontend/`: React + Vite application (runs on port 5173).
- `backend/`: Node.js + Express backend (runs on port 3001).
- `scraper/`: Standalone Playwright scripts for scraping prices and stock.
- `docs/`: Future documentation.

## Setup Instructions

### Prerequisites
- Node.js (v18+ recommended)
- `npm`

### Database Setup
1. Create a Supabase project.
2. Open the **SQL Editor** in your Supabase dashboard.
3. Copy the contents of `backend/docs/migrations/01_initial_schema.sql` and run it to create the required tables.
4. Obtain your Project URL and `service_role` secret key.

### Environment Variables
Each service (`backend`, `scraper`, `frontend`) requires its own environment variables. Refer to the `.env.example` files in each directory.

### Running Locally

1. **Backend**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Scraper**
   ```bash
   cd scraper
   npm install
   # Run the scraper logic (not yet fully integrated)
   node index.js
   ```

## Architecture
- **Frontend**: Vite + React, for displaying tracked products, search, price history, and logs.
- **Backend**: Express API for bridging the frontend and the database.
- **Database**: Supabase PostgreSQL.
- **Scraper**: Playwright script designed to handle complex asynchronous pages with retry logic. Scheduled via external cron.
