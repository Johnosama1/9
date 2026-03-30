# starGo - Telegram Stars & Premium Purchase Platform

## Overview
A Node.js + Express web application for purchasing Telegram Stars and Telegram Premium subscriptions using the TON blockchain. Features secure payment verification via the TON Center API.

## Architecture
- **Backend**: Node.js with Express (server.js)
- **Frontend**: Static HTML/CSS/Vanilla JS (index.html, admin.html, script.js, style.css)
- **Database**: PostgreSQL (Replit built-in, via `pg` driver)
- **Blockchain**: TON Connect for wallet integration, TON Center API for payment verification

## Key Features
- Connect TON wallets via TON Connect
- Buy Telegram Stars (packages or custom amounts)
- Buy Telegram Premium (3/6/12 months)
- Anti-fake payment protection (blockchain verification)
- Transaction reuse prevention
- Jetton (fake token) detection

## Project Structure
```
server.js          - Main Express server (API + static file serving)
index.html         - Main user-facing page
admin.html         - Admin dashboard
script.js          - Frontend logic (wallet, payments, API calls)
style.css          - UI styling
database.sql       - Reference SQL schema (using PostgreSQL now)
tonconnect-manifest.json - TON Connect configuration
manifest.json      - PWA manifest
```

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` - DB credentials
- `TON_API_KEY` - Optional: TON Center API key for higher rate limits
- `PORT` - Server port (defaults to 5000)

## Database Schema (PostgreSQL)
- `users` - Telegram users (username, wallet, login tracking)
- `stars_orders` - Telegram Stars purchase orders
- `premium_orders` - Telegram Premium purchase orders
- `payment_verifications` - Blockchain payment verification records

## Running the App
- Workflow: "Start application" → `node server.js` on port 5000
- Server listens on `0.0.0.0:5000`
- Serves static files from project root

## API Endpoints
- `GET /api/health` - Health check
- `GET /api/price` - Get TON/USD price
- `POST /api/login` - Create/login user by Telegram username
- `POST /api/order/stars` - Create stars order
- `POST /api/order/premium` - Create premium order
- `POST /api/verify-payment` - Verify TON blockchain payment
- `PUT /api/order/:orderId` - Update order status
- `GET /api/orders/:userId` - Get user orders
- `GET /api/stats` - Admin stats
- `GET /api/admin/orders` - Admin order listing
