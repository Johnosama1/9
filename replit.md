# starGo - Telegram Stars & Premium Purchase Platform

## Overview
A Node.js/Express web application that allows users to buy Telegram Stars and Telegram Premium subscriptions using TON cryptocurrency. Includes blockchain payment verification to prevent fake payments.

## Architecture
- **Backend:** Node.js + Express (`server.js`) — serves both API and static files
- **Frontend:** Vanilla HTML/CSS/JS (`index.html`, `admin.html`, `style.css`, `script.js`)
- **Database:** PostgreSQL (via `pg` library)
- **Payments:** TON blockchain via TonConnect + TonCenter API

## Key Features
- TON wallet connection via TonConnect
- Real blockchain transaction verification (anti-fake protection)
- Stars and Premium order management
- Admin dashboard (`/admin`)
- User login via Telegram username

## Configuration
- `PORT` — defaults to `5000`
- `DATABASE_URL` — PostgreSQL connection string (required)
- `TON_API_KEY` — TonCenter API key (optional but recommended for higher rate limits)
- `CONFIG.RECEIVER_WALLET` in `server.js` — TON wallet address that receives payments

## Database Tables
- `users` — Telegram user accounts
- `stars_orders` — Telegram Stars purchase orders
- `premium_orders` — Telegram Premium purchase orders
- `payment_verifications` — Blockchain verification records

## Running
```
npm start      # production
npm run dev    # development with nodemon
```

Server binds to `0.0.0.0:5000`.

## Migration Notes
- Migrated from Vercel serverless to Replit
- Removed Vercel-specific `module.exports` pattern; server now always starts directly
- `tonconnect-manifest.json` references `stargo.vercel.app` — update URLs after deploying to Replit
