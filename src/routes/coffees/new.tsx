import { Input } from '@/components/ui/input'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/coffees/new')({
  component: NewCoffeeComponent,
})

function NewCoffeeComponent() {
  return (
    <form action="">
      <Input placeholder="Name" />
    </form>
  )
}
