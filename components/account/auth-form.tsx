"use client"

import Link from "next/link"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { signInAction, signUpAction, type AuthState } from "@/app/actions/auth"

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-full bg-accent py-3 text-sm font-bold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Please wait..." : label}
    </button>
  )
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent"

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const action = mode === "login" ? signInAction : signUpAction
  const [state, formAction] = useActionState<AuthState, FormData>(action, { error: null })

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-center font-serif text-3xl font-extrabold">
        {mode === "login" ? "Welcome Back" : "Join GLOWA"}
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {mode === "login"
          ? "Sign in to track orders and save your favorites."
          : "Create an account for faster checkout and exclusive drops."}
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        {mode === "signup" && (
          <div className="flex gap-3">
            <input name="firstName" placeholder="First name" required className={inputClass} aria-label="First name" />
            <input name="lastName" placeholder="Last name" className={inputClass} aria-label="Last name" />
          </div>
        )}
        <input
          name="email"
          type="email"
          placeholder="Email address"
          required
          autoComplete="email"
          className={inputClass}
          aria-label="Email address"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={inputClass}
          aria-label="Password"
        />

        {state.error && (
          <p role="alert" className="rounded-lg bg-sale/10 px-4 py-2 text-sm text-sale">
            {state.error}
          </p>
        )}

        <SubmitButton label={mode === "login" ? "Sign In" : "Create Account"} />
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New to GLOWA?{" "}
            <Link href="/signup" className="font-semibold text-accent hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-accent hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  )
}
