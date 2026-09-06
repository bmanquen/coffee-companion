import { FormLabel } from './form-label'
import { useFieldRequired } from './use-field-required'
import { Field, FieldContent } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { fromSeconds, toSeconds } from '@/lib/duration'

// Two inputs (minutes + seconds) that together edit a brew time stored as
// whole seconds. fromSeconds fills the boxes; toSeconds is what the mutation
// sends. Hours are folded into the minutes box so a value past 60 minutes
// stays fully editable — this UI has no hours field. The caller supplies
// the label. Placeholders name the timeframe: one visible label covers both
// boxes, so the omit-if-echoes-label rule does not apply here.
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
  const parts = fromSeconds(value)
  const empty =
    parts.hours === '' && parts.minutes === '' && parts.seconds === ''
  const minutes = empty
    ? ''
    : String(Number(parts.hours) * 60 + Number(parts.minutes))
  const seconds = parts.seconds
  const setTime = (m: string, s: string) => {
    onChange(toSeconds('', m, s))
  }
  const minutesId = `${label.replace(/\s+/g, '-').toLowerCase()}-minutes`
  const required = useFieldRequired()

  return (
    <Field>
      <FormLabel htmlFor={minutesId} required={required}>
        {label}
      </FormLabel>
      <FieldContent>
        <div className="flex gap-2">
          <Input
            id={minutesId}
            aria-label={`${label} (minutes)`}
            type="number"
            inputMode="numeric"
            placeholder="minutes"
            value={minutes}
            onBlur={onBlur}
            onChange={(e) => setTime(e.target.value, seconds)}
            aria-required={required || undefined}
          />
          <Input
            aria-label={`${label} (seconds)`}
            type="number"
            inputMode="numeric"
            placeholder="seconds"
            value={seconds}
            onBlur={onBlur}
            onChange={(e) => setTime(minutes, e.target.value)}
            aria-required={required || undefined}
          />
        </div>
      </FieldContent>
    </Field>
  )
}
