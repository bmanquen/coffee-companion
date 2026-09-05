import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { fromSeconds, toSeconds } from '@/lib/duration'

// Two inputs (minutes + seconds) that together edit a brew time stored as
// whole seconds. fromSeconds fills the boxes; toSeconds is what the mutation
// sends. Hours are carried through so a value past 60 minutes is not dropped
// just because this input has no hours box. The caller supplies the label.
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
  const { hours, minutes, seconds } = fromSeconds(value)
  const setTime = (m: string, s: string) => {
    // A sub-hour brew renders hours as '0'; treat that as empty so clearing
    // both boxes still means no time, not zero seconds.
    onChange(toSeconds(hours === '0' ? '' : hours, m, s))
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
