import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav.jsx';
import { useFavorites } from './hooks/useFavorites.js';
import { usePollingRealtime } from './hooks/usePollingRealtime.js';
import { FavoritesPage } from './pages/FavoritesPage.jsx';
import { NearbyPage } from './pages/NearbyPage.jsx';
import { RouteDetailPage } from './pages/RouteDetailPage.jsx';
import { SearchPage } from './pages/SearchPage.jsx';
import { ServicePage } from './pages/ServicePage.jsx';
import { StopPage } from './pages/StopPage.jsx';
import { TermsPage } from './pages/TermsPage.jsx';

export const App = () => {
  const realtime = usePollingRealtime();
  const favorites = useFavorites();
  const location = useLocation();
  const isNearbyLanding = location.pathname === '/nearby' || location.pathname === '/';

  return (
    <div className={`app-root ${isNearbyLanding ? 'app-root-nearby' : ''}`}>
      <header className={`app-header ${isNearbyLanding ? 'app-header-hidden' : ''}`}>
        <h1 className="brand">Hele-On Tracker</h1>
        <p className="app-subtitle">Live buses, arrivals, and service status for Puna/Hilo</p>
      </header>

      <main>
        <Routes>
          <Route
            path="/nearby"
            element={<NearbyPage realtime={realtime} />}
          />
          <Route path="/search" element={<SearchPage />} />
          <Route
            path="/favorites"
            element={<FavoritesPage favorites={favorites.favorites} realtime={realtime} />}
          />
          <Route
            path="/routes/:routeId"
            element={<RouteDetailPage favorites={favorites.favorites} onToggleRoute={favorites.toggleRoute} realtime={realtime} />}
          />
          <Route
            path="/stops/:stopId"
            element={<StopPage favorites={favorites.favorites} onToggleStop={favorites.toggleStop} realtime={realtime} />}
          />
          <Route path="/service" element={<ServicePage realtime={realtime} />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/routes" element={<Navigate to="/search" replace />} />
          <Route path="/" element={<Navigate to="/nearby" replace />} />
          <Route path="*" element={<Navigate to="/nearby" replace />} />
        </Routes>
      </main>

      <BottomNav />
    </div>
  );
};
