import { durationInputClassName } from '@/components/form/duration-input'
import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { fromSeconds, toSeconds } from '@/lib/duration'

// Hours + minutes boxes for Cold Brew. The column is still whole minutes
// (no migration); this input converts at the edge: minutes × 60 into
// fromSeconds / toSeconds, then back to minutes for the form.
export function SteepMinutesInput({
  value,
  onChange,
  onBlur,
}: {
  value: number | null
  onChange: (minutes: number | null) => void
  onBlur: () => void
}) {
  const { hours, minutes } = fromSeconds(value == null ? null : value * 60)
  const setSteep = (h: string, m: string) => {
    const seconds = toSeconds(h, m, '')
    onChange(seconds == null ? null : seconds / 60)
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
            className={durationInputClassName}
            value={hours}
            onBlur={onBlur}
            onChange={(e) => setSteep(e.target.value, minutes)}
          />
          <Input
            aria-label="Steep Time (minutes)"
            type="number"
            inputMode="numeric"
            placeholder="0 min"
            className={durationInputClassName}
            value={minutes}
            onBlur={onBlur}
            onChange={(e) => setSteep(hours, e.target.value)}
          />
        </div>
      </FieldContent>
    </Field>
  )
}
