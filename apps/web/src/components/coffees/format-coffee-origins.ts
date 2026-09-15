export function formatOriginNames(
  origins: Array<{
    country?: { name: string } | null
    region?: { name: string } | null
  }>,
  key: 'country' | 'region',
) {
  if (origins.length === 0) return '-'
  return origins.map((origin) => origin[key]?.name || '-').join(', ')
}
