import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getJson } from '../lib/api.js';

export const RoutesPage = ({ favorites, onToggleRoute }) => {
  const [routes, setRoutes] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    getJson('/api/gtfs/routes')
      .then((payload) => setRoutes(payload.routes || []))
      .catch(() => setRoutes([]));
  }, []);

  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return routes;
    }

    return routes.filter((route) => {
      const text = `${route.route_short_name || ''} ${route.route_long_name || ''} ${route.route_id || ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [routes, query]);

  return (
    <section className="page">
      <h1>Routes</h1>
      <input
        className="input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter routes"
      />

      <ul className="list">
        {filteredRoutes.map((route) => {
          const favorite = favorites.routes.includes(route.route_id);
          return (
            <li key={route.route_id} className="list-item">
              <Link to={`/routes/${route.route_id}`} className="list-main">
                <strong>{route.route_short_name || route.route_id}</strong>
                <span>{route.route_long_name || route.route_desc || 'Route details'}</span>
              </Link>
              <button className="secondary" onClick={() => onToggleRoute(route.route_id)} type="button">
                {favorite ? 'Unfavorite' : 'Favorite'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
