# Anime Opening Quiz

Multiplayer anime opening quiz built with Bun, React, TypeScript, Vite, and Hono.

Current mode is a **single shared room** protected by a password from env. Players join, listen to the same opening, submit one answer per round, and see a live scoreboard.

## What It Does

- Uses YouTube playlist data cached to CSV (`id,tittle,videoId,animeTitle,listened`)
- Filters songs by title containing `opening` or `op` (case-insensitive)
- Starts playback from second `50`
- Lets players join one room with a password
- Tracks player scores in a CSV file (no database)

## API

### `POST /api/room/join`

Request:

```json
{ "name": "Lihuel", "password": "room-pass" }
```

Response:

```json
{ "roomId": "main-room", "playerId": "...", "name": "Lihuel" }
```

### `GET /api/room/state?playerId=...`

Returns current round (if any), player answered flag, and scoreboard.

### `POST /api/room/next-round`

Request:

```json
{ "playerId": "..." }
```

Starts a new shared round for the room.

### `POST /api/room/answer`

Request:

```json
{ "playerId": "...", "answerTitle": "Naruto Opening 3" }
```

Response includes correctness and updated scoreboard.

### `POST /api/room/reset-scores`

Resets all players scores/correct/attempted to `0` in `players-score.csv`.

### `POST /api/room/leave`

Removes the player session from memory and deletes that player row from `players-score.csv`.

## Env Setup

Copy and fill:

```bash
cp apps/api/.env.example apps/api/.env
```

Required:

- `YOUTUBE_API_KEY`
- `YOUTUBE_PLAYLIST_ID`
- `ROOM_PASSWORD`

Optional:

- `YOUTUBE_CACHE_CSV` (default: `apps/api/data/openings.csv`)
- `PLAYERS_SCORE_CSV` (default: `apps/api/data/players-score.csv`)
- `ROOM_IDLE_MINUTES` (default: `20`)

## Idle Cleanup

If no request hits the backend for 20 minutes (or your `ROOM_IDLE_MINUTES` value), all players are removed from memory and `players-score.csv` is cleared.

## CSV Files

`openings.csv` fields:

- `id`
- `tittle`
- `videoId`
- `animeTitle`
- `listened`

`players-score.csv` fields:

- `id`
- `name`
- `score`
- `correct`
- `attempted`

## Run

```bash
bun install
bun run dev
```

- API: `http://localhost:8787`
- Web: `http://localhost:5173`

## Build

```bash
bun run build
```

This generates:

- Frontend static files: `apps/web/dist`

## Deploy On Linux (Cloudflare Temporary Host)

This uses Cloudflare Quick Tunnels (`cloudflared tunnel --url ...`) with no domain setup.

1) Install dependencies and build backend once

```bash
bun install
bun run --cwd apps/api build
```

2) Start backend (production)

```bash
bun run --cwd apps/api start
```

Backend runs on `127.0.0.1:8787`.

3) Expose backend with Cloudflare and copy the public URL

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Keep this terminal open, and copy the `https://...trycloudflare.com` URL.

4) Build frontend with backend URL

In another terminal, from repo root:

```bash
VITE_API_BASE_URL="https://YOUR-BACKEND-URL.trycloudflare.com/api" bun run --cwd apps/web build
```

5) Start frontend static server

```bash
bun run --cwd apps/web start
```

Frontend runs on `0.0.0.0:4173`.

6) Expose frontend with Cloudflare

```bash
cloudflared tunnel --url http://127.0.0.1:4173
```

Use this second `https://...trycloudflare.com` URL on your devices.

Notes:

- If backend tunnel URL changes, rebuild frontend with new `VITE_API_BASE_URL`.
- For long-running deployment, use `systemd` or `pm2` for backend/frontend processes.

## Deploy On Fly.io

This repo is now configured so Fly runs a single process (`apps/api`) that serves:

- API routes under `/api/*`
- Built frontend from `apps/web/dist`

### 1) Install Fly CLI and login

```bash
fly auth login
```

### 2) Create app + volume (first time only)

```bash
fly launch --no-deploy
fly volumes create data --size 1 --region gru
```

`fly.toml` already mounts this volume at `/data` and stores CSV files there.

### 3) Set required secrets

```bash
fly secrets set YOUTUBE_API_KEY="your_key" YOUTUBE_PLAYLIST_ID="your_playlist" ROOM_PASSWORD="your_room_password"
```

### 4) Deploy

```bash
fly deploy
```

### 5) Check health

```bash
fly logs
curl https://<your-fly-app>.fly.dev/api/health
```

### Notes

- Frontend and backend are served from the same Fly app/domain.
- You do **not** need `VITE_API_BASE_URL` for Fly deploy (frontend uses same-origin `/api`).
- If you change `fly.toml` mount name/region, recreate the volume accordingly.
