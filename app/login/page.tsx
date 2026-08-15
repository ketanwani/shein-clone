import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/account/auth-form"

export const metadata: Metadata = { title: "Sign In — GLOWA" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect: redirectTo } = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect(redirectTo || "/account")
  return <AuthForm mode="login" redirectTo={redirectTo || "/account"} />
}
