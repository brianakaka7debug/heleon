import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.mjs';
import { GtfsRealtimeClient } from './gtfsRealtime.mjs';
import { StaticGtfsStore } from './staticGtfsStore.mjs';
import { buildArrivalsForStop } from './arrivals.mjs';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  },
  trustProxy: true
});

await app.register(cors, {
  origin: config.corsOrigin
});

await app.register(rateLimit, {
  max: config.rateLimitMax,
  timeWindow: config.rateLimitWindowMs,
  allowList: ['127.0.0.1', '::1']
});

const realtime = new GtfsRealtimeClient({ logger: app.log });
const staticGtfs = new StaticGtfsStore({ logger: app.log });
await staticGtfs.load();

const sseConnections = new Map();

const getIpConnectionCount = (ip) => sseConnections.get(ip) || 0;
const incrementIpConnection = (ip) => sseConnections.set(ip, getIpConnectionCount(ip) + 1);
const decrementIpConnection = (ip) => {
  const next = Math.max(0, getIpConnectionCount(ip) - 1);
  if (next === 0) {
    sseConnections.delete(ip);
  } else {
    sseConnections.set(ip, next);
  }
};

const withRtCacheHeaders = (reply) => {
  reply.header('Cache-Control', `public, max-age=${config.gtfsRtCacheSeconds}`);
};

const withStaticCacheHeaders = (reply) => {
  reply.header('Cache-Control', `public, max-age=${config.gtfsStaticCacheSeconds}`);
};

app.get('/api/health', async () => ({
  status: 'ok',
  static_gtfs_ready: staticGtfs.isReady(),
  time_zone: config.timezone,
  feeds: realtime.listFeeds()
}));

app.get('/api/monitoring/metrics', async () => ({
  generated_at: Math.floor(Date.now() / 1000),
  upstream: realtime.getStats(),
  sse_connections: Object.fromEntries(sseConnections.entries())
}));

app.get('/api/rt/:feed', async (request, reply) => {
  const feed = request.params.feed;
  if (!realtime.listFeeds().includes(feed)) {
    reply.code(404);
    return { error: `Unknown feed '${feed}'` };
  }

  try {
    const data = await realtime.getFeed(feed);
    const normalizedData =
      feed === 'vehiclepositions'
        ? {
            ...data,
            vehicles: (data.vehicles || []).map((vehicle) => {
              if (vehicle.route_id) {
                return vehicle;
              }

              const trip = vehicle.trip_id ? staticGtfs.getTrip(vehicle.trip_id) : null;
              if (!trip?.route_id) {
                return vehicle;
              }

              return {
                ...vehicle,
                route_id: trip.route_id,
                route_id_inferred: true
              };
            })
          }
        : data;

    withRtCacheHeaders(reply);
    return normalizedData;
  } catch (error) {
    reply.code(502);
    return {
      error: 'Failed to fetch upstream GTFS-RT feed',
      detail: error.message
    };
  }
});

app.get('/events/vehicles', { config: { rateLimit: false } }, async (request, reply) => {
  const ip = request.ip || 'unknown';
  if (getIpConnectionCount(ip) >= config.maxSseConnectionsPerIp) {
    reply.code(429);
    return {
      error: 'Too many SSE connections for IP',
      limit: config.maxSseConnectionsPerIp
    };
  }

  incrementIpConnection(ip);
  reply.hijack();

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const sendEvent = (event, payload) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  let previousFetchedAt = null;

  const pushVehicles = async () => {
    try {
      const data = await realtime.getFeed('vehiclepositions');
      if (data.fetched_at !== previousFetchedAt) {
        previousFetchedAt = data.fetched_at;
        sendEvent('vehicles', data);
      } else {
        reply.raw.write(': keepalive\n\n');
      }
    } catch (error) {
      sendEvent('error', {
        message: error.message,
        at: Math.floor(Date.now() / 1000)
      });
    }
  };

  await pushVehicles();
  const timer = setInterval(pushVehicles, config.sseVehicleRefreshMs);

  request.raw.on('close', () => {
    clearInterval(timer);
    decrementIpConnection(ip);
    reply.raw.end();
  });

  return reply;
});

app.get('/api/gtfs/routes', async (_, reply) => {
  withStaticCacheHeaders(reply);
  return {
    generated_at: Math.floor(Date.now() / 1000),
    routes: staticGtfs.getRoutes()
  };
});

app.get('/api/gtfs/route-stop-index', async (_, reply) => {
  withStaticCacheHeaders(reply);
  return {
    generated_at: Math.floor(Date.now() / 1000),
    route_stop_index: staticGtfs.getRouteStopsIndex()
  };
});

app.get('/api/gtfs/stops', async (request, reply) => {
  const { route_id: routeId, bbox, stop_id: stopId, limit } = request.query;
  withStaticCacheHeaders(reply);

  return {
    generated_at: Math.floor(Date.now() / 1000),
    stops: staticGtfs.getStops({
      routeId: routeId || undefined,
      bbox: bbox || undefined,
      stopId: stopId || undefined,
      limit: Number.parseInt(limit, 10) || 2000
    })
  };
});

app.get('/api/gtfs/shape', async (request, reply) => {
  const { route_id: routeId } = request.query;
  withStaticCacheHeaders(reply);
  return {
    generated_at: Math.floor(Date.now() / 1000),
    route_id: routeId || null,
    shape: staticGtfs.getShape(routeId || null)
  };
});

app.get('/api/stops/:stopId/arrivals', async (request, reply) => {
  const stopId = request.params.stopId;
  const limit = Number.parseInt(request.query.limit, 10) || 8;

  const stop = staticGtfs.getStops({ stopId, limit: 1 })[0] || null;
  if (!stop) {
    reply.code(404);
    return {
      error: 'Unknown stop_id'
    };
  }

  let tripUpdates;
  try {
    tripUpdates = await realtime.getFeed('tripupdates');
  } catch {
    tripUpdates = null;
  }

  const merged = buildArrivalsForStop({
    stopId,
    tripUpdatesFeed: tripUpdates,
    staticGtfs,
    limit,
    timezone: config.timezone
  });

  withRtCacheHeaders(reply);
  return {
    generated_at: Math.floor(Date.now() / 1000),
    stop,
    source: merged.source,
    stale: tripUpdates?.stale || false,
    arrivals: merged.arrivals
  };
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'Request failed');
  reply.code(500).send({
    error: 'Internal server error',
    detail: error.message
  });
});

app.listen({ host: config.host, port: config.port }).then(() => {
  app.log.info(`Hele-On API listening on http://${config.host}:${config.port}`);
});
