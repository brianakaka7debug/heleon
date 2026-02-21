import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'heleon_tracker_favorites_v1';

const readFavorites = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { stops: [], routes: [] };
    }

    const parsed = JSON.parse(raw);
    return {
      stops: Array.isArray(parsed.stops) ? parsed.stops : [],
      routes: Array.isArray(parsed.routes) ? parsed.routes : []
    };
  } catch {
    return { stops: [], routes: [] };
  }
};

export const useFavorites = () => {
  const [favorites, setFavorites] = useState(() => readFavorites());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const actions = useMemo(
    () => ({
      toggleStop(stopId) {
        setFavorites((previous) => {
          const exists = previous.stops.includes(stopId);
          return {
            ...previous,
            stops: exists ? previous.stops.filter((id) => id !== stopId) : [...previous.stops, stopId]
          };
        });
      },
      toggleRoute(routeId) {
        setFavorites((previous) => {
          const exists = previous.routes.includes(routeId);
          return {
            ...previous,
            routes: exists ? previous.routes.filter((id) => id !== routeId) : [...previous.routes, routeId]
          };
        });
      }
    }),
    []
  );

  return {
    favorites,
    ...actions
  };
};
