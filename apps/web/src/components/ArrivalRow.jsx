const toConfidence = (arrival) => {
  if (arrival?.is_realtime) {
    return 'LIVE';
  }
  return 'SCHED';
};

const etaLabel = (arrival) => {
  if (!arrival || !Number.isFinite(arrival.arrival_in_minutes)) {
    return '--';
  }

  if (arrival.arrival_in_minutes <= 0) {
    return 'Now';
  }

  if (arrival.arrival_in_minutes === 1) {
    return '1 min';
  }

  return `${arrival.arrival_in_minutes} min`;
};

export const ArrivalRow = ({ arrival, routeLabel, compact = false }) => {
  const confidence = toConfidence(arrival);
  const directionLabel = arrival?.direction_label || null;

  return (
    <div className={`arrival-row ${compact ? 'compact' : ''}`}>
      <div className="arrival-left">
        <div className="arrival-meta">
          <span className="route-badge">{routeLabel || arrival.route_id || 'Route'}</span>
          {directionLabel ? <span className="direction-badge">{directionLabel}</span> : null}
        </div>
        {!compact ? <span className="arrival-headsign">{arrival.headsign || 'Destination unavailable'}</span> : null}
      </div>
      <div className="arrival-right">
        <strong className="arrival-eta">{etaLabel(arrival)}</strong>
        <span className="arrival-clock">{arrival.arrival_label || '--:--'}</span>
        <span className={`confidence-badge ${confidence.toLowerCase()}`}>{confidence}</span>
      </div>
    </div>
  );
};
