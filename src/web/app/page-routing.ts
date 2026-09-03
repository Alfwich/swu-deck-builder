export type ApplicationPage = 'access' | 'privacy' | 'terms' | 'app'

export function resolveApplicationPage(pathname: unknown): ApplicationPage {
  const normalizedPath = String(pathname || '/')
    .replace(/\/+$/, '') || '/'

  if (normalizedPath === '/enable') return 'access'
  if (normalizedPath === '/privacy') return 'privacy'
  if (normalizedPath === '/terms') return 'terms'
  return 'app'
}
