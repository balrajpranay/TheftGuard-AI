import { Button, Field, inputClass, Notice } from '../components/ui'

export default function SignIn() {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
      <Notice tone="warn" title="Sign-in is not connected" className="mt-4">
        Authentication will be added with the backend. This preview has no accounts, so the fields below are switched off.
      </Notice>
      <div className="mt-6 space-y-4">
        <Field label="Email address" htmlFor="email">
          <input id="email" type="email" disabled className={inputClass} placeholder="name@utility.example" />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" type="password" disabled className={inputClass} />
        </Field>
        <Button variant="dark" disabled className="w-full">Sign in</Button>
        <Button to="/app/dashboard" variant="primary" className="w-full">Continue to the demo workspace</Button>
      </div>
    </div>
  )
}
