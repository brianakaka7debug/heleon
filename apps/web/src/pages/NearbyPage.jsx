import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeleOneWordmark } from '../components/HeleOneWordmark.jsx';
import { MapView } from '../components/MapView.jsx';
import { getJson } from '../lib/api.js';
import { DEVICE_LOCATION_FALLBACK } from '../lib/deviceLocation.js';

const COUNTDOWN_THRESHOLD_MINUTES = 90;
const ROUTE_RADIUS_MILES = 10;
const MAX_ROUTE_ROWS = 5;
const OVERNIGHT_GAP_MINUTES = 180;

const toRadians = (value) => (value * Math.PI) / 180;

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

const DEFAULT_ROUTE_SWATCHES = [
  { background: '#E0E0E0', text: '#111827' },
  { background: '#FFD700', text: '#111827' },
  { background: '#0288D1', text: '#FFFFFF' },
  { background: '#F57C00', text: '#FFFFFF' },
  { background: '#43A047', text: '#FFFFFF' },
  { background: '#7C3AED', text: '#FFFFFF' },
  { background: '#EF4444', text: '#FFFFFF' }
];

const hashString = (value) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const normalizeHexColor = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return `#${cleaned
      .split('')
      .map((part) => part + part)
      .join('')
      .toUpperCase()}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }

  return null;
};

const hexToRgb = (hex) => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
};

const pickTextColor = (backgroundHex, explicitTextHex) => {
  const text = normalizeHexColor(explicitTextHex);
  if (text) {
    return text;
  }

  const rgb = hexToRgb(backgroundHex);
  if (!rgb) {
    return '#FFFFFF';
  }

  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness >= 150 ? '#111827' : '#FFFFFF';
};

const resolveRouteAppearance = (route, routeKey) => {
  const bg = normalizeHexColor(route?.route_color);
  if (bg) {
    return {
      background: bg,
      text: pickTextColor(bg, route?.route_text_color)
    };
  }

  return DEFAULT_ROUTE_SWATCHES[hashString(routeKey) % DEFAULT_ROUTE_SWATCHES.length];
};

const toNumberOrInfinity = (value) => (Number.isFinite(value) ? value : Number.POSITIVE_INFINITY);

const normalizeDisplayText = (value) => {
  if (!value) {
    return '';
  }

  return String(value)
    .replace(/Hawaiian\s+Paradise\s+Park/gi, 'HPP')
    .replace(/Hawaiian\s+Paradise\s+Pk/gi, 'HPP')
    .replace(/\s+and\s+/gi, ' & ')
    .replace(/\s+/g, ' ')
    .trim();
};

const formatDistanceLabel = (distance) => {
  if (!Number.isFinite(distance)) {
    return 'Distance unknown';
  }

  if (distance < 0.1) {
    return '<0.1 mi';
  }

  return `${distance.toFixed(1)} mi`;
};

const sameCalendarDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatDayContext = (target, now) => {
  if (sameCalendarDay(target, now)) {
    return 'today';
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameCalendarDay(target, tomorrow)) {
    return 'tomorrow';
  }

  return target.toLocaleDateString([], { weekday: 'short' });
};

const formatClock = (date) =>
  new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);

const formatArrivalDisplay = (minutes) => {
  if (!Number.isFinite(minutes)) {
    return {
      primary: '--',
      secondary: 'No schedule'
    };
  }

  if (minutes <= 0) {
    return {
      primary: 'Now',
      secondary: 'Arriving'
    };
  }

  if (minutes <= COUNTDOWN_THRESHOLD_MINUTES) {
    return {
      primary: `${Math.max(1, Math.round(minutes))} min`,
      secondary: 'from now'
    };
  }

  const now = new Date();
  const target = new Date(now.getTime() + minutes * 60_000);
  return {
    primary: formatClock(target),
    secondary: formatDayContext(target, now)
  };
};

const formatBannerTime = (minutes) => {
  if (!Number.isFinite(minutes)) {
    return 'unknown';
  }

  if (minutes <= COUNTDOWN_THRESHOLD_MINUTES) {
    return `${Math.max(1, Math.round(minutes))} min`;
  }

  const now = new Date();
  const target = new Date(now.getTime() + minutes * 60_000);
  const dayLabel = formatDayContext(target, now);
  return `${formatClock(target)}${dayLabel === 'today' ? '' : ` ${dayLabel}`}`;
};

const stripRoutePrefixFromHeadsign = (headsign, routeLabel) => {
  if (!headsign || !routeLabel) {
    return headsign;
  }

  const escaped = String(routeLabel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return headsign.replace(new RegExp(`^${escaped}\\s+`, 'i'), '').trim();
};

const normalizeFallbackContext = (fallbackLabel) => {
  const normalized = normalizeDisplayText(fallbackLabel);
  return normalized
    .replace(/^HPP\s+near\s+/i, 'HPP · ')
    .replace(/\bAve\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const NearbyPage = ({ realtime }) => {
  const navigate = useNavigate();

  const [routes, setRoutes] = useState([]);
  const [allStops, setAllStops] = useState([]);
  const [routeStopIndex, setRouteStopIndex] = useState({});
  const [shape, setShape] = useState({ type: 'FeatureCollection', features: [] });
  const [userLocation, setUserLocation] = useState({
    lat: DEVICE_LOCATION_FALLBACK.lat,
    lon: DEVICE_LOCATION_FALLBACK.lon
  });
  const [locationSource, setLocationSource] = useState('device');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [arrivalsByStop, setArrivalsByStop] = useState({});
  const [arrivalsError, setArrivalsError] = useState(null);
  const [mapExpanded, setMapExpanded] = useState(false);

  useEffect(() => {
    getJson('/api/gtfs/routes')
      .then((payload) => setRoutes(payload.routes || []))
      .catch(() => setRoutes([]));

    getJson('/api/gtfs/stops?limit=10000')
      .then((payload) => setAllStops(payload.stops || []))
      .catch(() => setAllStops([]));

    getJson('/api/gtfs/route-stop-index')
      .then((payload) => setRouteStopIndex(payload.route_stop_index || {}))
      .catch(() => setRouteStopIndex({}));

    getJson('/api/gtfs/shape')
      .then((payload) => setShape(payload.shape || { type: 'FeatureCollection', features: [] }))
      .catch(() => setShape({ type: 'FeatureCollection', features: [] }));
  }, []);

  useEffect(() => {
    if (routes.length === 0 || Object.keys(routeStopIndex).length > 0) {
      return;
    }

    let cancelled = false;

    const buildRouteStopIndexFallback = async () => {
      const rows = await Promise.all(
        routes.map(async (route) => {
          try {
            const payload = await getJson(
              `/api/gtfs/stops?route_id=${encodeURIComponent(route.route_id)}&limit=5000`
            );
            const stopIds = [...new Set((payload.stops || []).map((stop) => stop.stop_id).filter(Boolean))];
            return [route.route_id, stopIds];
          } catch {
            return [route.route_id, []];
          }
        })
      );

      if (!cancelled) {
        setRouteStopIndex(Object.fromEntries(rows));
      }
    };

    buildRouteStopIndexFallback();

    return () => {
      cancelled = true;
    };
  }, [routeStopIndex, routes]);

  const routeById = useMemo(
    () => Object.fromEntries(routes.map((route) => [route.route_id, route])),
    [routes]
  );

  const stopsWithDistance = useMemo(() => {
    if (!userLocation) {
      return allStops;
    }

    return allStops
      .map((stop) => ({
        ...stop,
        distance_miles: distanceMiles(userLocation.lat, userLocation.lon, stop.stop_lat, stop.stop_lon)
      }))
      .sort((a, b) => toNumberOrInfinity(a.distance_miles) - toNumberOrInfinity(b.distance_miles));
  }, [allStops, userLocation]);

  const nearbyStops = useMemo(() => stopsWithDistance.slice(0, 32), [stopsWithDistance]);

  const stopById = useMemo(
    () => Object.fromEntries(stopsWithDistance.map((stop) => [stop.stop_id, stop])),
    [stopsWithDistance]
  );

  const routesWithinTenMiles = useMemo(
    () =>
      routes
        .map((route) => {
          const stopIds = routeStopIndex[route.route_id] || [];
          const routeStops = stopIds
            .map((stopId) => stopById[stopId])
            .filter((stop) => stop && Number.isFinite(stop.distance_miles) && stop.distance_miles <= ROUTE_RADIUS_MILES)
            .sort((a, b) => a.distance_miles - b.distance_miles);

          if (routeStops.length === 0) {
            return null;
          }

          return {
            route,
            nearestStop: routeStops[0],
            nearestDistance: routeStops[0].distance_miles,
            probeStops: routeStops.slice(0, 3)
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.nearestDistance - b.nearestDistance),
    [routeStopIndex, routes, stopById]
  );

  const nearestStopFocus = useMemo(() => {
    const nearestStop = nearbyStops.find(
      (stop) => Number.isFinite(stop.stop_lat) && Number.isFinite(stop.stop_lon)
    );
    if (!nearestStop) {
      return null;
    }

    const nearestDistanceMiles = Number.isFinite(nearestStop.distance_miles) ? nearestStop.distance_miles : 0.25;
    const radiusMiles = Math.max(nearestDistanceMiles * 1.25, 0.08);

    return {
      lat: nearestStop.stop_lat,
      lon: nearestStop.stop_lon,
      radius_miles: radiusMiles
    };
  }, [nearbyStops]);

  useEffect(() => {
    let cancelled = false;

    const loadNearbyArrivals = async () => {
      const targetStopIds =
        routesWithinTenMiles.length > 0
          ? [...new Set(routesWithinTenMiles.flatMap((candidate) => candidate.probeStops.map((stop) => stop.stop_id)))]
          : nearbyStops.slice(0, 20).map((stop) => stop.stop_id);

      const rows = await Promise.all(
        targetStopIds.map(async (stopId) => {
          try {
            const payload = await getJson(`/api/stops/${encodeURIComponent(stopId)}/arrivals?limit=8`);
            return {
              stopId,
              arrivals: payload.arrivals || [],
              ok: true
            };
          } catch {
            return {
              stopId,
              arrivals: [],
              ok: false
            };
          }
        })
      );

      if (!cancelled) {
        const successCount = rows.filter((row) => row.ok).length;
        setArrivalsByStop(Object.fromEntries(rows.map((row) => [row.stopId, row.arrivals])));
        if (rows.length > 0 && successCount === 0) {
          setArrivalsError('Arrival service is unreachable right now. Check that the API process is running.');
        } else {
          setArrivalsError(null);
        }
      }
    };

    if (stopsWithDistance.length > 0) {
      loadNearbyArrivals();
    }

    return () => {
      cancelled = true;
    };
  }, [nearbyStops, routesWithinTenMiles, stopsWithDistance.length]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Location is not supported on this browser.');
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
        setLocationSource('gps');
        setLocationLoading(false);
      },
      () => {
        setLocationError(
          `Could not access phone GPS. Using fallback location: ${DEVICE_LOCATION_FALLBACK.label || `${DEVICE_LOCATION_FALLBACK.city}, ${DEVICE_LOCATION_FALLBACK.region}`}.`
        );
        setUserLocation({
          lat: DEVICE_LOCATION_FALLBACK.lat,
          lon: DEVICE_LOCATION_FALLBACK.lon
        });
        setLocationSource('device');
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 60_000
      }
    );
  };

  const routeSelection = useMemo(() => {
    const optionByKey = new Map();

    for (const [stopId, arrivals] of Object.entries(arrivalsByStop)) {
      const stop = stopById[stopId];
      if (!stop || !Number.isFinite(stop.distance_miles) || stop.distance_miles > ROUTE_RADIUS_MILES) {
        continue;
      }

      for (const arrival of arrivals || []) {
        const routeId = arrival.route_id || null;
        if (!routeId) {
          continue;
        }

        const minutes = Number.isFinite(arrival.arrival_in_minutes) ? arrival.arrival_in_minutes : null;
        if (!Number.isFinite(minutes)) {
          continue;
        }

        const route = routeById[routeId] || null;
        const routeLabel = route?.route_short_name || routeId;
        const appearance = resolveRouteAppearance(route, routeId);
        const rawHeadsign =
          arrival.headsign || route?.route_long_name || route?.route_desc || `Route ${routeLabel}`;
        let normalizedHeadsign = normalizeDisplayText(rawHeadsign);
        normalizedHeadsign = stripRoutePrefixFromHeadsign(normalizedHeadsign, routeLabel);
        if (!/^TO\s+/i.test(normalizedHeadsign) && !/^LOOP/i.test(normalizedHeadsign)) {
          normalizedHeadsign = `TO ${normalizedHeadsign}`;
        }
        normalizedHeadsign = normalizedHeadsign.toUpperCase();

        const optionKey = `${routeId}|${normalizedHeadsign}|${arrival.direction_label || ''}`;
        const existing = optionByKey.get(optionKey);

        if (
          existing &&
          (minutes > existing.minutes ||
            (minutes === existing.minutes && stop.distance_miles >= existing.stopDistanceMiles))
        ) {
          continue;
        }

        const timeDisplay = formatArrivalDisplay(minutes);
        optionByKey.set(optionKey, {
          key: optionKey,
          routeId,
          stopId,
          routeLabel,
          headsign: normalizedHeadsign,
          stopName: normalizeDisplayText(stop.stop_name || stopId),
          distanceLabel: formatDistanceLabel(stop.distance_miles),
          stopDistanceMiles: stop.distance_miles,
          minutes,
          isRealtime: Boolean(arrival.is_realtime),
          badgeBackgroundColor: appearance.background,
          badgeTextColor: appearance.text,
          timePrimary: timeDisplay.primary,
          timeSecondary: timeDisplay.secondary
        });
      }
    }

    const rows = [...optionByKey.values()].sort(
      (a, b) => a.minutes - b.minutes || a.stopDistanceMiles - b.stopDistanceMiles
    );

    return {
      rows: rows.slice(0, MAX_ROUTE_ROWS),
      totalCandidatesWithinTen: routesWithinTenMiles.length,
      totalScheduledWithinTen: rows.length
    };
  }, [arrivalsByStop, routeById, routesWithinTenMiles.length, stopById]);

  const routeRows = routeSelection.rows;
  const firstUpcoming = routeRows[0] || null;

  const serviceBanner = useMemo(() => {
    if (arrivalsError) {
      return {
        tone: 'warning',
        icon: '⚠',
        text: arrivalsError
      };
    }

    if (!firstUpcoming) {
      return null;
    }

    const nextBusText = `Next bus: Route ${firstUpcoming.routeLabel} at ${formatBannerTime(firstUpcoming.minutes)} from ${firstUpcoming.stopName}.`;
    const hasLiveVehicles = realtime.vehicles.length > 0 && !realtime.vehicleStale;

    if (!hasLiveVehicles) {
      const hour = new Date().getHours();
      const overnightWindow = hour >= 20 || hour < 5;
      if (overnightWindow && firstUpcoming.minutes >= OVERNIGHT_GAP_MINUTES) {
        return {
          tone: 'night',
          icon: '🌙',
          text: `Service ended for tonight. ${nextBusText}`
        };
      }

      return {
        tone: 'info',
        icon: 'ℹ',
        text: `Live tracking unavailable. ${nextBusText}`
      };
    }

    return null;
  }, [arrivalsError, firstUpcoming, realtime.vehicleStale, realtime.vehicles.length]);

  const locationContextText = useMemo(() => {
    if (locationSource === 'gps') {
      return 'Stops near your current location';
    }

    const fallbackContext = normalizeFallbackContext(
      DEVICE_LOCATION_FALLBACK.label || `${DEVICE_LOCATION_FALLBACK.city}, ${DEVICE_LOCATION_FALLBACK.region}`
    );
    return `Stops near ${fallbackContext}`;
  }, [locationSource]);

  const openRowTarget = (row) => {
    if (row.stopId) {
      navigate(`/stops/${row.stopId}`);
      return;
    }

    if (row.routeId) {
      navigate(`/routes/${row.routeId}`);
    }
  };

  return (
    <section className="nearby-redesign">
      <div className={`nearby-map-panel ${mapExpanded ? 'expanded' : 'compact'}`}>
        <MapView
          shapeFeatureCollection={shape}
          vehicles={realtime.vehicles}
          stops={nearbyStops.slice(0, 40)}
          initialFocus={nearestStopFocus}
          recenterOnFocusChange
          showNavigationControl={false}
          showAttributionControl={false}
          onStopSelect={(stopId) => navigate(`/stops/${stopId}`)}
        />

        <div className="nearby-map-actions">
          <button
            type="button"
            className="nearby-map-pill"
            onClick={() => setMapExpanded((value) => !value)}
          >
            {mapExpanded ? 'Collapse map' : 'Expand map'}
          </button>
          <button
            type="button"
            className="nearby-map-icon-pill"
            aria-label="Use current location"
            onClick={requestLocation}
            disabled={locationLoading}
          >
            {locationLoading ? '…' : '◎'}
          </button>
        </div>
      </div>

      <div className="nearby-list-panel">
        <div className="nearby-list-header">
          <HeleOneWordmark className="nearby-header-wordmark" size="large" />
        </div>

        <div className="nearby-context-row">
          <p className="nearby-context-text">{locationContextText}</p>
          <button type="button" className="nearby-context-change" onClick={requestLocation} disabled={locationLoading}>
            Change
          </button>
        </div>

        {serviceBanner ? (
          <p className={`nearby-service-strip ${serviceBanner.tone}`}>
            <span>{serviceBanner.icon}</span>
            <span>{serviceBanner.text}</span>
          </p>
        ) : null}
        {locationError ? <p className="error nearby-error">{locationError}</p> : null}

        <div className="nearby-route-list">
          {routeRows.length > 0 ? (
            routeRows.map((row) => (
              <button
                key={row.key}
                type="button"
                className="nearby-route-row"
                style={{
                  '--route-badge-bg': row.badgeBackgroundColor,
                  '--route-badge-text': row.badgeTextColor,
                  '--route-accent': row.badgeBackgroundColor
                }}
                onClick={() => openRowTarget(row)}
              >
                <span className="nearby-route-accent" />
                <div className="nearby-route-icon">{row.routeLabel}</div>
                <div className="nearby-route-copy">
                  <p className="nearby-route-destination">{row.headsign}</p>
                  <p className="nearby-route-subtext">
                    {row.stopName} · {row.distanceLabel}
                  </p>
                </div>
                <div className="nearby-route-time">
                  <p className="nearby-route-minutes">{row.timePrimary}</p>
                  <p className="nearby-route-min-label">
                    {row.timeSecondary}
                    {row.isRealtime ? <span className="nearby-live-dot" aria-label="Live trip" /> : null}
                  </p>
                </div>
                <span className="nearby-route-chevron">›</span>
              </button>
            ))
          ) : (
            <p className="hint">No routes within 10 miles currently show upcoming scheduled service.</p>
          )}
        </div>

        <p className="nearby-map-credit">Map data © CARTO, © OpenStreetMap contributors</p>
      </div>
    </section>
  );
};
