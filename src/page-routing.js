export function resolveApplicationPage(pathname) {
  const normalizedPath = String(pathname || '/')
    .replace(/\/+$/, '') || '/'

  if (normalizedPath === '/enable') return 'access'
  if (normalizedPath === '/privacy') return 'privacy'
  if (normalizedPath === '/terms') return 'terms'
  return 'app'
}
