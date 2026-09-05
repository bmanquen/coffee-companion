// Seconds-centric conversion. fromSeconds turns a stored whole-second value
// into hours, minutes, and seconds; toSeconds turns those three boxes back
// into the seconds that go on the mutation. Display collapses empty higher
// units (165 → "2m 45s") at the formatter, using this breakdown.

export function fromSeconds(total: number | null): {
  hours: string
  minutes: string
  seconds: string
} {
  if (total === null || !Number.isFinite(total)) {
    return { hours: '', minutes: '', seconds: '' }
  }
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return {
    hours: hours.toString(),
    minutes: minutes.toString(),
    seconds: seconds.toString(),
  }
}

export function toSeconds(
  hours: string,
  minutes: string,
  seconds: string,
): number | null {
  const h = hours === '' ? 0 : Number(hours)
  const m = minutes === '' ? 0 : Number(minutes)
  const s = seconds === '' ? 0 : Number(seconds)
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) {
    return null
  }
  // Empty and leftover zeros (fromSeconds fills unused parts with '0') are
  // no time — an optional brew time field stores null, not 0.
  if (h === 0 && m === 0 && s === 0) return null
  return h * 3600 + m * 60 + s
}
