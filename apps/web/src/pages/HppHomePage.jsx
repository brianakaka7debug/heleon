import { useEffect, useMemo, useState } from 'react';
import { getJson } from '../lib/api.js';
import { DEVICE_LOCATION_FALLBACK } from '../lib/deviceLocation.js';
import './HppHomePage.css';

const ROUTE_RADIUS_MILES = 10;
const MAX_ROUTE_ROWS = 6;

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

const formatDistance = (miles) => {
  if (!Number.isFinite(miles)) {
    return '--';
  }

  if (miles < 0.15) {
    return `${Math.max(50, Math.round(miles * 1609))} m`;
  }

  return `${miles.toFixed(1)} mi`;
};

const walkMinutesFromDistance = (miles) => {
  if (!Number.isFinite(miles)) {
    return 0;
  }

  return Math.max(1, Math.round((miles / 3) * 60));
};

const parseHexColor = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim().replace(/^#/, '');
  if (/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }

  if (/^[0-9A-Fa-f]{3}$/.test(cleaned)) {
    return `#${cleaned
      .split('')
      .map((part) => part + part)
      .join('')
      .toUpperCase()}`;
  }

  return null;
};

const textColorForBackground = (hex) => {
  if (!hex) {
    return '#ffffff';
  }

  const normalized = parseHexColor(hex);
  if (!normalized) {
    return '#ffffff';
  }

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 150 ? '#1e2329' : '#ffffff';
};

const fallbackRouteColors = ['#EA1568', '#4D9A56', '#F18800', '#007F76', '#5B6ABF', '#7B6DAF'];

const fallbackColorForRoute = (routeId) => {
  const source = String(routeId || 'route');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0;
  }

  return fallbackRouteColors[Math.abs(hash) % fallbackRouteColors.length];
};

const formatArrival = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { value: '--', unit: 'min' };
  }

  if (minutes >= 110) {
    return { value: `${Math.max(1, Math.round(minutes / 60))}`, unit: 'hr' };
  }

  if (minutes >= 55) {
    return { value: '~1', unit: 'hr' };
  }

  return { value: `${Math.max(1, Math.round(minutes))}`, unit: 'min' };
};

