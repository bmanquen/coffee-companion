import { formatBrewRatio } from '@/lib/brew'

// Grams as entered, with a muted 1:x beside them when both weights exist.
export function BrewWeight({
  grams,
  dose,
}: {
  grams: string | null
  dose: string | null
}) {
  const ratio = formatBrewRatio(dose, grams)
  return (
    <>
      <span>{grams ? `${grams}g` : '-'}</span>
      {ratio ? (
        <>
          {' '}
          <span className="text-muted-foreground">{ratio}</span>
        </>
      ) : null}
    </>
  )
}
