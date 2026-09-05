import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { combineDurationFields, splitDurationFields } from '@/lib/duration'

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
  const { major: hours, minor: minutes } = splitDurationFields(value)
  const setSteep = (h: string, m: string) => {
    onChange(combineDurationFields(h, m))
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
