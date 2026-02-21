import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapView } from '../components/MapView.jsx';
import { ServiceStrip } from '../components/ServiceStrip.jsx';
import { getJson } from '../lib/api.js';

export const RouteDetailPage = ({ favorites, onToggleRoute, realtime }) => {
  const { routeId } = useParams();
  const [route, setRoute] = useState(null);
  const [shape, setShape] = useState({ type: 'FeatureCollection', features: [] });
  const [stops, setStops] = useState([]);
  const [viewMode, setViewMode] = useState('stops');

  useEffect(() => {
    getJson('/api/gtfs/routes')
      .then((payload) => {
        const match = (payload.routes || []).find((item) => item.route_id === routeId);
        setRoute(match || null);
      })
      .catch(() => setRoute(null));

    getJson(`/api/gtfs/stops?route_id=${encodeURIComponent(routeId)}&limit=500`)
      .then((payload) => setStops(payload.stops || []))
      .catch(() => setStops([]));

    getJson(`/api/gtfs/shape?route_id=${encodeURIComponent(routeId)}`)
      .then((payload) => setShape(payload.shape || { type: 'FeatureCollection', features: [] }))
      .catch(() => setShape({ type: 'FeatureCollection', features: [] }));
  }, [routeId]);

  const isFavorite = favorites.routes.includes(routeId);

  const mapVehicles = useMemo(
    () => realtime.vehicles.filter((vehicle) => vehicle.route_id === routeId),
    [realtime.vehicles, routeId]
  );

  return (
    <section className="page">
      <div className="row-between">
        <h1>Route {route?.route_short_name || routeId}</h1>
        <button className="secondary" type="button" onClick={() => onToggleRoute(routeId)}>
          {isFavorite ? 'Unfavorite' : 'Favorite'}
        </button>
      </div>

      <p className="hint">{route?.route_long_name || route?.route_desc || 'Route details unavailable'}</p>
      <ServiceStrip tone="info" message={realtime.alerts[0]?.header_text || null} />

      <div className="card">
        <div className="row-between">
          <strong>View</strong>
          <div className="segmented-control">
            <button className={viewMode === 'stops' ? 'active' : ''} type="button" onClick={() => setViewMode('stops')}>
              Stops
            </button>
            <button className={viewMode === 'map' ? 'active' : ''} type="button" onClick={() => setViewMode('map')}>
              Map
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'stops' ? (
        <ul className="list">
          {stops.map((stop) => (
            <li key={stop.stop_id} className="list-item">
              <Link className="list-main" to={`/stops/${stop.stop_id}`}>
                <strong>{stop.stop_name || stop.stop_id}</strong>
                <span>{stop.stop_code ? `Stop ${stop.stop_code}` : stop.stop_id}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <MapView shapeFeatureCollection={shape} vehicles={mapVehicles} stops={stops.slice(0, 120)} />
      )}
    </section>
  );
};
