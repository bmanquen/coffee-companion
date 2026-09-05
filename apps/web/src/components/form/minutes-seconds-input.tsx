import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// Two inputs (minutes + seconds) that together edit a brew time stored as
// whole seconds. Pour Over, French Press, and AeroPress are spoken in m + s
// rather than raw seconds. Decoupled from the form field (label + primitive
// value + onChange) so each method's new and edit forms reuse it rather than
// duplicating the conversion logic. The caller supplies the label ("Brew
// Time" / "Steep Time"); per-box accessible names append the unit.
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
  const minutes = value === null ? '' : Math.floor(value / 60).toString()
  const seconds = value === null ? '' : (value % 60).toString()
  const setTime = (m: string, s: string) => {
    if (m === '' && s === '') {
      onChange(null)
      return
    }
    onChange((m === '' ? 0 : Number(m)) * 60 + (s === '' ? 0 : Number(s)))
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
