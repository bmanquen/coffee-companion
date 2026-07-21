// A brew's free-text notes for a section's Notes column — wrapped for multi-line
// display, or a dimmed "No notes..." placeholder when there are none. Shared by
// every method's section so empty notes read consistently (not a dash).
export function BrewNotes({ notes }: { notes: string | null }) {
  if (!notes) {
    return <span className="text-muted-foreground/60">No notes...</span>
  }
  return (
    <span className="block whitespace-pre-wrap break-words lg:mx-auto lg:max-w-[16rem]">
      {notes}
    </span>
  )
}
