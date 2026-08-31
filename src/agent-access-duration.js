const DURATION_UNITS = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
  ['millisecond', 1],
]

export function formatAccessLeaseDuration(ttlMs, locale) {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) return ''

  const [unit, unitMs] = DURATION_UNITS.find(
    ([, milliseconds]) => ttlMs % milliseconds === 0,
  )

  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'long',
  }).format(ttlMs / unitMs)
}
