import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getJson } from '../lib/api.js';

const STORAGE_RECENTS_KEY = 'heleon_search_recents_v1';

const readRecents = () => {
  try {
    const raw = localStorage.getItem(STORAGE_RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const SearchPage = () => {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState(() => readRecents());

  useEffect(() => {
    getJson('/api/gtfs/routes')
      .then((payload) => setRoutes(payload.routes || []))
      .catch(() => setRoutes([]));

    getJson('/api/gtfs/stops?limit=2000')
      .then((payload) => setStops(payload.stops || []))
      .catch(() => setStops([]));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_RECENTS_KEY, JSON.stringify(recents.slice(0, 8)));
  }, [recents]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredStops = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return stops
      .filter((stop) => `${stop.stop_name || ''} ${stop.stop_code || ''} ${stop.stop_id || ''}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 20);
  }, [normalizedQuery, stops]);

  const filteredRoutes = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return routes
      .filter((route) =>
        `${route.route_short_name || ''} ${route.route_long_name || ''} ${route.route_id || ''}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 20);
  }, [normalizedQuery, routes]);

  const addRecent = (item) => {
    setRecents((previous) => {
      const withoutItem = previous.filter((entry) => !(entry.type === item.type && entry.id === item.id));
      return [item, ...withoutItem].slice(0, 8);
    });
  };

  return (
    <section className="page">
      <h1>Search</h1>
      <input
        className="input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Stop, route, place"
      />

      {normalizedQuery ? (
        <>
          <h2>Stops</h2>
          <ul className="list">
            {filteredStops.map((stop) => (
              <li key={stop.stop_id} className="list-item">
                <Link
                  className="list-main"
                  to={`/stops/${stop.stop_id}`}
                  onClick={() => addRecent({ type: 'stop', id: stop.stop_id, label: stop.stop_name || stop.stop_id })}
                >
                  <strong>{stop.stop_name || stop.stop_id}</strong>
                  <span>{stop.stop_code ? `Stop ${stop.stop_code}` : stop.stop_id}</span>
                </Link>
              </li>
            ))}
          </ul>

          <h2>Routes</h2>
          <ul className="list">
            {filteredRoutes.map((route) => (
              <li key={route.route_id} className="list-item">
                <Link
                  className="list-main"
                  to={`/routes/${route.route_id}`}
                  onClick={() =>
                    addRecent({
                      type: 'route',
                      id: route.route_id,
                      label: route.route_short_name || route.route_long_name || route.route_id
                    })
                  }
                >
                  <strong>{route.route_short_name || route.route_id}</strong>
                  <span>{route.route_long_name || route.route_desc || 'Route details'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h2>Recent</h2>
          {recents.length === 0 ? (
            <p className="hint">Your recent stop and route searches appear here.</p>
          ) : (
            <ul className="list">
              {recents.map((recent) => (
                <li key={`${recent.type}-${recent.id}`} className="list-item">
                  <Link className="list-main" to={recent.type === 'stop' ? `/stops/${recent.id}` : `/routes/${recent.id}`}>
                    <strong>{recent.label}</strong>
                    <span>{recent.type === 'stop' ? 'Recent stop' : 'Recent route'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
};
