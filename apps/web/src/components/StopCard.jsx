import { Link } from 'react-router-dom';
import { ArrivalRow } from './ArrivalRow.jsx';

const distanceLabel = (distanceMiles) => {
  if (!Number.isFinite(distanceMiles)) {
    return 'Distance unavailable';
  }

  if (distanceMiles < 0.1) {
    return '<0.1 mi';
  }

  return `${distanceMiles.toFixed(1)} mi`;
};

export const StopCard = ({ stop, arrivals = [], routeLabelFor, distanceMiles }) => (
  <article className="stop-card">
    <div className="row-between">
      <Link to={`/stops/${stop.stop_id}`} className="list-main">
        <strong>{stop.stop_name || stop.stop_id}</strong>
        <span>{stop.stop_code ? `Stop ${stop.stop_code}` : stop.stop_id}</span>
      </Link>
      <span className="hint">{distanceLabel(distanceMiles)}</span>
    </div>

    <div className="stop-card-arrivals">
      {arrivals.length > 0 ? (
        arrivals.map((arrival) => (
          <ArrivalRow
            key={`${stop.stop_id}-${arrival.trip_id || 'trip'}-${arrival.arrival_label}-${arrival.arrival_in_minutes}`}
            arrival={arrival}
            routeLabel={routeLabelFor(arrival.route_id)}
            compact
          />
        ))
      ) : (
        <p className="hint">No upcoming departures shown.</p>
      )}
    </div>
  </article>
);
