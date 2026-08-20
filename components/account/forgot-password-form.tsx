"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { resetPasswordAction, verifyResetCodeAction } from "@/app/actions/password-reset"
import { MIN_PASSWORD_LENGTH } from "@/lib/password"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent"

const buttonClass =
  "mt-2 w-full rounded-full bg-accent py-3 text-sm font-bold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"

type Step = "email" | "code" | "password" | "done"

export function ForgotPasswordForm({ redirectTo = "/account" }: { redirectTo?: string }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function submit(handler: (form: FormData) => Promise<void>) {
    return async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setError(null)
      setPending(true)
      try {
        await handler(new FormData(e.currentTarget))
      } catch {
        setError("Something went wrong. Please try again.")
      } finally {
        setPending(false)
      }
    }
  }

  // Nothing is sent and nothing is checked here: the address is only carried forward.
  // Answering "no such account" at this point would make the form a way to test which
  // addresses are registered.
  const onEmail = submit(async (form) => {
    const value = String(form.get("email") ?? "").trim()
    if (!value) return setError("Enter your email address.")
    setEmail(value)
    setStep("code")
  })

  const onCode = submit(async (form) => {
    const value = String(form.get("code") ?? "").trim()
    const result = await verifyResetCodeAction(value)
    if (!result.ok) return setError(result.error)
    setCode(value)
    setStep("password")
  })

  const onPassword = submit(async (form) => {
    const password = String(form.get("password") ?? "")
    const confirm = String(form.get("confirm") ?? "")
    if (password !== confirm) return setError("Those passwords do not match.")

    const result = await resetPasswordAction(email, code, password)
    if (!result.ok) return setError(result.error)
    setStep("done")
  })

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-center font-serif text-3xl font-extrabold">
        {step === "done" ? "Password Updated" : "Reset Your Password"}
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {step === "email" && "Enter the email address on your account."}
        {step === "code" && `Enter the 6-digit code for ${email}.`}
        {step === "password" && "Choose a new password."}
        {step === "done" && "You can now sign in with your new password."}
      </p>

      {step === "email" && (
        <form onSubmit={onEmail} className="mt-8 flex flex-col gap-4">
          <input
            name="email"
            type="email"
            defaultValue={email}
            placeholder="Email address"
            required
            autoComplete="email"
            className={inputClass}
            aria-label="Email address"
          />
          <Error message={error} />
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? "Please wait..." : "Continue"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={onCode} className="mt-8 flex flex-col gap-4">
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            required
            className={`${inputClass} text-center tracking-[0.4em]`}
            aria-label="Verification code"
          />
          <Error message={error} />
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? "Checking..." : "Verify Code"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setStep("email")
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Use a different email
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={onPassword} className="mt-8 flex flex-col gap-4">
          <input
            name="password"
            type="password"
            placeholder="New password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className={inputClass}
            aria-label="New password"
          />
          <input
            name="confirm"
            type="password"
            placeholder="Confirm new password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className={inputClass}
            aria-label="Confirm new password"
          />
          <Error message={error} />
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? "Saving..." : "Set New Password"}
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="mt-8 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => router.push(`/login?redirect=${encodeURIComponent(redirectTo)}`)}
            className={buttonClass}
          >
            Sign In
          </button>
        </div>
      )}

      {step !== "done" && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      )}
    </div>
  )
}

function Error({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg bg-sale/10 px-4 py-2 text-sm text-sale">
      {message}
    </p>
  )
}
