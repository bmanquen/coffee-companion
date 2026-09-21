export function formatOriginNames(
  origins: Array<{
    country?: { name: string } | null
    region?: { name: string } | null
    process?: { name: string } | null
  }>,
  key: 'country' | 'region' | 'process',
) {
  if (origins.length === 0) return '-'
  const names = origins.map((origin) => origin[key]?.name || '-')
  if (names.every((name) => name === '-')) return '-'
  return names.join(', ')
}
