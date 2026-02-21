import { Link } from 'react-router-dom';
import { ServiceStrip } from '../components/ServiceStrip.jsx';

export const ServicePage = ({ realtime }) => {
  const hasAlerts = realtime.alerts.length > 0;

  return (
    <section className="page">
      <h1>Service</h1>

      <ServiceStrip
        tone={hasAlerts ? 'warning' : 'info'}
        message={hasAlerts ? 'Service disruptions are active.' : 'No active service alerts right now.'}
      />

      <div className="card">
        <h2>Data Status</h2>
        <ul className="list compact-list">
          <li className="list-item">
            <div className="list-main">
              <strong>Live vehicles</strong>
              <span>{realtime.vehicles.length} reporting</span>
            </div>
          </li>
          <li className="list-item">
            <div className="list-main">
              <strong>Trip updates</strong>
              <span>{realtime.tripUpdates.length} active updates</span>
            </div>
          </li>
          <li className="list-item">
            <div className="list-main">
              <strong>Last refresh</strong>
              <span>{realtime.lastUpdatedLabel}</span>
            </div>
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Active Alerts</h2>
        {hasAlerts ? (
          <ul className="list">
            {realtime.alerts.map((alert) => (
              <li key={alert.entity_id || `${alert.header_text}-${alert.effect}`} className="list-item">
                <div className="list-main">
                  <strong>{alert.header_text || 'Service alert'}</strong>
                  <span>{alert.description_text || alert.effect || 'Details unavailable'}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No active alerts in the feed.</p>
        )}
      </div>

      <div className="card">
        <h2>Disclaimer</h2>
        <p className="hint">
          This app is not affiliated with Hawaiʻi County or Hele-On Bus. Data is provided as-is for informational
          purposes.
        </p>
        <Link className="secondary-link" to="/terms">
          Read full terms
        </Link>
      </div>
    </section>
  );
};
