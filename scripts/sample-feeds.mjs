import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { ensureDir, parseArgs, readJsonIfExists, sleep, hstDateParts } from './lib/common.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(projectRoot, 'apps/api/data/reports');
const tripsPath = path.join(projectRoot, 'apps/api/data/compiled/tripsById.json');

const args = parseArgs();
const durationHours = Number.parseFloat(args['duration-hours'] || '48');
const intervalSeconds = Number.parseInt(args['interval-seconds'] || '60', 10);
const fetchTimeoutSeconds = Number.parseInt(args['fetch-timeout-seconds'] || '10', 10);
const loops = Math.max(1, Math.round((durationHours * 3600) / intervalSeconds));

const urls = {
  vehiclepositions: 'https://myheleonbus.org/gtfs-rt/vehiclepositions',
  tripupdates: 'https://myheleonbus.org/gtfs-rt/tripupdates',
  alerts: 'https://myheleonbus.org/gtfs-rt/alerts'
};

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

const decode = (bytes) => FeedMessage.decode(new Uint8Array(bytes));

const bucketForHour = (hour) => {
  if (hour >= 6 && hour < 8) {
    return 'morning_6_8';
  }
  if (hour >= 15 && hour < 17) {
    return 'afternoon_15_17';
  }
  if (hour >= 11 && hour < 14) {
    return 'midday_11_14';
  }
  return 'other';
};

const fetchFeed = async (name, url) => {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutSeconds * 1000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      return {
        name,
        ok: false,
        status: response.status,
        latency_ms: Date.now() - startedAt,
        entities: 0,
        feed: null
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      name,
      ok: true,
      status: response.status,
      latency_ms: Date.now() - startedAt,
      entities: 0,
      feed: decode(bytes)
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      name,
      ok: false,
      status: null,
      latency_ms: Date.now() - startedAt,
      error: error.message,
      entities: 0,
      feed: null
    };
  }
};

const summarizeSnapshot = ({ responses, tripsById }) => {
  const vp = responses.vehiclepositions.feed;
  const tu = responses.tripupdates.feed;
  const al = responses.alerts.feed;

  const vehicles = (vp?.entity || []).map((entity) => entity.vehicle).filter(Boolean);
  const tripUpdates = (tu?.entity || []).map((entity) => entity.tripUpdate).filter(Boolean);

  const vehicleTripIds = new Set(vehicles.map((vehicle) => vehicle.trip?.tripId).filter(Boolean));
  const tripUpdateTripIds = new Set(tripUpdates.map((update) => update.trip?.tripId).filter(Boolean));

  const matchedVehicleTrips = [...vehicleTripIds].filter((tripId) => Boolean(tripsById[tripId])).length;
  const matchedTripUpdateTrips = [...tripUpdateTripIds].filter((tripId) => Boolean(tripsById[tripId])).length;

  const parts = hstDateParts(new Date());

  return {
    sampled_at: new Date().toISOString(),
    hst_hour: parts.hour,
    hst_bucket: bucketForHour(parts.hour),
    vehiclepositions: {
      ok: responses.vehiclepositions.ok,
      status: responses.vehiclepositions.status,
      latency_ms: responses.vehiclepositions.latency_ms,
      entities: vp?.entity?.length || 0,
      unique_vehicle_ids: new Set(vehicles.map((vehicle) => vehicle.vehicle?.id).filter(Boolean)).size,
      unique_trip_ids: vehicleTripIds.size,
      trip_join_match_ratio: vehicleTripIds.size > 0 ? matchedVehicleTrips / vehicleTripIds.size : null
    },
    tripupdates: {
      ok: responses.tripupdates.ok,
      status: responses.tripupdates.status,
      latency_ms: responses.tripupdates.latency_ms,
      entities: tu?.entity?.length || 0,
      unique_trip_ids: tripUpdateTripIds.size,
      stop_time_updates: tripUpdates.reduce((sum, update) => sum + (update.stopTimeUpdate?.length || 0), 0),
      trip_join_match_ratio: tripUpdateTripIds.size > 0 ? matchedTripUpdateTrips / tripUpdateTripIds.size : null
    },
    alerts: {
      ok: responses.alerts.ok,
      status: responses.alerts.status,
      latency_ms: responses.alerts.latency_ms,
      entities: al?.entity?.length || 0
    }
  };
};

const main = async () => {
  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    throw new Error('Invalid --duration-hours value');
  }

  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 5) {
    throw new Error('Invalid --interval-seconds value (min 5)');
  }

  await ensureDir(reportsDir);
  const tripsById = await readJsonIfExists(tripsPath, {});

  const startedAtIso = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(reportsDir, `feed-sample-${startedAtIso}.jsonl`);
  const stream = createWriteStream(outputPath, { flags: 'a' });

  console.log(`Starting feed sampler for ${durationHours}h at ${intervalSeconds}s interval`);
  console.log(`Writing samples to ${outputPath}`);

  for (let iteration = 0; iteration < loops; iteration += 1) {
    const startedAt = Date.now();

    const [vp, tu, al] = await Promise.all([
      fetchFeed('vehiclepositions', urls.vehiclepositions),
      fetchFeed('tripupdates', urls.tripupdates),
      fetchFeed('alerts', urls.alerts)
    ]);

    const sample = summarizeSnapshot({
      responses: {
        vehiclepositions: vp,
        tripupdates: tu,
        alerts: al
      },
      tripsById
    });

    stream.write(`${JSON.stringify(sample)}\n`);

    const elapsed = Date.now() - startedAt;
    console.log(
      `[${iteration + 1}/${loops}] vehicles=${sample.vehiclepositions.entities} tripupdates=${sample.tripupdates.entities} alerts=${sample.alerts.entities} elapsed=${elapsed}ms`
    );

    if (iteration + 1 < loops) {
      const wait = Math.max(0, intervalSeconds * 1000 - elapsed);
      await sleep(wait);
    }
  }

  stream.end();
  await fs.appendFile(
    path.join(reportsDir, 'sample-index.log'),
    `${new Date().toISOString()} ${outputPath} duration_hours=${durationHours} interval_seconds=${intervalSeconds}\n`
  );

  console.log(`Sampling complete: ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
