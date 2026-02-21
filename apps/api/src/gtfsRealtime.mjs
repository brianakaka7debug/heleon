import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { config } from './config.mjs';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

const toNumberOrNull = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
};

const FEED_NAMES = ['vehiclepositions', 'tripupdates', 'alerts'];

const normalizeVehiclePositions = (feed) => {
  const vehicles = [];

  for (const entity of feed.entity || []) {
    const vehicle = entity.vehicle;
    if (!vehicle?.position) {
      continue;
    }

    vehicles.push({
      entity_id: entity.id || null,
      vehicle_id: vehicle.vehicle?.id || vehicle.vehicle?.label || null,
      trip_id: vehicle.trip?.tripId || null,
      route_id: vehicle.trip?.routeId || null,
      direction_id: toNumberOrNull(vehicle.trip?.directionId),
      lat: toNumberOrNull(vehicle.position.latitude),
      lon: toNumberOrNull(vehicle.position.longitude),
      bearing: toNumberOrNull(vehicle.position.bearing),
      speed: toNumberOrNull(vehicle.position.speed),
      timestamp: toNumberOrNull(vehicle.timestamp)
    });
  }

  return {
    vehicles,
    entity_count: feed.entity?.length || 0,
    feed_timestamp: toNumberOrNull(feed.header?.timestamp)
  };
};

const normalizeTripUpdates = (feed) => {
  const updates = [];
  const byStop = {};

  for (const entity of feed.entity || []) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate) {
      continue;
    }

    const trip = tripUpdate.trip;
    const tripId = trip?.tripId || null;
    const routeId = trip?.routeId || null;

    for (const stopUpdate of tripUpdate.stopTimeUpdate || []) {
      const arrival = toNumberOrNull(stopUpdate.arrival?.time);
      const departure = toNumberOrNull(stopUpdate.departure?.time);
      const stopId = stopUpdate.stopId || null;

      const normalized = {
        trip_id: tripId,
        route_id: routeId,
        stop_id: stopId,
        stop_sequence: toNumberOrNull(stopUpdate.stopSequence),
        arrival_time: arrival,
        departure_time: departure,
        delay_seconds: toNumberOrNull(stopUpdate.arrival?.delay ?? stopUpdate.departure?.delay),
        schedule_relationship: stopUpdate.scheduleRelationship || null
      };

      updates.push(normalized);

      if (stopId) {
        if (!byStop[stopId]) {
          byStop[stopId] = [];
        }
        byStop[stopId].push(normalized);
      }
    }
  }

  return {
    updates,
    by_stop: byStop,
    entity_count: feed.entity?.length || 0,
    feed_timestamp: toNumberOrNull(feed.header?.timestamp)
  };
};

const normalizeAlerts = (feed) => {
  const alerts = [];

  for (const entity of feed.entity || []) {
    const alert = entity.alert;
    if (!alert) {
      continue;
    }

    alerts.push({
      entity_id: entity.id || null,
      active_periods: (alert.activePeriod || []).map((period) => ({
        start: toNumberOrNull(period.start),
        end: toNumberOrNull(period.end)
      })),
      informed_entities: (alert.informedEntity || []).map((item) => ({
        route_id: item.routeId || null,
        stop_id: item.stopId || null,
        trip_id: item.trip?.tripId || null
      })),
      header_text: alert.headerText?.translation?.[0]?.text || null,
      description_text: alert.descriptionText?.translation?.[0]?.text || null,
      cause: alert.cause || null,
      effect: alert.effect || null
    });
  }

  return {
    alerts,
    entity_count: feed.entity?.length || 0,
    feed_timestamp: toNumberOrNull(feed.header?.timestamp)
  };
};

const normalizeFeed = (feedName, feed) => {
  if (feedName === 'vehiclepositions') {
    return normalizeVehiclePositions(feed);
  }

  if (feedName === 'tripupdates') {
    return normalizeTripUpdates(feed);
  }

  if (feedName === 'alerts') {
    return normalizeAlerts(feed);
  }

  throw new Error(`Unsupported feed: ${feedName}`);
};

