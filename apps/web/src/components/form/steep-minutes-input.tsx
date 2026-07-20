import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// Two inputs (hours + minutes) that together edit a steep time stored as whole
// minutes. Cold brew steeps for hours, so it's entered as h + m rather than raw
// minutes. Decoupled from the form field (primitive value + onChange) so both
// the new and edit cold brew forms reuse it rather than duplicating the
// conversion logic.
export function SteepMinutesInput({
  value,
  onChange,
  onBlur,
}: {
  value: number | null
  onChange: (minutes: number | null) => void
  onBlur: () => void
}) {
  const hours = value === null ? '' : Math.floor(value / 60).toString()
  const minutes = value === null ? '' : (value % 60).toString()
  const setSteep = (h: string, m: string) => {
    if (h === '' && m === '') {
      onChange(null)
      return
    }
    onChange((h === '' ? 0 : Number(h)) * 60 + (m === '' ? 0 : Number(m)))
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
