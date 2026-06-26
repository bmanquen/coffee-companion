export function useSearchSelectResource(
  data: Array<{ id: string; name: string }>,
  createFn?: (name: string) => Promise<{ id: string; name: string }>,
) {
  const options = data.map((item) => ({ value: item.id, label: item.name }))

  const onAddItem = createFn
    ? async (name: string) => {
        const item = await createFn(name)
        return { value: item.id, label: item.name }
      }
    : undefined

  return { options, onAddItem }
}