const newFeedStats = () => ({
  total_fetches: 0,
  total_errors: 0,
  total_stale_served: 0,
  last_status: 'never',
  last_error: null,
  last_latency_ms: null,
  last_success_at: null,
  last_entity_count: null,
  zero_entity_since: null
});

export class GtfsRealtimeClient {
  constructor({ logger }) {
    this.logger = logger;
    this.cache = new Map();
    this.stats = new Map(FEED_NAMES.map((feed) => [feed, newFeedStats()]));
  }

  listFeeds() {
    return [...FEED_NAMES];
  }

  getStats() {
    const output = {};
    for (const feedName of FEED_NAMES) {
      output[feedName] = { ...this.stats.get(feedName) };
    }
    return output;
  }

  async getFeed(feedName, options = {}) {
    const { forceRefresh = false } = options;
    const now = Date.now();

    const cached = this.cache.get(feedName);
    if (!forceRefresh && cached && now - cached.cached_at_ms <= config.rtTtlMs) {
      return {
        ...cached.data,
        cache_hit: true
      };
    }

    if (cached?.inflight) {
      return cached.inflight;
    }

    const inflight = this.#refresh(feedName)
      .finally(() => {
        const current = this.cache.get(feedName);
        if (current) {
          delete current.inflight;
        }
      });

    this.cache.set(feedName, {
      ...(cached || {}),
      inflight
    });

    return inflight;
  }

  async #refresh(feedName) {
    if (!FEED_NAMES.includes(feedName)) {
      throw new Error(`Unsupported feed '${feedName}'`);
    }

    const feedStats = this.stats.get(feedName);
    feedStats.total_fetches += 1;

    const endpoint = config.endpoints[feedName];
    const startedAt = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.rtFetchTimeoutMs);

      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/x-protobuf, application/octet-stream, */*'
        }
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Upstream ${feedName} responded ${response.status}`);
      }

      const rawBody = Buffer.from(await response.arrayBuffer());
      const decoded = FeedMessage.decode(new Uint8Array(rawBody));
      const normalized = normalizeFeed(feedName, decoded);

      const result = {
        fetched_at: Math.floor(Date.now() / 1000),
        stale: false,
        source_url: endpoint,
        ...normalized
      };

      this.cache.set(feedName, {
        data: result,
        cached_at_ms: Date.now()
      });

      feedStats.last_status = 'ok';
      feedStats.last_error = null;
      feedStats.last_success_at = result.fetched_at;
      feedStats.last_entity_count = result.entity_count;
      feedStats.last_latency_ms = Date.now() - startedAt;
      if ((result.entity_count || 0) === 0) {
        if (!feedStats.zero_entity_since) {
          feedStats.zero_entity_since = result.fetched_at;
        }
      } else {
        feedStats.zero_entity_since = null;
      }

      const zeroDuration =
        feedStats.zero_entity_since && feedStats.last_success_at
          ? feedStats.last_success_at - feedStats.zero_entity_since
          : 0;

      if (feedName === 'vehiclepositions' && zeroDuration >= 900) {
        this.logger.warn(
          {
            feed: feedName,
            zero_entity_since: feedStats.zero_entity_since,
            zero_entity_duration_seconds: zeroDuration
          },
          'Vehicle feed has been empty for over 15 minutes'
        );
      }

      this.logger.info(
        {
          feed: feedName,
          latency_ms: feedStats.last_latency_ms,
          entity_count: result.entity_count,
          feed_timestamp: result.feed_timestamp
        },
        'GTFS-RT fetch success'
      );

      return result;
    } catch (error) {
      const cached = this.cache.get(feedName)?.data;
      feedStats.total_errors += 1;
      feedStats.last_status = 'error';
      feedStats.last_error = error.message;
      feedStats.last_latency_ms = Date.now() - startedAt;

      this.logger.error(
        {
          feed: feedName,
          err: error.message,
          latency_ms: feedStats.last_latency_ms
        },
        'GTFS-RT fetch failed'
      );

      if (cached) {
        feedStats.total_stale_served += 1;
        return {
          ...cached,
          stale: true,
          stale_reason: error.message,
          stale_at: Math.floor(Date.now() / 1000)
        };
      }

      throw error;
    }
  }
}
