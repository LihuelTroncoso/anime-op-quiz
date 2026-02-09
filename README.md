# Anime Opening Quiz

A fullstack anime opening quiz app built with Bun, React, TypeScript, Vite, and Hono.

The frontend asks the backend for a random anime opening, plays the audio clip, and shows all answer options from the backend dataset.

## Tech Stack

- **Runtime / package manager:** Bun
- **Frontend:** React + TypeScript + Vite
- **Backend:** Hono (running on Bun)
- **Shared contracts:** Workspace package with shared TypeScript types

## Project Structure

```text
.
├── apps
│   ├── api                # Bun + Hono backend
│   └── web                # Vite + React frontend
├── packages
│   └── shared             # Shared TS interfaces used by web and api
└── package.json           # Workspace and root scripts
```

## Features (Current MVP)

- Random anime opening endpoint: `GET /api/openings/random`
- Audio player in the UI (`<audio controls>`)
- Backend caches playlist metadata to CSV after first fetch
- Client-side answer check (shows correct / incorrect)
- Pluggable opening source interface on backend

## API

### `GET /api/health`

Returns basic health status.

Example response:

```json
{
  "ok": true
}
```

### `GET /api/openings/random`

Returns one random quiz round.

Example response:

```json
{
  "openingId": "naruto-blue-bird",
  "audioUrl": "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "options": [{ "id": "id1", "title": "Naruto OP 3" }],
  "correctOpeningTitle": "Naruto OP 3"
}
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed

### Install dependencies

```bash
bun install
```

### Configure YouTube credentials

Create your local API env file from the example:

```bash
cp apps/api/.env.example apps/api/.env
```

Then fill `apps/api/.env` with your YouTube values:

- `YOUTUBE_API_KEY` (YouTube Data API v3 key)
- `YOUTUBE_PLAYLIST_ID` (playlist containing anime openings)
- `YOUTUBE_CACHE_CSV` (optional, defaults to `apps/api/data/openings.csv`)

If YouTube values are missing or invalid, the backend falls back to local mock openings.

On first successful fetch, backend writes cached rows to CSV with headers:

- `id`
- `tittle`
- `videoId`
- `animeTitle` (extra helper field)

### Run in development

```bash
bun run dev
```

This starts:

- API on `http://localhost:8787`
- Web app on `http://localhost:5173`

The frontend uses a Vite proxy for `/api` requests to the backend.

### Build

```bash
bun run build
```

## Data Source Integration (Pluggable)

The backend supports YouTube and mock providers in:

- `apps/api/src/opening-source.ts`
- `apps/api/src/mock-openings.ts`

To connect a different source (database or another external API):

1. Implement `OpeningSource` with your real fetch logic.
2. Export your implementation as `openingSource`.
3. Keep the same return shape (`AnimeOpening[]`) so the API contract remains stable.

## Notes

- The current MVP sends `correctAnimeTitle` to the frontend for quick iteration.
- For production quiz integrity, add a server-side answer validation endpoint and avoid exposing the correct answer in the random round response.

## Roadmap Ideas

- Score system and round history
- Timed mode / difficulty presets
- User accounts and leaderboard
- Persistent opening catalog in a database
- Better audio licensing and source management
