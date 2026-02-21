export const LastUpdatedPill = ({ label, stale }) => (
  <div className={`last-updated ${stale ? 'stale' : ''}`}>
    {label}
    {stale ? ' (stale cache)' : ''}
  </div>
);