const formatUpdatedLabel = (timestampMs) => {
  if (!timestampMs) {
    return 'Updated just now';
  }

  const now = Date.now();
  const seconds = Math.round((now - timestampMs) / 1000);
  if (seconds < 60) {
    return `Updated ${Math.max(1, seconds)}s ago`;
  }

  if (seconds < 3600) {
    return `Updated ${Math.round(seconds / 60)}m ago`;
  }

  return `Updated ${new Date(timestampMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

const splitHeadsign = (headsign, fallbackTitle) => {
  const normalized = normalizeDisplayText(headsign || fallbackTitle || 'Route service');
  const withoutTo = normalized.replace(/^TO\s+/i, '');
  const [destinationRaw, viaRaw] = withoutTo.split(/\s+VIA\s+/i);
  const destination = destinationRaw || fallbackTitle || 'Service';

  return {
    toward: `To ${destination.split(/\s+/).slice(0, 2).join(' ')}`,
    destination,
    line: viaRaw ? `Via ${viaRaw}` : fallbackTitle || 'Nearby stop'
  };
};

export const HppHomePage = () => {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [locationError, setLocationError] = useState(null);
  const [arrivalsByStop, setArrivalsByStop] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [loadError, setLoadError] = useState(null);
  const [activeTab, setActiveTab] = useState('buses');

  const [userLocation, setUserLocation] = useState({
    lat: DEVICE_LOCATION_FALLBACK.lat,
    lon: DEVICE_LOCATION_FALLBACK.lon
  });

  useEffect(() => {
    getJson('/api/gtfs/routes')
      .then((payload) => setRoutes(payload.routes || []))
      .catch(() => setRoutes([]));

    getJson('/api/gtfs/stops?limit=10000')
      .then((payload) => setStops(payload.stops || []))
      .catch(() => setStops([]));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
        setLocationError(null);
      },
      () => {
        setLocationError(`Using fallback location: ${DEVICE_LOCATION_FALLBACK.label}`);
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 60_000
      }
    );
  }, []);

  const routeById = useMemo(
    () => Object.fromEntries(routes.map((route) => [route.route_id, route])),
    [routes]
  );

  const nearbyStops = useMemo(() => {
    return stops
      .map((stop) => ({
        ...stop,
        distance_miles: distanceMiles(userLocation.lat, userLocation.lon, stop.stop_lat, stop.stop_lon)
      }))
      .filter((stop) => Number.isFinite(stop.distance_miles) && stop.distance_miles <= ROUTE_RADIUS_MILES)
      .sort((a, b) => a.distance_miles - b.distance_miles)
      .slice(0, 24);
  }, [stops, userLocation]);

  const stopById = useMemo(
    () => Object.fromEntries(nearbyStops.map((stop) => [stop.stop_id, stop])),
    [nearbyStops]
  );

  const refreshArrivals = async () => {
    if (nearbyStops.length === 0 || refreshing) {
      return;
    }

    setRefreshing(true);

    const rows = await Promise.all(
      nearbyStops.map(async (stop) => {
        try {
          const payload = await getJson(`/api/stops/${encodeURIComponent(stop.stop_id)}/arrivals?limit=8`);
          return [stop.stop_id, payload.arrivals || [], true];
        } catch {
          return [stop.stop_id, [], false];
        }
      })
    );

    const successCount = rows.filter((row) => row[2]).length;
    setArrivalsByStop(Object.fromEntries(rows.map(([stopId, arrivals]) => [stopId, arrivals])));

    if (successCount === 0) {
      setLoadError('Arrival service is temporarily unavailable.');
    } else {
      setLoadError(null);
      setUpdatedAt(Date.now());
    }

    setRefreshing(false);
  };

  useEffect(() => {
    refreshArrivals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyStops.length]);

  const cards = useMemo(() => {
    const bestByKey = new Map();

    for (const [stopId, arrivals] of Object.entries(arrivalsByStop)) {
      const stop = stopById[stopId];
      if (!stop) {
        continue;
      }

      for (const arrival of arrivals || []) {
        const routeId = arrival.route_id;
        const minutes = Number.isFinite(arrival.arrival_in_minutes) ? arrival.arrival_in_minutes : null;
        if (!routeId || !Number.isFinite(minutes)) {
          continue;
        }

        const route = routeById[routeId] || null;
        const routeLabel = route?.route_short_name || routeId;
        const headsign = arrival.headsign || route?.route_long_name || route?.route_desc || `Route ${routeLabel}`;
        const normalizedHeadsign = normalizeDisplayText(headsign);
        const key = `${routeId}|${normalizedHeadsign}|${arrival.direction_label || ''}`;

        const existing = bestByKey.get(key);
        if (existing && (minutes > existing.minutes || (minutes === existing.minutes && stop.distance_miles >= existing.distance_miles))) {
          continue;
        }

        const routeColor = parseHexColor(route?.route_color) || fallbackColorForRoute(routeId);
        const textColor = textColorForBackground(routeColor);
        const copy = splitHeadsign(normalizedHeadsign, normalizeDisplayText(stop.stop_name || route?.route_long_name || routeLabel));

        bestByKey.set(key, {
          key,
          routeLabel,
          toward: copy.toward,
          destination: copy.destination,
          line: copy.line,
          minutes,
          arrival: formatArrival(minutes),
          walkMin: walkMinutesFromDistance(stop.distance_miles),
          distance: formatDistance(stop.distance_miles),
          color: routeColor,
          textColor,
          distance_miles: stop.distance_miles
        });
      }
    }

    return [...bestByKey.values()]
      .sort((a, b) => a.minutes - b.minutes || a.distance_miles - b.distance_miles)
      .slice(0, MAX_ROUTE_ROWS);
  }, [arrivalsByStop, routeById, stopById]);

  return (
    <div className="hpp-app">
      <header className="hpp-topbar">
        <h1>HELE-ON HPP</h1>
      </header>

      <main className="hpp-content">
        <div className="hpp-location-kicker">
          <span className="material-symbols-outlined" aria-hidden="true">near_me</span>
          <span>YOUR LOCATION</span>
        </div>

        <h2 className="hpp-hero-title">HPP - Makuʻu Dr</h2>
        <p className="hpp-hero-subtitle">Keaʻau-Pāhoa Rd &amp; Makuʻu</p>

        <section className="hpp-map-card" aria-label="Location map">
          <svg width="100%" height="100%" viewBox="0 0 460 240" aria-hidden="true" focusable="false">
            <rect width="460" height="240" fill="#c8e0e5" />
            <path
              d="M-40 270 L-40 40 C90 44 145 68 205 88 C268 109 330 129 410 145 L462 270 Z"
              fill="#e8e3d9"
              stroke="#8f7f75"
              strokeWidth="2"
            />
            <path d="M54 120 L315 177" stroke="#a49387" strokeWidth="4" strokeLinecap="round" opacity="0.82" />
            <path d="M238 148 L278 270" stroke="#b8a99e" strokeWidth="3" strokeLinecap="round" opacity="0.56" />
            <path d="M273 160 L303 270" stroke="#b8a99e" strokeWidth="3" strokeLinecap="round" opacity="0.56" />
            <path
              d="M90 132 L232 182 L247 224 L170 202"
              fill="none"
              stroke="#ea1568"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="232" cy="183" r="11" fill="#ea1568" stroke="#ffffff" strokeWidth="4" />
          </svg>
          <div className="hpp-map-badge">Puna District</div>
        </section>

        <section className="hpp-section-head">
          <h2>Nearby Buses</h2>
          <button
            id="refreshBtn"
            className={`hpp-refresh-btn ${refreshing ? 'refreshing' : ''}`}
            type="button"
            aria-label="Refresh nearby buses"
            onClick={refreshArrivals}
            disabled={refreshing}
          >
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
            <span>{refreshing ? 'Updating' : 'Refresh'}</span>
          </button>
        </section>

        <p className="hpp-updated" aria-live="polite">{formatUpdatedLabel(updatedAt)}</p>
        {locationError ? <p className="hpp-note">{locationError}</p> : null}
        {loadError ? <p className="hpp-note">{loadError}</p> : null}

        <section className="hpp-list" aria-live="polite">
          {cards.length > 0 ? (
            cards.map((route) => (
              <article className="hpp-bus-card" key={route.key} data-route-id={route.routeLabel}>
                <div className="hpp-card-main">
                  <div className={`hpp-route-chip ${route.routeLabel.toLowerCase() === 'kona' ? 'kona' : ''}`} style={{ background: route.color }}>
                    {route.routeLabel}
                  </div>
                  <div className="hpp-card-copy">
                    <div className="hpp-trip-meta">
                      <div className="hpp-toward" style={{ color: route.color }}>{route.toward}</div>
                      <h3 className="hpp-destination" title={route.destination}>{route.destination}</h3>
                      <p className="hpp-line" title={route.line}>{route.line}</p>
                    </div>
                    <div className="hpp-arrival" aria-label={`Arrival in ${route.arrival.value} ${route.arrival.unit}`}>
                      <span className="hpp-arrival-value" style={{ color: route.color }}>{route.arrival.value}</span>
                      <span className="hpp-arrival-unit">{route.arrival.unit}</span>
                    </div>
                  </div>
                </div>
                <div className="hpp-card-foot">
                  <span className="material-symbols-outlined" aria-hidden="true">directions_walk</span>
                  <div className="hpp-walk"><strong>{route.walkMin} min</strong> <span className="hpp-walk-sub">walk to stop</span></div>
                  <div className="hpp-distance">{route.distance}</div>
                </div>
              </article>
            ))
          ) : (
            <div className="hpp-empty-state">
              <p>No routes available right now. Tap refresh to try again.</p>
            </div>
          )}
        </section>
      </main>

      <div className="hpp-bottom-nav-wrap">
        <nav className="hpp-bottom-nav" aria-label="Primary">
          <button className={`hpp-tab ${activeTab === 'buses' ? 'active' : ''}`} data-tab="buses" type="button" onClick={() => setActiveTab('buses')}>
            <span className="icon-box"><span className="material-symbols-outlined">directions_bus</span></span>
            <span>Buses</span>
          </button>
          <button className={`hpp-tab ${activeTab === 'map' ? 'active' : ''}`} data-tab="map" type="button" onClick={() => setActiveTab('map')}>
            <span className="icon-box"><span className="material-symbols-outlined">map</span></span>
            <span>Map</span>
          </button>
          <button className={`hpp-tab ${activeTab === 'saved' ? 'active' : ''}`} data-tab="saved" type="button" onClick={() => setActiveTab('saved')}>
            <span className="icon-box"><span className="material-symbols-outlined">favorite</span></span>
            <span>Saved</span>
          </button>
          <button className={`hpp-tab ${activeTab === 'settings' ? 'active' : ''}`} data-tab="settings" type="button" onClick={() => setActiveTab('settings')}>
            <span className="icon-box"><span className="material-symbols-outlined">settings_accessibility</span></span>
            <span>Settings</span>
          </button>
        </nav>
      </div>

      {/* TODO(next-ui-safe-area): add full safe-area strategy (top notch/home indicator, keyboard inset, and reduced-motion map resizing) after device matrix validation. */}
    </div>
  );
};
