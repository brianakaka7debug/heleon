export const HeleOneWordmark = ({ className = '', size = 'medium' }) => (
  <span className={`heleone-wordmark ${size} ${className}`.trim()} aria-label="hele.one">
    <span className="heleone-word">hele</span>
    <span className="heleone-dot" />
    <span className="heleone-word">one</span>
  </span>
);
