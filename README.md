# Flowboard — CU FDE2 Kanban

A full-stack Kanban board with a React + TypeScript frontend, a server-side HTTP API, and a persistent Cloudflare D1 SQL database. The application runs on Cloudflare Workers through Sites. Vinext uses Vite for development and production builds.

**Frontend:** https://flowboard-cu-fde2-beckuzz.shrewdcup64.chatgpt.site

**Assignment source:** https://github.com/Beckuzz172/todo-app/tree/cu-fde2-kanban

## Requirements

- Three columns: **To do**, **Doing**, and **Done**.
- Add a card, move it between columns, and delete it.
- Every card stores exactly one `status`: `todo`, `doing`, or `done`.
- Changes are saved by the backend in SQL and survive a browser refresh.
- Responsive React/TypeScript interface with both drag-and-drop and keyboard/touch-friendly status controls.
- Also includes card editing, descriptions, priorities, search, validation, and loading/error/empty states.

The screenshot's Supabase/FastAPI suggestions are labeled recommended steps. This deployment uses a TypeScript API and Cloudflare D1 instead, providing the same full-stack database-backed behavior without external database credentials.

## Data model and privacy

`cards` stores `id`, `board_id`, `title`, `description`, `status`, `priority`, `created_at`, and `updated_at`. SQL CHECK constraints restrict status and priority, and an index supports per-board queries. The migration is committed in `drizzle/`.

Each browser receives an opaque, random, HttpOnly board cookie. Records live in D1, not localStorage. API queries always constrain records to this board. The cookie lasts one year and is renewed when the board loads; clearing cookies or changing browsers starts a separate board. This is a simple personal-board assignment, not account-based collaboration or cross-device synchronization.

## Run locally

Requires Node.js 22.13+ and npm.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_yummy_princess_powerful.sql
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:5173. Run the SQL command once for a fresh local database. Local storage and cloud storage are separate. `npm start` previews the production build locally.

## API

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/cards` | `{ "cards": [...] }`; establishes/renews the board cookie |
| POST | `/api/cards` | Creates a card; returns `201` and `{ "card": ... }` |
| PATCH | `/api/cards/:id` | Updates a card; returns `{ "card": ... }` |
| DELETE | `/api/cards/:id` | Deletes a card; returns `204` |

POST accepts `title` (trimmed, 1–160 characters), `description` (up to 2,000 characters), `status` (`todo`, `doing`, `done`), and `priority` (`low`, `medium`, `high`). PATCH accepts any non-empty subset. Validation returns 400, missing or inaccessible cards return 404, cross-origin mutations return 403, and database failures return 503. Clients should retain cookies and use the same origin as the frontend.

## Verification

```sh
npx tsc --noEmit
npm run build
# While the local server is running:
node tests/api.integration.mjs
```

The integration test makes 55 assertions covering CRUD, all status transitions, reload persistence, field boundaries and malformed payloads, missing cards, board isolation, and cross-origin protection. It creates its own boards and removes its test cards.

## Cloud deployment

`.openai/hosting.json` declares the existing Sites project and D1 `DB` binding. Sites provisions the hosted D1 database and applies the committed SQL migration during publication. No API keys or database passwords are embedded in the frontend or repository. The source is built and published through the Sites source/version deployment workflow.

The assignment is isolated on the `cu-fde2-kanban` branch so the repository's original `main` application remains intact.
