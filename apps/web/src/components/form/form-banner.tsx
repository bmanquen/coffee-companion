export function FormBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      data-slot="form-banner"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {message}
    </div>
  )
}
