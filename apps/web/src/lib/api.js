const API_BASE = import.meta.env.VITE_API_BASE || '';

const buildUrl = (path) => {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${API_BASE}${path}`;
};

export const getJson = async (path, init = {}) => {
  const response = await fetch(buildUrl(path), {
    method: 'GET',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }

  return response.json();
};
