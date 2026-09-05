import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { fromStoredDuration, toStoredDuration } from '@/lib/duration'

// Two inputs (hours + minutes) that together edit a steep time stored as whole
// minutes — not seconds. Cold brew reuses the same fromStoredDuration /
// toStoredDuration 60-split with minutes as the base unit so an 18 hour steep
// stays 1080 minutes. Decoupled from the form field so both cold brew forms
// reuse it.
export function SteepMinutesInput({
  value,
  onChange,
  onBlur,
}: {
  value: number | null
  onChange: (minutes: number | null) => void
  onBlur: () => void
}) {
  const { major: hours, minor: minutes } = fromStoredDuration(value)
  const setSteep = (h: string, m: string) => {
    onChange(toStoredDuration(h, m))
  }

  return (
    <Field>
      <FieldLabel htmlFor="steepTimeHours">Steep Time</FieldLabel>
      <FieldContent>
        <div className="flex gap-2">
          <Input
            id="steepTimeHours"
            aria-label="Steep Time (hours)"
            type="number"
            inputMode="numeric"
            placeholder="18 hr"
            value={hours}
            onBlur={onBlur}
            onChange={(e) => setSteep(e.target.value, minutes)}
          />
          <Input
            aria-label="Steep Time (minutes)"
            type="number"
            inputMode="numeric"
            placeholder="0 min"
            value={minutes}
            onBlur={onBlur}
            onChange={(e) => setSteep(hours, e.target.value)}
          />
        </div>
      </FieldContent>
    </Field>
  )
}
