// Small helper to resolve the correct frontend base URL
// Strips trailing slashes and prefers FRONTEND_URL in production, otherwise LOCAL_FRONTEND_URL

export function getFrontendBase() {
  const prod = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const local = (process.env.LOCAL_FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const isProd = process.env.NODE_ENV === 'production';
  return (isProd ? prod : (prod || local)) || local; // ensure a usable value
}

export function getAllowedOrigins() {
  const base = getFrontendBase();
  const local = (process.env.LOCAL_FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const set = new Set([base, local].filter(Boolean));
  return Array.from(set);
}
