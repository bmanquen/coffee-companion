import type { ReactNode } from 'react'
import { FormLabel } from '@/components/form/form-label'
import { Button } from '@/components/ui/button'
import { Field, FieldContent } from '@/components/ui/field'

export function CoffeeOriginFields({
  isBlend,
  onBlendChange,
  onAddOrigin,
  children,
}: {
  isBlend: boolean
  onBlendChange: (isBlend: boolean) => void
  onAddOrigin?: () => void
  children: ReactNode
}) {
  return (
    <>
      <Field>
        <FormLabel id="coffee-origin-label">Origin</FormLabel>
        <FieldContent>
          <div
            role="radiogroup"
            aria-labelledby="coffee-origin-label"
            className="flex gap-4"
          >
            <label className="flex items-center gap-2 text-sm font-normal">
              <input
                type="radio"
                name="coffee-origin"
                checked={!isBlend}
                onChange={() => onBlendChange(false)}
              />
              Single origin
            </label>
            <label className="flex items-center gap-2 text-sm font-normal">
              <input
                type="radio"
                name="coffee-origin"
                checked={isBlend}
                onChange={() => onBlendChange(true)}
              />
              Blend
            </label>
          </div>
        </FieldContent>
      </Field>
      {children}
      {isBlend ? (
        <Button type="button" variant="outline" size="sm" onClick={onAddOrigin}>
          Add country
        </Button>
      ) : null}
    </>
  )
}
