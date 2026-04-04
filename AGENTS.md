# AGENTS.md
## Scope
This file is for coding agents working in `anime-op-quiz`.
Prefer small, targeted changes.
Preserve existing architecture and naming unless there is a concrete reason to refactor.
Do not invent tooling or conventions that are not already present in the repo.

## Repository Shape
- Package manager/runtime: Bun
- Workspace layout: Bun workspaces in root `package.json`
- Frontend app: `apps/web`
- Backend app: `apps/api`
- Shared package: `packages/shared`
- Root formatter/linter config: `biome.json`
- Frontend-only lint config: `apps/web/eslint.config.js`

## Rule Files
No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` files were found.
If any of those files are added later, update this document.

## Install
Run dependencies from repo root:
```bash
bun install
```

## Primary Commands
Run both apps in development:
```bash
bun run dev
```
Run full workspace build:
```bash
bun run build
```
Run backend only:
```bash
bun run --cwd apps/api dev
bun run --cwd apps/api build
bun run --cwd apps/api start
```
Run frontend only:
```bash
bun run --cwd apps/web dev
bun run --cwd apps/web build
bun run --cwd apps/web start
bun run --cwd apps/web lint
```
Run repo-wide Biome checks or fixes:
```bash
bunx @biomejs/biome check .
bunx @biomejs/biome check . --write
```

## Tests
There is currently no configured automated test runner in this repository.
No root, API, or web `package.json` defines a `test` script.
No `vitest`, `jest`, `playwright`, or similar config files were found.
No `*.test.*` or `*.spec.*` files were found during repository scan.
Single-test command: not available today.
If a test framework is added later, update this file with both full-suite and single-test commands.
Until then, the closest thing to verification is:
```bash
bun run --cwd apps/api build
bun run --cwd apps/web lint
bun run --cwd apps/web build
bunx @biomejs/biome check .
```

## Current Validation State
At the time this file was written, the repo is not fully clean.
`bun run build` currently fails on a TypeScript error in `apps/api/src/services/room-store.ts`.
`bun run --cwd apps/web lint` completes with React hook dependency warnings.
`bunx @biomejs/biome check .` reports formatting and lint issues in existing code.
Do not assume a failing validation command was caused by your change; inspect the output.

## Environment Variables
Backend environment variables used in code include:
- `PORT`
- `DATABASE_URL`
- `ROOM_PASSWORD`
- `ROOM_IDLE_MINUTES`
- `PLAYERS_SCORE_CSV`
- `YOUTUBE_PLAYLIST_ID`
- `YOUTUBE_API_KEY`
- `YOUTUBE_CACHE_CSV`
Frontend environment variables used in code include:
- `VITE_API_BASE_URL`
- `VITE_API_PROXY_TARGET`
Prefer same-origin `/api` behavior unless deployment requires an explicit frontend API base URL.

## Code Style
Follow existing code and config before applying generic preferences.
Use TypeScript everywhere and preserve `strict` compatibility.
Prefer explicit types for exported values and non-trivial payloads.
Use `import type` for type-only imports.
Use double quotes, tabs, and semicolons.
Let Biome handle formatting and import organization.
Do not manually reorder imports against Biome unless necessary.
Keep functions and helpers small when practical, but do not split logic gratuitously.
Favor simple local helpers over premature abstractions.

## Imports
Prefer Node built-ins first, then external packages, then local imports.
Use workspace package imports for shared contracts, for example `@anime-op-quiz/shared`.
Prefer relative imports within a package.
Do not introduce path alias infrastructure unless the repo already adopts it.
In frontend files, side-effect CSS imports usually appear after library imports.

## Naming
Use `camelCase` for variables, functions, and helpers.
Use `PascalCase` for React components, classes, and exported types/interfaces.
Use `UPPER_SNAKE_CASE` for true constants such as `API_BASE_URL`.
Backend filenames commonly use dotted or hyphenated lowercase names such as `history.users.dao.ts` and `http-error.ts`; follow the surrounding folder convention.
Prefer descriptive domain names over generic placeholders.

## Types
Prefer `type` aliases for unions and shaped payloads in app code.
Interfaces are used in `packages/shared` and some backend integration types; either is acceptable when it matches nearby code.
Avoid `any`.
Use narrow unions when the domain is closed, for example `5 | 10 | 20` for round duration.
Prefer `string | null` over sentinel magic strings.
When parsing external input, validate and normalize early.
Treat `process.env` and `import.meta.env` values as optional until proven otherwise.

## Error Handling
Backend routes use `HttpError` for expected client-facing failures.
Preserve that pattern for validation and domain errors.
Unexpected errors should be logged and returned as generic `500` responses.
Do not leak raw internal error objects to clients.
On the frontend, failed fetches are commonly turned into `Error` objects with user-friendly messages.
Prefer explicit fallback messages such as `"Unable to join room"`.

## Frontend Conventions
Frontend is React 19 with Vite.
Current code uses function components and hooks.
Keep state close to where it is used.
Do not add memoization helpers by default unless they solve a real rerender or dependency issue.
The current code already uses `useMemo`, `useEffect`, `useRef`, and `useState`; stay consistent with nearby patterns.
Respect `eslint-plugin-react-hooks` warnings when modifying effects.
Prefer semantic HTML when possible; Biome currently flags some ARIA-only table usage.

## Backend Conventions
Backend is a Hono app running on Bun.
Route handlers typically parse JSON inline, validate required fields, call service functions, and map `HttpError` to status codes.
Business logic generally lives under `src/services` and `src/sources`.
Persistence access lives under `src/dao`.
Shared HTTP/domain contracts should live in `packages/shared` when both apps need them.

## Data And Persistence
The repo currently mixes Prisma-backed user history with CSV-backed opening/player files.
Do not replace one persistence mechanism with another unless the task explicitly requires it.
Preserve existing environment-variable-driven file path behavior.
Be careful with relative file paths; some code resolves paths from repo root.

## Change Discipline
Make the smallest correct change.
Do not silently fix unrelated lint/type issues unless they block your task or the user asked for cleanup.
If validation failures predate your change, mention them separately.
When you modify shared types, verify both apps still compile.
When changing API behavior, check the corresponding frontend usage in `apps/web/src/App.tsx`.
When changing frontend request payloads, check the Hono handlers in `apps/api/src/index.ts`.

## Recommended Agent Workflow
1. Read nearby config and neighboring files before editing.
2. Make the smallest viable change.
3. Run the narrowest relevant validation commands.
4. If shared contracts changed, run broader validation.
5. Report pre-existing failures separately from new failures.
