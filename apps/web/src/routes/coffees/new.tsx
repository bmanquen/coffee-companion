import { H1 } from '@/components/typography/h1'
import { Card } from '@/components/ui/card'
import { useAppForm } from '@/hooks/form'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/coffees/new')({
  component: NewCoffeeComponent,
})

function NewCoffeeComponent() {
  const form = useAppForm({
    defaultValues: {
      name: '',
    },
    onSubmit: ({ value }) => {
      console.log(value)
    },
  })

  return (
    <Card className="flex flex-col items-center w-3/4 mx-auto">
      <H1 className="text-start w-1/2">Add Coffee</H1>
      <form
        className="w-1/2"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="name">
          {(field) => <field.TextField label="Name" placeholder="Name" />}
        </form.AppField>
      </form>
    </Card>
  )
}
