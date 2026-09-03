export const FAN_TOOL_NOTICE =
  'Unofficial fan-made tool. Not affiliated with Lucasfilm Ltd. or The Walt Disney Company.'

export function formatApplicationVersion(version: unknown) {
  const normalizedVersion = String(version ?? '').trim()
  return normalizedVersion
    ? `SWU Deck Builder v${normalizedVersion}`
    : 'SWU Deck Builder'
}
