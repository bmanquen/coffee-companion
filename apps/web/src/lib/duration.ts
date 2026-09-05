// Seconds-centric conversion. fromSeconds turns a stored whole-second value
// into hours, minutes, and seconds; toSeconds turns those three boxes back
// into the seconds that go on the mutation. Display collapses empty higher
// units (165 → "2m 45s") at the formatter, using this breakdown.

export function fromSeconds(total: number | null): {
  hours: string
  minutes: string
  seconds: string
} {
  if (total === null) return { hours: '', minutes: '', seconds: '' }
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
  if (hours === '' && minutes === '' && seconds === '') return null
  return (
    (hours === '' ? 0 : Number(hours)) * 3600 +
    (minutes === '' ? 0 : Number(minutes)) * 60 +
    (seconds === '' ? 0 : Number(seconds))
  )
}
