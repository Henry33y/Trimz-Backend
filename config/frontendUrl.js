// Small helper to resolve the correct frontend base URL
// Strips trailing slashes and prefers FRONTEND_URL in production, otherwise LOCAL_FRONTEND_URL

function stripTrailingSlash(u) {
  return (u || '').replace(/\/$/, '');
}

function addWwwVariants(u) {
  try {
    const url = new URL(u);
    const variants = new Set([stripTrailingSlash(u)]);
    const host = url.hostname;
    if (host.startsWith('www.')) {
      const noWww = `${url.protocol}//${host.replace(/^www\./, '')}`;
      variants.add(stripTrailingSlash(noWww));
    } else {
      const withWww = `${url.protocol}//www.${host}`;
      variants.add(stripTrailingSlash(withWww));
    }
    return Array.from(variants);
  } catch {
    return [stripTrailingSlash(u)];
  }
}

export function getFrontendBase() {
  const prod = stripTrailingSlash(process.env.FRONTEND_URL || '');
  const local = stripTrailingSlash(process.env.LOCAL_FRONTEND_URL || 'http://localhost:5173');
  const isProd = process.env.NODE_ENV === 'production';
  return (isProd ? prod : (prod || local)) || local;
}

export function getAllowedOrigins() {
  const local = stripTrailingSlash(process.env.LOCAL_FRONTEND_URL || 'http://localhost:5173');

  // Support multiple production origins via FRONTEND_URLS (comma-separated)
  const configuredList = (process.env.FRONTEND_URLS || '')
    .split(',')
    .map(s => stripTrailingSlash(s.trim()))
    .filter(Boolean);

  // Always include FRONTEND_URL as fallback
  const primary = stripTrailingSlash(process.env.FRONTEND_URL || '');
  if (primary && !configuredList.includes(primary)) configuredList.push(primary);

  const set = new Set();
  configuredList.forEach(u => addWwwVariants(u).forEach(v => set.add(v)));
  set.add(local);

  return Array.from(set).filter(Boolean);
}
