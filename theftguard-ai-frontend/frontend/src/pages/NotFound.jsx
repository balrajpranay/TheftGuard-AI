import { Button, EmptyState } from '../components/ui'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <EmptyState title="This page does not exist" action={<Button to="/" variant="primary">Go to the home page</Button>}>
        Check the address, or go back to the home page and use the navigation.
      </EmptyState>
    </div>
  )
}
