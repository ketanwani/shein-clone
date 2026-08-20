import Link from "next/link"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { passwordResetAvailable } from "@/app/actions/password-reset"
import { ForgotPasswordForm } from "@/components/account/forgot-password-form"

export const metadata: Metadata = { title: "Reset Password — GLOWA" }

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect: redirectTo } = await searchParams

  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect(redirectTo || "/account")

  // No mail provider means no genuine code to send, so with DEMO_OTP_CODE unset there is
  // no way to complete this. Say so plainly rather than rendering a form that cannot work.
  if (!(await passwordResetAvailable())) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="font-serif text-3xl font-extrabold">Reset Your Password</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Password reset is not available on this deployment. It needs a transactional email provider, or the
          demo code, and neither is configured.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-accent hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return <ForgotPasswordForm redirectTo={redirectTo || "/account"} />
}
