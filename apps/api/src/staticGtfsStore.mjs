import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPILED_DIR = path.resolve(__dirname, '../data/compiled');

const readJson = async (filename, fallbackValue) => {
  const filePath = path.join(COMPILED_DIR, filename);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
};

const parseBbox = (bbox) => {
  if (!bbox) {
    return null;
  }

  const values = bbox.split(',').map((part) => Number.parseFloat(part.trim()));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return {
    minLon: values[0],
    minLat: values[1],
    maxLon: values[2],
    maxLat: values[3]
  };
};

const toRadians = (value) => (value * Math.PI) / 180;
const toDegrees = (value) => (value * 180) / Math.PI;

const distanceMiles = (aLat, aLon, bLat, bLon) => {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const sinDlat = Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2);
  const h = sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
};

const initialBearingDegrees = (fromLat, fromLon, toLat, toLon) => {
  const phi1 = toRadians(fromLat);
  const phi2 = toRadians(toLat);
  const lambda1 = toRadians(fromLon);
  const lambda2 = toRadians(toLon);
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  const theta = toDegrees(Math.atan2(y, x));
  return (theta + 360) % 360;
};

const cardinalDirection = (bearing) => {
  if (bearing >= 45 && bearing < 135) {
    return { code: 'E', label: 'Eastbound' };
  }
  if (bearing >= 135 && bearing < 225) {
    return { code: 'S', label: 'Southbound' };
  }
  if (bearing >= 225 && bearing < 315) {
    return { code: 'W', label: 'Westbound' };
  }
  return { code: 'N', label: 'Northbound' };
};

export class StaticGtfsStore {
  constructor({ logger }) {
    this.logger = logger;
    this.ready = false;
    this.routes = [];
    this.stops = [];
    this.shapesByRoute = {};
    this.routeStopsIndex = {};
    this.tripsById = {};
    this.stopTimesByStop = {};
    this.shapeDirectionById = {};
    this.tripDirectionCache = {};
    this.calendar = {
      calendarByService: {},
      calendarDatesByService: {},
      timezone: 'Pacific/Honolulu'
    };
    this.metadata = {};
  }

  async load() {
    this.routes = await readJson('routes.json', []);
    this.stops = await readJson('stops.json', []);
    this.shapesByRoute = await readJson('shapesByRoute.json', {});
    this.routeStopsIndex = await readJson('routeStopsIndex.json', {});
    this.tripsById = await readJson('tripsById.json', {});
    this.stopTimesByStop = await readJson('stopTimesByStop.json', {});
    this.calendar = await readJson('calendar.json', {
      calendarByService: {},
      calendarDatesByService: {},
      timezone: 'Pacific/Honolulu'
    });
    this.metadata = await readJson('metadata.json', {});
    this.shapeDirectionById = {};
    this.tripDirectionCache = {};

    for (const featureCollection of Object.values(this.shapesByRoute)) {
      for (const feature of featureCollection?.features || []) {
        const shapeId = feature?.properties?.shape_id;
        const coordinates = feature?.geometry?.coordinates || [];
        if (!shapeId || this.shapeDirectionById[shapeId] || coordinates.length < 2) {
          continue;
        }

        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        if (!first || !last || !Number.isFinite(first[0]) || !Number.isFinite(first[1]) || !Number.isFinite(last[0]) || !Number.isFinite(last[1])) {
          continue;
        }

        const closureMiles = distanceMiles(first[1], first[0], last[1], last[0]);
        if (closureMiles <= 0.2) {
          this.shapeDirectionById[shapeId] = {
            code: 'LOOP',
            label: 'Loop',
            is_loop: true
          };
          continue;
        }

        const bearing = initialBearingDegrees(first[1], first[0], last[1], last[0]);
        const cardinal = cardinalDirection(bearing);
        this.shapeDirectionById[shapeId] = {
          code: cardinal.code,
          label: cardinal.label,
          is_loop: false
        };
      }
    }

    this.ready = this.routes.length > 0 && this.stops.length > 0;

    this.logger.info(
      {
        routes: this.routes.length,
        stops: this.stops.length,
        trips: Object.keys(this.tripsById).length,
        stop_time_stops: Object.keys(this.stopTimesByStop).length,
        shape_directions: Object.keys(this.shapeDirectionById).length,
        ready: this.ready
      },
      'Static GTFS loaded'
    );
  }

  isReady() {
    return this.ready;
  }

  getRoutes() {
    return this.routes;
  }

  getRoute(routeId) {
    return this.routes.find((route) => route.route_id === routeId) || null;
  }

  getStops({ routeId, bbox, stopId, limit = 2000 } = {}) {
    let results = this.stops;

    if (stopId) {
      results = results.filter((stop) => stop.stop_id === stopId);
    }

    if (routeId) {
      const allowed = new Set(this.routeStopsIndex[routeId] || []);
      results = results.filter((stop) => allowed.has(stop.stop_id));
    }

    const normalizedBbox = parseBbox(bbox);
    if (normalizedBbox) {
      results = results.filter(
        (stop) =>
          stop.stop_lon >= normalizedBbox.minLon &&
          stop.stop_lon <= normalizedBbox.maxLon &&
          stop.stop_lat >= normalizedBbox.minLat &&
          stop.stop_lat <= normalizedBbox.maxLat
      );
    }

    return results.slice(0, limit);
  }

  getShape(routeId) {
    if (!routeId) {
      const allFeatures = Object.values(this.shapesByRoute).flatMap((featureCollection) => featureCollection.features || []);
      return {
        type: 'FeatureCollection',
        features: allFeatures
      };
    }

    return this.shapesByRoute[routeId] || { type: 'FeatureCollection', features: [] };
  }

  getRouteStopsIndex() {
    return this.routeStopsIndex;
  }

  getTrip(tripId) {
    return this.tripsById[tripId] || null;
  }

  getTripDirection(tripId) {
    if (!tripId) {
      return null;
    }

    if (this.tripDirectionCache[tripId]) {
      return this.tripDirectionCache[tripId];
    }

    const trip = this.tripsById[tripId];
    if (!trip) {
      return null;
    }

    const fromShape = trip.shape_id ? this.shapeDirectionById[trip.shape_id] : null;
    const fallback =
      Number.isInteger(trip.direction_id)
        ? {
            code: `DIR_${trip.direction_id}`,
            label: `Direction ${trip.direction_id}`,
            is_loop: false
          }
        : null;

    const resolved = fromShape || fallback;
    if (!resolved) {
      return null;
    }

    const output = {
      direction_id: Number.isInteger(trip.direction_id) ? trip.direction_id : null,
      direction_code: resolved.code,
      direction_label: resolved.label,
      is_loop: Boolean(resolved.is_loop)
    };

    this.tripDirectionCache[tripId] = output;
    return output;
  }

  getStopTimes(stopId) {
    return this.stopTimesByStop[stopId] || [];
  }

  getCalendar() {
    return this.calendar;
  }

  getMetadata() {
    return this.metadata;
  }
}
