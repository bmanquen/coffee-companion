import { FormLabel } from './form-label'
import { Field, FieldContent } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { fromSeconds, toSeconds } from '@/lib/duration'

// Hours + minutes boxes for Cold Brew. The column is still whole minutes
// (no migration); this input converts at the edge: minutes × 60 into
// fromSeconds / toSeconds, then back to minutes for the form. Placeholders
// name the timeframe: one visible label covers both boxes.
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
      <FormLabel htmlFor="steepTimeHours">Steep Time</FormLabel>
      <FieldContent>
        <div className="flex gap-2">
          <Input
            id="steepTimeHours"
            aria-label="Steep Time (hours)"
            type="number"
            inputMode="numeric"
            placeholder="hours"
            value={hours}
            onBlur={onBlur}
            onChange={(e) => setSteep(e.target.value, minutes)}
          />
          <Input
            aria-label="Steep Time (minutes)"
            type="number"
            inputMode="numeric"
            placeholder="minutes"
            value={minutes}
            onBlur={onBlur}
            onChange={(e) => setSteep(hours, e.target.value)}
          />
        </div>
      </FieldContent>
    </Field>
  )
}
