// A stored duration is one whole number in the smaller unit — minutes for
// Cold Brew (hours + minutes), seconds for Pour Over (minutes + seconds).
// Both pairs are 60-based, so split, combine, overflow, empty-versus-zero,
// and the collapsing display rule live here once.

function parts(total: number): { major: number; minor: number } {
  return { major: Math.floor(total / 60), minor: total % 60 }
}

// Derive the two input boxes from a stored whole-unit value. Null means both
// empty; a stored 120 becomes "2" and "0", not "2" and "".
export function splitDurationFields(total: number | null): {
  major: string
  minor: string
} {
  if (total === null) return { major: '', minor: '' }
  const { major, minor } = parts(total)
  return { major: major.toString(), minor: minor.toString() }
}

// Report the two boxes as a stored whole-unit value. Both empty means no
// time; a lone value in either box counts as that many of its unit;
// overflow stays in the stored number and the next split normalizes it.
export function combineDurationFields(
  major: string,
  minor: string,
): number | null {
  if (major === '' && minor === '') return null
  return (major === '' ? 0 : Number(major)) * 60 + (minor === '' ? 0 : Number(minor))
}

// Render a stored duration with the caller's unit suffixes, collapsing a
// zero part: 165 with m/s → "2m 45s", 240 → "4m", 45 → "45s", null → "-".
export function formatDuration(
  total: number | null,
  units: { major: string; minor: string },
): string {
  if (total == null) return '-'
  const { major, minor } = parts(total)
  if (major === 0) return `${minor}${units.minor}`
  if (minor === 0) return `${major}${units.major}`
  return `${major}${units.major} ${minor}${units.minor}`
}
