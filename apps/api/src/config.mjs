const parseIntEnv = (name, defaultValue) => {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: parseIntEnv('PORT', 8787),
  timezone: process.env.GTFS_TIMEZONE || 'Pacific/Honolulu',
  corsOrigin: process.env.CORS_ORIGIN || true,
  rateLimitMax: parseIntEnv('API_RATE_LIMIT_MAX', 60),
  rateLimitWindowMs: parseIntEnv('API_RATE_LIMIT_WINDOW_MS', 60_000),
  rtTtlMs: parseIntEnv('GTFS_RT_TTL_MS', 10_000),
  rtFetchTimeoutMs: parseIntEnv('GTFS_RT_FETCH_TIMEOUT_MS', 3_000),
  sseVehicleRefreshMs: parseIntEnv('SSE_VEHICLE_REFRESH_MS', 15_000),
  maxSseConnectionsPerIp: parseIntEnv('MAX_SSE_CONNECTIONS_PER_IP', 5),
  gtfsStaticCacheSeconds: parseIntEnv('GTFS_STATIC_CACHE_SECONDS', 86_400),
  gtfsRtCacheSeconds: parseIntEnv('GTFS_RT_CACHE_SECONDS', 10),
  endpoints: {
    vehiclepositions: process.env.GTFS_RT_VEHICLEPOSITIONS_URL || 'https://myheleonbus.org/gtfs-rt/vehiclepositions',
    tripupdates: process.env.GTFS_RT_TRIPUPDATES_URL || 'https://myheleonbus.org/gtfs-rt/tripupdates',
    alerts: process.env.GTFS_RT_ALERTS_URL || 'https://myheleonbus.org/gtfs-rt/alerts'
  }
};
