import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/account/auth-form"

export const metadata: Metadata = { title: "Create Account — GLOWA" }

export default async function SignupPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/account")
  return <AuthForm mode="signup" />
}
