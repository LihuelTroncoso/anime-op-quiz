# Anime Opening Quiz

Fullstack anime opening quiz built with Bun, React, TypeScript, Vite, and Hono.

The frontend requests a random opening from the backend, plays audio from second 50, lets the user search/select a title from suggestions, and reveals the original YouTube video after answering.

## Tech Stack

- Runtime/package manager: Bun
- Frontend: React + TypeScript + Vite
- Backend: Hono on Bun
- Shared contracts: workspace TypeScript package

## Project Structure

```text
.
├── apps
│   ├── api                # Bun + Hono backend
│   └── web                # Vite + React frontend
├── packages
│   └── shared             # Shared TS interfaces
└── package.json           # Workspace scripts
```

## Current Behavior

- `GET /api/openings/random` returns one random round
- Backend caches YouTube playlist metadata in CSV (instead of fetching all songs every request)
- Quiz input is searchable and suggests matching titles from backend-provided CSV-derived list
- Answer must match an exact CSV title (selected from suggestions)
- YouTube audio starts at second `50`
- After answer, original YouTube video is shown in a visible player

## API

### `GET /api/health`

```json
{ "ok": true }
```

### `GET /api/openings/random`

```json
{
  "openingId": "abc123",
  "audioUrl": "https://www.youtube.com/embed/abc123",
  "options": [
    { "id": "abc123", "title": "Naruto OP 3" },
    { "id": "def456", "title": "Bleach OP 2" }
  ],
  "correctOpeningTitle": "Naruto OP 3"
}
```

## Setup

### 1) Install

```bash
bun install
```

### 2) Configure env

```bash
cp apps/api/.env.example apps/api/.env
```

Fill `apps/api/.env`:

- `YOUTUBE_API_KEY` (YouTube Data API v3 key)
- `YOUTUBE_PLAYLIST_ID` (playlist with anime openings)
- `YOUTUBE_CACHE_CSV` (optional, default: `apps/api/data/openings.csv`)

### 3) Run

```bash
bun run dev
```

- API: `http://localhost:8787`
- Web: `http://localhost:5173`

### 4) Build

```bash
bun run build
```

## CSV Cache Format

On first successful YouTube fetch, backend writes CSV rows with:

- `id`
- `tittle`
- `videoId`
- `animeTitle`

Note: `tittle` is intentionally kept as the field name to match your requirement.

## Data Source Layer

- Source abstraction lives in `apps/api/src/opening-source.ts`
- Mock fallback data lives in `apps/api/src/mock-openings.ts`
- If YouTube config fails, backend falls back to mock data
