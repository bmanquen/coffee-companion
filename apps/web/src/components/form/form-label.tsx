import { FieldLabel } from '@/components/ui/field'

export function FormLabel({
  required = false,
  children,
  ...props
}: React.ComponentProps<typeof FieldLabel> & { required?: boolean }) {
  return (
    <FieldLabel {...props}>
      <span>
        {children}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
    </FieldLabel>
  )
}
