# Hele-On Real-Time Tracker (Puna/Hilo)

MVP-first workspace for:

- Milestone 1: GTFS-RT validation + sampling harness
- Milestone 2: Fastify proxy with cache/stale fallback/rate-limit/monitoring
- Milestone 3: Mobile-first React + MapLibre web app with graceful fallbacks

## Workspace Layout

- `apps/api` - backend proxy, static GTFS endpoints, schedule fallback logic
- `apps/web` - mobile web app (Vite + React + MapLibre)
- `scripts` - GTFS ingestion + data quality sampling/report generation

## Quick Start

1. Install dependencies:
   - `npm install`
2. Build static GTFS artifacts:
   - `npm run build:gtfs`
3. Run API + web app:
   - `npm run dev`
4. Open:
   - Web: `http://localhost:5173`
   - API health: `http://localhost:8787/api/health`

## Milestone 1 Commands

- One-shot feed validation:
  - `npm run validate:feeds`
- 48-hour feed sampler:
  - `npm run sample:feeds -- --duration-hours 48 --interval-seconds 60`
- Summarize latest sample:
  - `npm run summarize:sample`

## Runtime Env

Key API env vars (defaults shown):

- `PORT=8787`
- `GTFS_RT_TTL_MS=10000`
- `GTFS_RT_FETCH_TIMEOUT_MS=3000`
- `API_RATE_LIMIT_MAX=60`
- `API_RATE_LIMIT_WINDOW_MS=60000`
- `MAX_SSE_CONNECTIONS_PER_IP=5`
- `GTFS_TIMEZONE=Pacific/Honolulu`

## Notes

- The frontend uses polling by default (10-60s) to keep MVP simple.
- SSE endpoint exists in API (`/events/vehicles`) for later optimization.
- If TripUpdates are empty, stop ETAs automatically fall back to scheduled times.
