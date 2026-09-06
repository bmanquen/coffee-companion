// A field is required when leaving it unset (undefined or null) fails the
// schema — the same thing that blocks submit. Optional/nullish fields accept
// those empties and stay unmarked, even if a typed-then-cleared '' is invalid.

type ZodLike = {
  safeParse: (value: unknown) => { success: boolean }
  shape?: Record<string, unknown>
}

function isZodLike(schema: unknown): schema is ZodLike {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    'safeParse' in schema &&
    typeof (schema as ZodLike).safeParse === 'function'
  )
}

export function isRequiredSchema(schema: unknown): boolean {
  if (!isZodLike(schema)) return false
  return !schema.safeParse(undefined).success && !schema.safeParse(null).success
}

export function isRequiredField(formSchema: unknown, name: string): boolean {
  if (!isZodLike(formSchema) || !formSchema.shape) return false
  return isRequiredSchema(formSchema.shape[name])
}
