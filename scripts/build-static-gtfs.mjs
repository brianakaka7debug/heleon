import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import { ensureDir, parseArgs, parseGtfsTimeToSeconds } from './lib/common.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const apiDataRoot = path.join(projectRoot, 'apps/api/data');
const rawDir = path.join(apiDataRoot, 'raw');
const compiledDir = path.join(apiDataRoot, 'compiled');

const gtfsUrl = process.env.GTFS_STATIC_URL || 'https://myheleonbus.org/gtfs';
const zipPath = path.join(rawDir, 'heleon_gtfs.zip');
const extractDir = path.join(rawDir, 'gtfs');

const args = parseArgs();
const forceDownload = Boolean(args.refresh);

const readCsv = async (filename) => {
  const fullPath = path.join(extractDir, filename);
  const text = await fs.readFile(fullPath, 'utf8');
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true
  });
};

const writeJson = async (filename, payload) => {
  await fs.writeFile(path.join(compiledDir, filename), JSON.stringify(payload, null, 2));
};

const toFloatOrNull = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toIntOrNull = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const downloadZip = async () => {
  const response = await fetch(gtfsUrl);
  if (!response.ok) {
    throw new Error(`Failed to download GTFS zip: ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(zipPath, bytes);
  console.log(`Downloaded GTFS zip (${(bytes.length / 1024).toFixed(1)} KB)`);
};

const cleanExtractDir = async () => {
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
};

const build = async () => {
  await ensureDir(rawDir);
  await ensureDir(compiledDir);

  let zipExists = true;
  try {
    await fs.access(zipPath);
  } catch {
    zipExists = false;
  }

  if (!zipExists || forceDownload) {
    console.log('Downloading static GTFS zip...');
    await downloadZip();
  } else {
    console.log('Using existing GTFS zip (pass --refresh to re-download).');
  }

  await cleanExtractDir();
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractDir, true);

  const [routesRows, stopsRows, tripsRows, stopTimesRows, shapesRows, calendarRows, calendarDatesRows] = await Promise.all([
    readCsv('routes.txt'),
    readCsv('stops.txt'),
    readCsv('trips.txt'),
    readCsv('stop_times.txt'),
    readCsv('shapes.txt'),
    readCsv('calendar.txt'),
    readCsv('calendar_dates.txt').catch(() => [])
  ]);

  const routes = routesRows.map((route) => ({
    route_id: route.route_id,
    route_short_name: route.route_short_name || null,
    route_long_name: route.route_long_name || null,
    route_desc: route.route_desc || null,
    route_type: toIntOrNull(route.route_type),
    route_color: route.route_color || null,
    route_text_color: route.route_text_color || null
  }));

  const stops = stopsRows
    .filter((stop) => stop.stop_id)
    .map((stop) => ({
      stop_id: stop.stop_id,
      stop_code: stop.stop_code || null,
      stop_name: stop.stop_name || null,
      stop_desc: stop.stop_desc || null,
      stop_lat: toFloatOrNull(stop.stop_lat),
      stop_lon: toFloatOrNull(stop.stop_lon),
      zone_id: stop.zone_id || null,
      parent_station: stop.parent_station || null,
      wheelchair_boarding: toIntOrNull(stop.wheelchair_boarding)
    }))
    .filter((stop) => Number.isFinite(stop.stop_lat) && Number.isFinite(stop.stop_lon));

  const tripsById = {};
  for (const trip of tripsRows) {
    if (!trip.trip_id) {
      continue;
    }

    tripsById[trip.trip_id] = {
      trip_id: trip.trip_id,
      route_id: trip.route_id || null,
      service_id: trip.service_id || null,
      trip_headsign: trip.trip_headsign || null,
      direction_id: toIntOrNull(trip.direction_id),
      shape_id: trip.shape_id || null
    };
  }

  const routeStopSets = {};
  const stopTimesByStop = {};

  for (const stopTime of stopTimesRows) {
    const trip = tripsById[stopTime.trip_id];
    if (!trip || !stopTime.stop_id) {
      continue;
    }

    const arrivalSecs = parseGtfsTimeToSeconds(stopTime.arrival_time);
    if (!Number.isFinite(arrivalSecs)) {
      continue;
    }

    if (!routeStopSets[trip.route_id]) {
      routeStopSets[trip.route_id] = new Set();
    }
    routeStopSets[trip.route_id].add(stopTime.stop_id);

    if (!stopTimesByStop[stopTime.stop_id]) {
      stopTimesByStop[stopTime.stop_id] = [];
    }

    stopTimesByStop[stopTime.stop_id].push({
      trip_id: trip.trip_id,
      route_id: trip.route_id,
      service_id: trip.service_id,
      headsign: trip.trip_headsign,
      direction_id: trip.direction_id,
      stop_sequence: toIntOrNull(stopTime.stop_sequence),
      arrival_secs: arrivalSecs,
      departure_secs: parseGtfsTimeToSeconds(stopTime.departure_time) ?? arrivalSecs
    });
  }

  for (const stopId of Object.keys(stopTimesByStop)) {
    stopTimesByStop[stopId].sort((a, b) => a.arrival_secs - b.arrival_secs);
  }

  const routeStopsIndex = Object.fromEntries(
    Object.entries(routeStopSets).map(([routeId, stopSet]) => [routeId, [...stopSet]])
  );

  const shapePoints = {};
  for (const shapePoint of shapesRows) {
    const shapeId = shapePoint.shape_id;
    if (!shapeId) {
      continue;
    }

    if (!shapePoints[shapeId]) {
      shapePoints[shapeId] = [];
    }

    shapePoints[shapeId].push({
      lat: toFloatOrNull(shapePoint.shape_pt_lat),
      lon: toFloatOrNull(shapePoint.shape_pt_lon),
      sequence: toIntOrNull(shapePoint.shape_pt_sequence)
    });
  }

  const shapeLines = {};
  for (const [shapeId, points] of Object.entries(shapePoints)) {
    const sorted = points
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

    if (sorted.length < 2) {
      continue;
    }

    shapeLines[shapeId] = sorted.map((point) => [point.lon, point.lat]);
  }

  const routeShapeIds = {};
  for (const trip of Object.values(tripsById)) {
    if (!trip.route_id || !trip.shape_id || !shapeLines[trip.shape_id]) {
      continue;
    }

    if (!routeShapeIds[trip.route_id]) {
      routeShapeIds[trip.route_id] = new Set();
    }
    routeShapeIds[trip.route_id].add(trip.shape_id);
  }

  const shapesByRoute = {};
  for (const [routeId, shapeIdSet] of Object.entries(routeShapeIds)) {
    const features = [...shapeIdSet].map((shapeId) => ({
      type: 'Feature',
      properties: {
        route_id: routeId,
        shape_id: shapeId
      },
      geometry: {
        type: 'LineString',
        coordinates: shapeLines[shapeId]
      }
    }));

    shapesByRoute[routeId] = {
      type: 'FeatureCollection',
      features
    };
  }

  const calendarByService = {};
  for (const row of calendarRows) {
    if (!row.service_id) {
      continue;
    }

    calendarByService[row.service_id] = {
      monday: toIntOrNull(row.monday) || 0,
      tuesday: toIntOrNull(row.tuesday) || 0,
      wednesday: toIntOrNull(row.wednesday) || 0,
      thursday: toIntOrNull(row.thursday) || 0,
      friday: toIntOrNull(row.friday) || 0,
      saturday: toIntOrNull(row.saturday) || 0,
      sunday: toIntOrNull(row.sunday) || 0,
      start_date: row.start_date,
      end_date: row.end_date
    };
  }

  const calendarDatesByService = {};
  for (const row of calendarDatesRows) {
    if (!row.service_id) {
      continue;
    }

    if (!calendarDatesByService[row.service_id]) {
      calendarDatesByService[row.service_id] = [];
    }

    calendarDatesByService[row.service_id].push({
      date: row.date,
      exception_type: toIntOrNull(row.exception_type)
    });
  }

  const calendar = {
    timezone: process.env.GTFS_TIMEZONE || 'Pacific/Honolulu',
    calendarByService,
    calendarDatesByService
  };

  const metadata = {
    generated_at: new Date().toISOString(),
    source_url: gtfsUrl,
    counts: {
      routes: routes.length,
      stops: stops.length,
      trips: Object.keys(tripsById).length,
      stop_time_rows: stopTimesRows.length,
      route_shapes: Object.keys(shapesByRoute).length
    }
  };

  await Promise.all([
    writeJson('routes.json', routes),
    writeJson('stops.json', stops),
    writeJson('tripsById.json', tripsById),
    writeJson('stopTimesByStop.json', stopTimesByStop),
    writeJson('routeStopsIndex.json', routeStopsIndex),
    writeJson('shapesByRoute.json', shapesByRoute),
    writeJson('calendar.json', calendar),
    writeJson('metadata.json', metadata)
  ]);

  console.log('Static GTFS artifacts generated:');
  console.log(JSON.stringify(metadata, null, 2));
};

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
