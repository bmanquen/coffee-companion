// One bidirectional helper between a stored whole-unit duration and two
// 60-based input boxes. Pour Over (and later French Press / AeroPress) store
// whole seconds — fromStoredDuration(165) is 2 minutes and 45 seconds, and
// toStoredDuration('2', '45') is the 165 that goes back on the mutation.
// Cold Brew stores whole minutes, not seconds; it reuses the same 60-split
// with minutes as the base unit so 18 hours stays 1080 minutes, never 64800
// seconds.

function splitSixty(total: number): { major: number; minor: number } {
  return { major: Math.floor(total / 60), minor: total % 60 }
}

// From the database: a stored whole-unit value → the two boxes. Null means
// both empty; a stored 120 becomes "2" and "0", not "2" and "".
export function fromStoredDuration(total: number | null): {
  major: string
  minor: string
} {
  if (total === null) return { major: '', minor: '' }
  const { major, minor } = splitSixty(total)
  return { major: major.toString(), minor: minor.toString() }
}

// To the database: the two boxes → a stored whole-unit value. Both empty
// means no time; a lone value in either box counts as that many of its unit;
// overflow stays in the stored number and the next fromStoredDuration
// normalizes it (165 seconds → 2 and 45).
export function toStoredDuration(major: string, minor: string): number | null {
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
  const { major, minor } = splitSixty(total)
  if (major === 0) return `${minor}${units.minor}`
  if (minor === 0) return `${major}${units.major}`
  return `${major}${units.major} ${minor}${units.minor}`
}
