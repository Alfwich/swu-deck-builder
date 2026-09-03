export function normalizeIp(value) {
  const ip = String(value ?? '').trim().toLowerCase()
  const mappedIpv4 = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  return mappedIpv4 ? mappedIpv4[1] : ip
}

export function getClientIp(request) {
  return normalizeIp(
    request.ip || request.socket?.remoteAddress || 'unknown',
  )
}

export function createIpAccessChecker(allowedIps = []) {
  const allowedClients = new Set(
    allowedIps.map(normalizeIp).filter(Boolean),
  )

  return (request) => allowedClients.has(getClientIp(request))
}
