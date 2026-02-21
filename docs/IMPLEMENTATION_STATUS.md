# Hele-On Tracker Implementation Status

## Milestone 1: Data Validation Harness

Implemented:

- `scripts/validate-feeds.mjs`
  - Fetches/decode VehiclePositions, TripUpdates, Alerts
  - Captures entity counts, sample IDs, latency, join checks against static `tripsById`
  - Writes JSON report to `apps/api/data/reports/`
- `scripts/sample-feeds.mjs`
  - Interval sampler for 48h+ runs
  - Tracks feed counts, latency, HST time buckets, trip join consistency
  - Writes JSONL samples for later analysis
- `scripts/summarize-sample.mjs`
  - Summarizes sample JSONL into JSON + Markdown
  - Includes longest zero-entity streak and rush/midday/afternoon breakdowns

Run:

- `npm run validate:feeds`
- `npm run sample:feeds -- --duration-hours 48 --interval-seconds 60`
- `npm run summarize:sample`

## Milestone 2: Proxy API + Cache + Rate Limit + Monitoring

Implemented in `apps/api/src`:

- `server.mjs`
  - `GET /api/rt/vehiclepositions`
  - `GET /api/rt/tripupdates`
  - `GET /api/rt/alerts`
  - `GET /api/gtfs/routes`
  - `GET /api/gtfs/stops`
  - `GET /api/gtfs/shape`
  - `GET /api/stops/:stopId/arrivals` (real-time first, scheduled fallback)
  - `GET /api/monitoring/metrics`
  - `GET /events/vehicles` SSE endpoint (optional optimization)
- `gtfsRealtime.mjs`
  - Protobuf decode + normalization
  - 10s cache default
  - 3s upstream timeout default
  - stale fallback when upstream fails
  - feed-level entity/latency/error tracking
- `staticGtfsStore.mjs`
  - Loads precomputed GTFS artifacts from `apps/api/data/compiled`
- `arrivals.mjs`
  - TripUpdates ETAs prioritized
  - schedule fallback from static `stop_times` + calendar

## Milestone 3: Mobile Web MVP

Implemented in `apps/web/src`:

- Routes:
  - `/` map with route overlay + vehicle markers + route filter + last updated state
  - `/routes` route list with filtering
  - `/routes/:routeId` route details + stops
  - `/stops/:stopId` arrivals with real-time/scheduled source labeling
  - `/favorites` localStorage favorites
  - `/terms` disclaimer
- Polling strategy (MVP-first):
  - Vehicles every 15s
  - TripUpdates every 30s
  - Alerts every 60s
  - Pauses when hidden or idle for 5 minutes
- Empty/fallback states:
  - No vehicles message
  - Scheduled fallback label when TripUpdates is empty/unavailable
  - Stale data warning when serving cache fallback

## Static GTFS Ingestion

Implemented:

- `scripts/build-static-gtfs.mjs`
  - Downloads GTFS zip
  - Builds precomputed JSON artifacts:
    - `routes.json`
    - `stops.json`
    - `tripsById.json`
    - `stopTimesByStop.json`
    - `routeStopsIndex.json`
    - `shapesByRoute.json`
    - `calendar.json`
    - `metadata.json`

Run:

- `npm run build:gtfs`

## Milestone 4+ Ready Path

Already scaffolded for future work:

- SSE endpoint in backend (`/events/vehicles`)
- Monitoring counters in backend (`/api/monitoring/metrics`)
- Sample/reliability data pipeline in `scripts/`

Next planned extensions:

1. Move frontend from polling to SSE-first with polling fallback.
2. Add reliability score badges based on sampler output.
3. Add user notifications (web push first, native wrapper later).
4. Add analytics + rider feedback instrumentation.
