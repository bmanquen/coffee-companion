import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { fromStoredDuration, toStoredDuration } from '@/lib/duration'

// Two inputs (minutes + seconds) that together edit a brew time stored as
// whole seconds. fromStoredDuration turns the DB seconds into the boxes;
// toStoredDuration turns the boxes back into the seconds on the payload.
// The caller supplies the label; per-box accessible names append the unit.
export function MinutesSecondsInput({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string
  value: number | null
  onChange: (seconds: number | null) => void
  onBlur: () => void
}) {
  const { major: minutes, minor: seconds } = fromStoredDuration(value)
  const setTime = (m: string, s: string) => {
    onChange(toStoredDuration(m, s))
  }
  const minutesId = `${label.replace(/\s+/g, '-').toLowerCase()}-minutes`

  return (
    <Field>
      <FieldLabel htmlFor={minutesId}>{label}</FieldLabel>
      <FieldContent>
        <div className="flex gap-2">
          <Input
            id={minutesId}
            aria-label={`${label} (minutes)`}
            type="number"
            inputMode="numeric"
            placeholder="2 min"
            value={minutes}
            onBlur={onBlur}
            onChange={(e) => setTime(e.target.value, seconds)}
          />
          <Input
            aria-label={`${label} (seconds)`}
            type="number"
            inputMode="numeric"
            placeholder="45 sec"
            value={seconds}
            onBlur={onBlur}
            onChange={(e) => setTime(minutes, e.target.value)}
          />
        </div>
      </FieldContent>
    </Field>
  )
}
