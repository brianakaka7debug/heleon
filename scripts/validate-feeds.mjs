import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { ensureDir, readJsonIfExists } from './lib/common.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(projectRoot, 'apps/api/data/reports');
const tripsPath = path.join(projectRoot, 'apps/api/data/compiled/tripsById.json');

const feeds = {
  vehiclepositions: 'https://myheleonbus.org/gtfs-rt/vehiclepositions',
  tripupdates: 'https://myheleonbus.org/gtfs-rt/tripupdates',
  alerts: 'https://myheleonbus.org/gtfs-rt/alerts'
};

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

const decodeFeed = (bytes) => FeedMessage.decode(new Uint8Array(bytes));

const summarizeVehiclePositions = (feed) => {
  const vehicles = (feed.entity || []).map((entity) => entity.vehicle).filter(Boolean);
  const sample = vehicles.slice(0, 5).map((vehicle) => ({
    vehicle_id: vehicle.vehicle?.id || null,
    trip_id: vehicle.trip?.tripId || null,
    route_id: vehicle.trip?.routeId || null,
    lat: vehicle.position?.latitude || null,
    lon: vehicle.position?.longitude || null,
    timestamp: Number(vehicle.timestamp || 0) || null
  }));

  return {
    entities: feed.entity?.length || 0,
    unique_vehicle_ids: new Set(vehicles.map((vehicle) => vehicle.vehicle?.id).filter(Boolean)).size,
    unique_trip_ids: new Set(vehicles.map((vehicle) => vehicle.trip?.tripId).filter(Boolean)).size,
    sample
  };
};

const summarizeTripUpdates = (feed) => {
  const updates = (feed.entity || []).map((entity) => entity.tripUpdate).filter(Boolean);
  const stopUpdateCount = updates.reduce((sum, update) => sum + (update.stopTimeUpdate?.length || 0), 0);

  return {
    entities: feed.entity?.length || 0,
    unique_trip_ids: new Set(updates.map((update) => update.trip?.tripId).filter(Boolean)).size,
    unique_route_ids: new Set(updates.map((update) => update.trip?.routeId).filter(Boolean)).size,
    stop_time_updates: stopUpdateCount
  };
};

const summarizeAlerts = (feed) => ({
  entities: feed.entity?.length || 0,
  alert_text_samples: (feed.entity || [])
    .map((entity) => entity.alert?.headerText?.translation?.[0]?.text)
    .filter(Boolean)
    .slice(0, 5)
});

const main = async () => {
  await ensureDir(reportsDir);
  const tripsById = await readJsonIfExists(tripsPath, {});

  const summary = {
    generated_at: new Date().toISOString(),
    feeds: {}
  };

  for (const [name, url] of Object.entries(feeds)) {
    const startedAt = Date.now();
    const response = await fetch(url);

    if (!response.ok) {
      summary.feeds[name] = {
        url,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`
      };
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const feed = decodeFeed(bytes);

    let feedSummary;
    if (name === 'vehiclepositions') {
      feedSummary = summarizeVehiclePositions(feed);
      if (Object.keys(tripsById).length > 0) {
        const tripIds = new Set(feedSummary.sample.map((item) => item.trip_id).filter(Boolean));
        const matched = [...tripIds].filter((tripId) => Boolean(tripsById[tripId])).length;
        feedSummary.sample_trip_join_match_rate = tripIds.size > 0 ? matched / tripIds.size : null;
      }
    } else if (name === 'tripupdates') {
      feedSummary = summarizeTripUpdates(feed);
      if (Object.keys(tripsById).length > 0) {
        const updateTripIds = new Set(
          (feed.entity || [])
            .map((entity) => entity.tripUpdate?.trip?.tripId)
            .filter(Boolean)
        );
        const matched = [...updateTripIds].filter((tripId) => Boolean(tripsById[tripId])).length;
        feedSummary.trip_join_match_rate = updateTripIds.size > 0 ? matched / updateTripIds.size : null;
      }
    } else {
      feedSummary = summarizeAlerts(feed);
    }

    summary.feeds[name] = {
      url,
      ok: true,
      latency_ms: Date.now() - startedAt,
      gtfs_rt_version: feed.header?.gtfsRealtimeVersion || null,
      header_timestamp: Number(feed.header?.timestamp || 0) || null,
      ...feedSummary
    };
  }

  if ((summary.feeds.tripupdates?.entities || 0) === 0) {
    summary.critical_note =
      'TripUpdates currently has zero entities. MVP should rely on schedule-based stop_times fallback for ETAs.';
  }

  const outputFile = path.join(reportsDir, `feed-validation-${Date.now()}.json`);
  await fs.writeFile(outputFile, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nSaved validation report: ${outputFile}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
