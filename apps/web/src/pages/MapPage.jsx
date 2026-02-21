import { useEffect, useMemo, useState } from 'react';
import { getJson } from '../lib/api.js';
import { LastUpdatedPill } from '../components/LastUpdatedPill.jsx';
import { MapView } from '../components/MapView.jsx';

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

export const MapPage = ({ realtime }) => {
  const [routes, setRoutes] = useState([]);
  const [shape, setShape] = useState({ type: 'FeatureCollection', features: [] });
  const [selectedRoutes, setSelectedRoutes] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    getJson('/api/gtfs/routes')
      .then((payload) => setRoutes(payload.routes || []))
      .catch(() => setRoutes([]));

    getJson('/api/gtfs/shape')
      .then((payload) => setShape(payload.shape || { type: 'FeatureCollection', features: [] }))
      .catch(() => setShape({ type: 'FeatureCollection', features: [] }));
  }, []);

  const filteredShape = useMemo(() => {
    if (selectedRoutes.length === 0) {
      return shape;
    }

    return {
      ...shape,
      features: (shape.features || []).filter((feature) => selectedRoutes.includes(feature.properties?.route_id))
    };
  }, [shape, selectedRoutes]);

  const filteredVehicles = useMemo(() => {
    if (selectedRoutes.length === 0) {
      return realtime.vehicles;
    }

    return realtime.vehicles.filter((vehicle) => selectedRoutes.includes(vehicle.route_id));
  }, [realtime.vehicles, selectedRoutes]);

  const routeById = useMemo(
    () => Object.fromEntries(routes.map((route) => [route.route_id, route])),
    [routes]
  );

  const getRouteLabel = (routeId) => {
    const route = routeId ? routeById[routeId] : null;
    return route?.route_short_name || route?.route_long_name || route?.route_id || routeId || 'Route unavailable';
  };

  const selectedVehicleDetails = useMemo(() => {
    if (!selectedVehicle) {
      return null;
    }

    const route = selectedVehicle.route_id ? routeById[selectedVehicle.route_id] : null;
    return {
      ...selectedVehicle,
      route_label:
        getRouteLabel(selectedVehicle.route_id),
      route_long_name: route?.route_long_name || null,
      last_report_label: selectedVehicle.timestamp
        ? new Date(selectedVehicle.timestamp * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })
        : null,
      coordinates_label:
        Number.isFinite(selectedVehicle.lat) && Number.isFinite(selectedVehicle.lon)
          ? `${selectedVehicle.lat.toFixed(5)}, ${selectedVehicle.lon.toFixed(5)}`
          : 'Unavailable'
    };
  }, [routeById, selectedVehicle]);

  const nearestVehicleSuggestion = useMemo(() => {
    if (!userLocation) {
      return null;
    }

    const candidates = realtime.vehicles.filter(
      (vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lon)
    );
    if (candidates.length === 0) {
      return null;
    }

    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const vehicle of candidates) {
      const miles = distanceMiles(userLocation.lat, userLocation.lon, vehicle.lat, vehicle.lon);
      if (miles < bestDistance) {
        best = vehicle;
        bestDistance = miles;
      }
    }

    if (!best) {
      return null;
    }

    const route = best.route_id ? routeById[best.route_id] : null;
    return {
      ...best,
      distance_miles: bestDistance,
      route_label: getRouteLabel(best.route_id),
      route_long_name: route?.route_long_name || null
    };
  }, [realtime.vehicles, routeById, userLocation]);

  useEffect(() => {
    if (!selectedVehicle) {
      return;
    }

    const exists = filteredVehicles.some((vehicle) => vehicle.vehicle_id === selectedVehicle.vehicle_id);
    if (!exists) {
      setSelectedVehicle(null);
    }
  }, [filteredVehicles, selectedVehicle]);

  const toggleRoute = (routeId) => {
    setSelectedRoutes((previous) =>
      previous.includes(routeId) ? previous.filter((id) => id !== routeId) : [...previous, routeId]
    );
  };

  const requestLocationForNearest = () => {
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
        setLocationLoading(false);
      },
      (error) => {
        const message =
          error.code === 1
            ? 'Location permission was denied.'
            : error.code === 2
              ? 'Location is unavailable right now.'
              : 'Location request timed out.';
        setLocationError(message);
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 60_000
      }
    );
  };

  const applyNearestRouteShortcut = () => {
    if (!nearestVehicleSuggestion?.route_id) {
      return;
    }

    setSelectedRoutes([nearestVehicleSuggestion.route_id]);
    setSelectedVehicle(nearestVehicleSuggestion);
  };

  return (
    <section className="page">
      <div className="row-between">
        <h1>Puna/Hilo Live Map</h1>
        <LastUpdatedPill label={realtime.lastUpdatedLabel} stale={realtime.vehicleStale} />
      </div>

      {realtime.error ? <p className="error">Real-time fetch issue: {realtime.error}</p> : null}

      <div className="card route-filters">
        <p className="hint">Filter routes</p>
        <div className="chips">
          {routes.map((route) => (
            <button
              key={route.route_id}
              type="button"
              className={`chip ${selectedRoutes.includes(route.route_id) ? 'active' : ''}`}
              onClick={() => toggleRoute(route.route_id)}
            >
              {route.route_short_name || route.route_long_name || route.route_id}
            </button>
          ))}
        </div>
      </div>

      <div className="card shortcut-card">
        <div className="row-between">
          <strong>Nearest Bus Shortcut</strong>
          <button className="secondary" type="button" onClick={requestLocationForNearest} disabled={locationLoading}>
            {locationLoading ? 'Locating...' : userLocation ? 'Refresh location' : 'Use my location'}
          </button>
        </div>

        {locationError ? <p className="error">{locationError}</p> : null}

        {!userLocation ? (
          <p className="hint">Enable location to suggest the nearest live bus route.</p>
        ) : nearestVehicleSuggestion ? (
          <>
            <p className="hint">
              Nearest bus: {nearestVehicleSuggestion.route_label} ({nearestVehicleSuggestion.distance_miles.toFixed(2)} mi away)
            </p>
            {nearestVehicleSuggestion.route_long_name ? (
              <p className="hint">Route name: {nearestVehicleSuggestion.route_long_name}</p>
            ) : null}
            <div className="shortcut-actions">
              <button className="secondary" type="button" onClick={applyNearestRouteShortcut}>
                Show this route
              </button>
              <button className="secondary" type="button" onClick={() => setSelectedVehicle(nearestVehicleSuggestion)}>
                Select this bus
              </button>
            </div>
          </>
        ) : (
          <p className="hint">No live buses available yet for nearest-route suggestion.</p>
        )}
      </div>

      <MapView
        shapeFeatureCollection={filteredShape}
        vehicles={filteredVehicles}
        onVehicleSelect={setSelectedVehicle}
      />

      {selectedVehicleDetails ? (
        <div className="card vehicle-detail">
          <div className="row-between">
            <strong>Selected Bus</strong>
            <span className="hint">{selectedVehicleDetails.vehicle_id || 'Unknown vehicle'}</span>
          </div>
          <p className="hint">Route: {selectedVehicleDetails.route_label}</p>
          {selectedVehicleDetails.route_long_name ? (
            <p className="hint">Route name: {selectedVehicleDetails.route_long_name}</p>
          ) : null}
          <p className="hint">Trip: {selectedVehicleDetails.trip_id || 'Unavailable'}</p>
          <p className="hint">
            Last report: {selectedVehicleDetails.last_report_label || 'Unavailable'} ({selectedVehicleDetails.coordinates_label})
          </p>
        </div>
      ) : (
        <p className="hint">Tap a red bus dot for route and trip details.</p>
      )}

      {filteredVehicles.length === 0 ? (
        <p className="empty">No live buses reporting right now. Browse routes and stop schedules below.</p>
      ) : null}
    </section>
  );
};
