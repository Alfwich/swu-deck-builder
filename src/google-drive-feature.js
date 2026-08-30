export function resolveGoogleDriveClientId(googleDriveFeature, buildClientId = '') {
  const runtimeClientId = typeof googleDriveFeature?.clientId === 'string'
    ? googleDriveFeature.clientId.trim()
    : ''
  return runtimeClientId || String(buildClientId ?? '').trim()
}
