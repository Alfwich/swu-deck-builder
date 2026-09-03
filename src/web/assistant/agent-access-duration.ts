const DURATION_UNITS = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
  ['millisecond', 1],
] as const

export function formatAccessLeaseDuration(
  ttlMs: number | null | undefined,
  locale?: Intl.LocalesArgument,
) {
  if (typeof ttlMs !== 'number' || !Number.isInteger(ttlMs) || ttlMs <= 0) return ''

  const [unit, unitMs] = DURATION_UNITS.find(
    ([, milliseconds]) => ttlMs % milliseconds === 0,
  ) ?? ['millisecond', 1]

  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'long',
  }).format(ttlMs / unitMs)
}
