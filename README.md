# LosHost — SA-MP / Open.mp Hosting Website (Demo)

Sri Lankan-style SA-MP game server hosting website with user registration,
login, and a basic hosting dashboard, built with Node.js + Express + EJS +
SQLite.

## Included

- 🏠 Home page with animated hero
- 💰 Hosting plans page (Free / Premium)
- 📝 Registration & login (bcrypt-hashed passwords, sessions in SQLite)
- 📊 Dashboard: create a server, see your servers, Start/Stop toggle
- 🌐 Subdomain field per server (e.g. `mycity.loshost.lk`)

**Not included** (would require real infrastructure): actual game server
provisioning, file manager, live console, and MySQL-per-user — those need a
real backend like Pterodactyl Panel + a Linux host. The dashboard here is a
working UI/DB layer you can wire up to that later (see "Going to production"
below).

## Run locally

```bash
npm install
cp .env.example .env      # edit SESSION_SECRET
npm start
```

Then open http://localhost:3000

A `db/hosting.db` SQLite file is created automatically on first run —
no external database server needed.

## Project structure

```
server.js              Express app + all routes
db/database.js          SQLite schema (users, servers)
views/                  EJS templates
public/css/style.css    Design system (all styling)
```

## Going to production

To turn this into a real hosting company like OptikLink, you'd add:

1. **Pterodactyl Panel** (free, open source) — the actual game-server
   provisioning + file manager + console engine. This website's
   "Create Server" button would call Pterodactyl's API instead of just
   writing a database row.
2. A **SA-MP / Open.mp "Egg"** in Pterodactyl to define how the game
   server process is started.
3. A real **Linux VPS/dedicated server** to run Pterodactyl's Wings daemon.
4. **DNS wildcard** (`*.yourdomain.lk`) pointed at your server for instant
   subdomains.
5. Optionally a billing system (WHMCS or a custom one) once you charge for
   Premium.

## Tech stack

- Express 4, EJS templates
- better-sqlite3 (zero-config embedded DB)
- bcryptjs for password hashing
- express-session + connect-sqlite3 for persistent login sessions
