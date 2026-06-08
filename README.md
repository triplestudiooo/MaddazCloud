# MaddazCloud

Simple full-stack prototype for MaddazCloud — a modern, iOS-style cloud storage web app.

This repo contains:
- `web/` — frontend static site (HTML/CSS/JS) ready for GitHub Pages or Vercel static hosting.
- `server/` — Node.js Express backend that uploads files to Telegram (using a bot token) and stores metadata locally.

Features implemented in prototype:
- Upload files (up to 2GB supported by Telegram) and store content in Telegram via Bot API.
- Download files and view raw file streams.
- Edit file names.
- Email login (simple JWT-based auth) and placeholder for Google Sign-In.
- Admin flag for users.
- Per-user privacy: files are separated per authenticated user.

Important: This is a prototype. For production you must secure credentials, use a persistent DB, HTTPS, proper Google OAuth setup, and host the backend on a server that supports large uploads (e.g., a VPS or serverless with larger body limits).

Quick start (development):

1. Copy server env example and set values:

```bash
cp server/.env.example server/.env
# Edit server/.env: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID and JWT_SECRET
```

2. Start server:

```bash
cd server
npm install
node index.js
```

3. Serve frontend (open `web/index.html` in browser or deploy `web/` to GitHub Pages / Vercel).

Notes:
- Telegram stores the uploaded files; metadata is stored in `server/metadata.json` for this prototype.
- Max single upload is limited by Telegram (2GB).

Author: MaddazXD - Gondrong STIES
Project name: MaddazCloud
# MaddazCloud
