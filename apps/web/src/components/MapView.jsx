import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';

const DEFAULT_CENTER = [-155.08, 19.63];
const BASEMAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const boundsFromFeatures = (features) => {
  const coordinates = [];

  for (const feature of features) {
    if (feature.geometry?.type === 'LineString') {
      coordinates.push(...feature.geometry.coordinates);
    }
  }

  if (coordinates.length === 0) {
    return null;
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of coordinates) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat]
  ];
};

const boundsFromStops = (stops) => {
  if (!stops?.length) {
    return null;
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const stop of stops) {
    if (!Number.isFinite(stop.stop_lon) || !Number.isFinite(stop.stop_lat)) {
      continue;
    }

    minLon = Math.min(minLon, stop.stop_lon);
    minLat = Math.min(minLat, stop.stop_lat);
    maxLon = Math.max(maxLon, stop.stop_lon);
    maxLat = Math.max(maxLat, stop.stop_lat);
  }

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
    return null;
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat]
  ];
};

const boundsFromFocus = (focus) => {
  if (!focus || !Number.isFinite(focus.lat) || !Number.isFinite(focus.lon)) {
    return null;
  }

  const radiusMiles = Number.isFinite(focus.radius_miles) ? Math.max(0.05, focus.radius_miles) : 0.4;
  const latDelta = radiusMiles / 69;
  const lonDelta = radiusMiles / (69 * Math.max(Math.cos((focus.lat * Math.PI) / 180), 0.2));

  return [
    [focus.lon - lonDelta, focus.lat - latDelta],
    [focus.lon + lonDelta, focus.lat + latDelta]
  ];
};

export const MapView = ({
  shapeFeatureCollection,
  vehicles,
  stops = [],
  initialFocus = null,
  recenterOnFocusChange = false,
  showNavigationControl = true,
  showAttributionControl = true,
  onVehicleSelect,
  onStopSelect
}) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const hasAppliedInitialViewportRef = useRef(false);

  const vehicleGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: vehicles
        .filter((vehicle) => Number.isFinite(vehicle.lon) && Number.isFinite(vehicle.lat))
        .map((vehicle) => ({
          type: 'Feature',
          properties: {
            vehicle_id: vehicle.vehicle_id,
            route_id: vehicle.route_id,
            trip_id: vehicle.trip_id,
            timestamp: vehicle.timestamp
          },
          geometry: {
            type: 'Point',
            coordinates: [vehicle.lon, vehicle.lat]
          }
        }))
    }),
    [vehicles]
  );

  const stopGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: stops
        .filter((stop) => Number.isFinite(stop.stop_lon) && Number.isFinite(stop.stop_lat))
        .map((stop) => ({
          type: 'Feature',
          properties: {
            stop_id: stop.stop_id,
            stop_name: stop.stop_name
          },
          geometry: {
            type: 'Point',
            coordinates: [stop.stop_lon, stop.stop_lat]
          }
        }))
    }),
    [stops]
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BASEMAP_STYLE_URL,
      attributionControl: showAttributionControl,
      center: DEFAULT_CENTER,
      zoom: 10
    });

    mapRef.current = map;

    map.on('load', () => {
      map.addSource('routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        paint: {
          'line-color': '#1d4ed8',
          'line-width': 3,
          'line-opacity': 0.75
        }
      });

      map.addSource('vehicles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'vehicles-circle',
        type: 'circle',
        source: 'vehicles',
        paint: {
          'circle-radius': 6,
          'circle-color': '#dc2626',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5
        }
      });

      map.on('click', 'vehicles-circle', (event) => {
        const feature = event.features?.[0];
        if (!feature) {
          return;
        }

        const coordinates = feature.geometry?.coordinates || [];
        const properties = feature.properties || {};

        onVehicleSelect?.({
          vehicle_id: properties.vehicle_id || null,
          route_id: properties.route_id || null,
          trip_id: properties.trip_id || null,
          timestamp: properties.timestamp ? Number(properties.timestamp) : null,
          lat: Number.isFinite(coordinates[1]) ? coordinates[1] : null,
          lon: Number.isFinite(coordinates[0]) ? coordinates[0] : null
        });
      });

      map.on('mouseenter', 'vehicles-circle', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'vehicles-circle', () => {
        map.getCanvas().style.cursor = '';
      });

      map.addSource('stops', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'stops-circle',
        type: 'circle',
        source: 'stops',
        paint: {
          'circle-radius': 4,
          'circle-color': '#0f766e',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1
        }
      });
      map.on('click', 'stops-circle', (event) => {
        const feature = event.features?.[0];
        const stopId = feature?.properties?.stop_id;
        if (stopId) {
          onStopSelect?.(stopId);
        }
      });

      if (showNavigationControl) {
        map.addControl(new maplibregl.NavigationControl(), 'top-right');
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const applyData = () => {
      const source = map.getSource('routes');
      if (!source) {
        return;
      }

      source.setData(shapeFeatureCollection || { type: 'FeatureCollection', features: [] });

      const focusBounds = boundsFromFocus(initialFocus);
      const stopBounds = boundsFromStops(stops);
      const routeBounds = boundsFromFeatures(shapeFeatureCollection?.features || []);
      const bounds = focusBounds || stopBounds || routeBounds;

      const shouldFit = recenterOnFocusChange ? Boolean(bounds) : bounds && !hasAppliedInitialViewportRef.current;
      if (shouldFit) {
        map.fitBounds(bounds, { padding: 32, maxZoom: 13, duration: 0 });
        hasAppliedInitialViewportRef.current = true;
      }
    };

    if (map.isStyleLoaded()) {
      applyData();
    } else {
      map.once('load', applyData);
    }
  }, [shapeFeatureCollection, stops, initialFocus, recenterOnFocusChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const applyData = () => {
      const source = map.getSource('vehicles');
      if (source) {
        source.setData(vehicleGeoJson);
      }
    };

    if (map.isStyleLoaded()) {
      applyData();
    } else {
      map.once('load', applyData);
    }
  }, [vehicleGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const applyData = () => {
      const source = map.getSource('stops');
      if (source) {
        source.setData(stopGeoJson);
      }
    };

    if (map.isStyleLoaded()) {
      applyData();
    } else {
      map.once('load', applyData);
    }
  }, [stopGeoJson]);

  return <div ref={mapContainerRef} className="map-root" />;
};
