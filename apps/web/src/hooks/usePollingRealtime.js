import { useEffect, useMemo, useRef, useState } from 'react';
import { getJson } from '../lib/api.js';

const IDLE_LIMIT_MS = 5 * 60 * 1000;

export const usePollingRealtime = () => {
  const [vehicles, setVehicles] = useState([]);
  const [tripUpdates, setTripUpdates] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [vehicleStale, setVehicleStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  const interactionRef = useRef(Date.now());

  useEffect(() => {
    const touch = () => {
      interactionRef.current = Date.now();
    };

    const events = ['touchstart', 'mousedown', 'keydown', 'scroll'];
    for (const event of events) {
      window.addEventListener(event, touch, { passive: true });
    }

    return () => {
      for (const event of events) {
        window.removeEventListener(event, touch);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const shouldPause = () =>
      document.visibilityState !== 'visible' || Date.now() - interactionRef.current > IDLE_LIMIT_MS;

    const fetchVehicles = async () => {
      if (shouldPause()) {
        return;
      }

      try {
        const response = await getJson('/api/rt/vehiclepositions');
        if (cancelled) {
          return;
        }

        setVehicles(response.vehicles || []);
        setVehicleStale(Boolean(response.stale));
        setLastUpdated(response.fetched_at || null);
        setError(null);
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError.message);
        }
      }
    };

    const fetchTripUpdates = async () => {
      if (shouldPause()) {
        return;
      }

      try {
        const response = await getJson('/api/rt/tripupdates');
        if (!cancelled) {
          setTripUpdates(response.updates || []);
        }
      } catch {
        if (!cancelled) {
          setTripUpdates([]);
        }
      }
    };

    const fetchAlerts = async () => {
      if (shouldPause()) {
        return;
      }

      try {
        const response = await getJson('/api/rt/alerts');
        if (!cancelled) {
          setAlerts(response.alerts || []);
        }
      } catch {
        if (!cancelled) {
          setAlerts([]);
        }
      }
    };

    fetchVehicles();
    fetchTripUpdates();
    fetchAlerts();

    const vehicleTimer = setInterval(fetchVehicles, 15_000);
    const tripUpdateTimer = setInterval(fetchTripUpdates, 30_000);
    const alertTimer = setInterval(fetchAlerts, 60_000);
    const visibilityTimer = setInterval(() => {
      if (!shouldPause()) {
        fetchVehicles();
      }
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(vehicleTimer);
      clearInterval(tripUpdateTimer);
      clearInterval(alertTimer);
      clearInterval(visibilityTimer);
    };
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) {
      return 'No live sync yet';
    }

    const seconds = Math.max(0, Math.round(Date.now() - lastUpdated * 1000) / 1000);
    if (seconds < 60) {
      return `Updated ${Math.round(seconds)}s ago`;
    }

    return `Updated ${Math.round(seconds / 60)}m ago`;
  }, [lastUpdated]);

  return {
    vehicles,
    tripUpdates,
    alerts,
    vehicleStale,
    lastUpdated,
    lastUpdatedLabel,
    error
  };
};
