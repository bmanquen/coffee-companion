export function coffeeOptionLabel(coffee: {
  name: string
  roaster?: { name: string | null } | null
}): string {
  const roaster = coffee.roaster?.name?.trim()
  return roaster ? `${coffee.name} · ${roaster}` : coffee.name
}
