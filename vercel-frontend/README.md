# Flowboard frontend for Vercel

This is a standalone React + TypeScript + Vite frontend. It retains Flowboard's Kanban UI and uses Vercel Functions to forward card requests to the existing persistent Cloudflare D1 backend. The frontend's browser address can use Vercel's free `vercel.app` hostname.

## Deployment

Import the `cu-fde2-kanban` branch of `Beckuzz172/todo-app`, set the Root Directory to `vercel-frontend`, choose the Vite framework, and use the Hobby plan for this personal assignment. Requested project name: `flowboard-kanban-beckuzz` (subject to availability). No API keys or environment variables are needed. Set the production branch to `cu-fde2-kanban` and make the production deployment public.

The Vercel deployment is not live until the hosting account is connected and deployment succeeds. The existing deployed application remains at https://flowboard-kanban-beckuzz.shrewdcup64.chatgpt.site.

## Architecture

- Browser → Vercel React frontend.
- Same-origin `/api/cards` requests → Vercel Functions.
- Vercel Functions → existing Cloudflare backend → D1 SQL database.

The API bridge validates the browser's origin before forwarding mutations, restricts routes and methods, forwards only the Kanban board cookie, and preserves status codes and the HttpOnly persistence cookie. No authentication or hosting tokens are forwarded. Cards remain stored server-side; this does not replace the database with localStorage.

Because cookies belong to each hostname, a browser visiting the new Vercel address starts a separate board. Cards on the original address remain available there. The backend Site must remain public and running.

## Checks

```sh
npm ci
npm test
npm run build
BASE_URL=https://your-confirmed-vercel-domain.vercel.app node tests/api.integration.mjs
```

The API bridge has five focused tests. The integration suite tests 55 CRUD, persistence, validation, isolation, and cross-origin assertions.
