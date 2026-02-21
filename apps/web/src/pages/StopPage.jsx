import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrivalRow } from '../components/ArrivalRow.jsx';
import { MapView } from '../components/MapView.jsx';
import { ServiceStrip } from '../components/ServiceStrip.jsx';
import { getJson } from '../lib/api.js';

export const StopPage = ({ favorites, onToggleStop, realtime }) => {
  const { stopId } = useParams();
  const [stop, setStop] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [shape, setShape] = useState({ type: 'FeatureCollection', features: [] });
  const [arrivalsPayload, setArrivalsPayload] = useState({ source: 'scheduled', arrivals: [] });
  const [viewMode, setViewMode] = useState('arrivals');
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    getJson(`/api/gtfs/stops?stop_id=${encodeURIComponent(stopId)}&limit=1`)
      .then((payload) => {
        setStop((payload.stops || [])[0] || null);
      })
      .catch(() => setStop(null));

    getJson('/api/gtfs/routes')
      .then((payload) => setRoutes(payload.routes || []))
      .catch(() => setRoutes([]));

    getJson('/api/gtfs/shape')
      .then((payload) => setShape(payload.shape || { type: 'FeatureCollection', features: [] }))
      .catch(() => setShape({ type: 'FeatureCollection', features: [] }));
  }, [stopId]);

  useEffect(() => {
    let timer;
    let cancelled = false;

    const loadArrivals = async () => {
      try {
        const payload = await getJson(`/api/stops/${encodeURIComponent(stopId)}/arrivals?limit=8`);
        if (!cancelled) {
          setArrivalsPayload(payload);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message);
        }
      }
    };

    loadArrivals();
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadArrivals();
      }
    }, 20_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [stopId]);

  const isFavorite = favorites.stops.includes(stopId);

  const routeById = useMemo(
    () => Object.fromEntries(routes.map((route) => [route.route_id, route])),
    [routes]
  );

  const routeIdsForStop = useMemo(
    () => [...new Set((arrivalsPayload.arrivals || []).map((arrival) => arrival.route_id).filter(Boolean))],
    [arrivalsPayload.arrivals]
  );

  const stopShape = useMemo(() => {
    if (routeIdsForStop.length === 0) {
      return { type: 'FeatureCollection', features: [] };
    }

    return {
      type: 'FeatureCollection',
      features: (shape.features || []).filter((feature) => routeIdsForStop.includes(feature.properties?.route_id))
    };
  }, [routeIdsForStop, shape.features]);

  const mapVehicles = useMemo(() => {
    if (routeIdsForStop.length === 0) {
      return realtime.vehicles;
    }
    return realtime.vehicles.filter((vehicle) => routeIdsForStop.includes(vehicle.route_id));
  }, [realtime.vehicles, routeIdsForStop]);

  const routeLabelFor = (routeId) => {
    const route = routeId ? routeById[routeId] : null;
    return route?.route_short_name || route?.route_long_name || route?.route_id || routeId || 'Route';
  };

  const serviceMessage = useMemo(() => {
    if (arrivalsPayload.stale) {
      return { tone: 'warning', message: 'Live feed is stale. Showing last known arrival data.' };
    }
    if (arrivalsPayload.source === 'scheduled') {
      return { tone: 'info', message: 'No real-time ETAs at this stop right now. Showing schedule.' };
    }
    return { tone: 'ok', message: 'Live arrival data is active for this stop.' };
  }, [arrivalsPayload.source, arrivalsPayload.stale]);

  const lastUpdatedLabel = useMemo(() => {
    if (!arrivalsPayload.generated_at) {
      return 'Updated time unavailable';
    }

    return `Updated ${new Date(arrivalsPayload.generated_at * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  }, [arrivalsPayload.generated_at]);

  return (
    <section className="page">
      <div className="row-between">
        <h1>{stop?.stop_name || `Stop ${stopId}`}</h1>
        <button className="secondary" onClick={() => onToggleStop(stopId)} type="button">
          {isFavorite ? 'Unfavorite' : 'Favorite'}
        </button>
      </div>

      <p className="hint">{stop?.stop_code ? `Stop ${stop.stop_code}` : stopId} • {lastUpdatedLabel}</p>
      <ServiceStrip tone={serviceMessage.tone} message={serviceMessage.message} />

      {realtime.alerts.length > 0 ? (
        <ServiceStrip tone="warning" message={realtime.alerts[0].header_text || 'Service alert in effect'} />
      ) : null}

      <div className="card">
        <div className="row-between">
          <strong>View</strong>
          <div className="segmented-control">
            <button className={viewMode === 'arrivals' ? 'active' : ''} type="button" onClick={() => setViewMode('arrivals')}>
              Arrivals
            </button>
            <button className={viewMode === 'map' ? 'active' : ''} type="button" onClick={() => setViewMode('map')}>
              Map
            </button>
          </div>
        </div>
      </div>

      {loadError ? <p className="error">Could not load arrivals: {loadError}</p> : null}

      {viewMode === 'arrivals' ? (
        arrivalsPayload.arrivals?.length ? (
          <div className="arrival-list">
            {arrivalsPayload.arrivals.map((arrival) => (
              <ArrivalRow
                key={`${arrival.trip_id || 'trip'}-${arrival.arrival_label}-${arrival.arrival_in_minutes}`}
                arrival={arrival}
                routeLabel={routeLabelFor(arrival.route_id)}
              />
            ))}
          </div>
        ) : (
          <p className="empty">No upcoming departures shown right now. Check schedule and refresh shortly.</p>
        )
      ) : (
        <MapView shapeFeatureCollection={stopShape} vehicles={mapVehicles} stops={stop ? [stop] : []} />
      )}
    </section>
  );
};
