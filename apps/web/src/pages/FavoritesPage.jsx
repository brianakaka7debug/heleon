import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ServiceStrip } from '../components/ServiceStrip.jsx';
import { StopCard } from '../components/StopCard.jsx';
import { getJson } from '../lib/api.js';

export const FavoritesPage = ({ favorites, realtime }) => {
  const [routes, setRoutes] = useState([]);
  const [stopsById, setStopsById] = useState({});
  const [arrivalsByStop, setArrivalsByStop] = useState({});

  useEffect(() => {
    getJson('/api/gtfs/routes')
      .then((payload) => setRoutes(payload.routes || []))
      .catch(() => setRoutes([]));
  }, []);

  useEffect(() => {
    if (favorites.stops.length === 0) {
      setStopsById({});
      return;
    }

    Promise.all(
      favorites.stops.map((stopId) =>
        getJson(`/api/gtfs/stops?stop_id=${encodeURIComponent(stopId)}&limit=1`).then((payload) => [stopId, payload.stops?.[0] || null])
      )
    )
      .then((rows) => setStopsById(Object.fromEntries(rows)))
      .catch(() => setStopsById({}));
  }, [favorites.stops]);

  useEffect(() => {
    if (favorites.stops.length === 0) {
      setArrivalsByStop({});
      return;
    }

    Promise.all(
      favorites.stops.map(async (stopId) => {
        try {
          const payload = await getJson(`/api/stops/${encodeURIComponent(stopId)}/arrivals?limit=3`);
          return [stopId, payload.arrivals || []];
        } catch {
          return [stopId, []];
        }
      })
    )
      .then((rows) => setArrivalsByStop(Object.fromEntries(rows)))
      .catch(() => setArrivalsByStop({}));
  }, [favorites.stops]);

  const routeById = useMemo(
    () => Object.fromEntries(routes.map((route) => [route.route_id, route])),
    [routes]
  );

  const routeLabelFor = (routeId) => {
    const route = routeId ? routeById[routeId] : null;
    return route?.route_short_name || route?.route_long_name || route?.route_id || routeId || 'Route';
  };

  if (favorites.routes.length === 0 && favorites.stops.length === 0) {
    return (
      <section className="page">
        <h1>Favorites</h1>
        <p className="empty">No favorites yet. Save stops and routes to return in one tap.</p>
      </section>
    );
  }

  return (
    <section className="page">
      <h1>Favorites</h1>

      {realtime.alerts.length > 0 ? (
        <ServiceStrip tone="warning" message={realtime.alerts[0].header_text || 'Service alert in effect'} />
      ) : null}

      <h2>Favorite Stops</h2>
      <div className="stop-list">
        {favorites.stops.map((stopId) => {
          const stop = stopsById[stopId];
          if (!stop) {
            return null;
          }

          return (
            <StopCard
              key={stopId}
              stop={stop}
              arrivals={arrivalsByStop[stopId] || []}
              routeLabelFor={routeLabelFor}
              distanceMiles={null}
            />
          );
        })}
      </div>

      <h2>Favorite Routes</h2>
      <ul className="list">
        {favorites.routes.map((routeId) => {
          const route = routeById[routeId];
          return (
            <li key={routeId} className="list-item">
              <Link className="list-main" to={`/routes/${routeId}`}>
                <strong>{route?.route_short_name || routeId}</strong>
                <span>{route?.route_long_name || 'Open route details'}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
