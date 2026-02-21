export const ServiceStrip = ({ tone = 'info', message }) => {
  if (!message) {
    return null;
  }

  return <div className={`service-strip ${tone}`}>{message}</div>;
};
