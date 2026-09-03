interface GoogleDriveFeature {
  clientId?: unknown
}

export function resolveGoogleDriveClientId(
  googleDriveFeature: GoogleDriveFeature | null | undefined,
  buildClientId: unknown = '',
) {
  const runtimeClientId = typeof googleDriveFeature?.clientId === 'string'
    ? googleDriveFeature.clientId.trim()
    : ''
  return runtimeClientId || String(buildClientId ?? '').trim()
}
