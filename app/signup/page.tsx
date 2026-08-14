import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getCurrentCustomer } from "@/app/actions/auth"
import { AuthForm } from "@/components/account/auth-form"

export const metadata: Metadata = { title: "Create Account — GLOWA" }

export default async function SignupPage() {
  const customer = await getCurrentCustomer()
  if (customer) redirect("/account")
  return <AuthForm mode="signup" />
}
