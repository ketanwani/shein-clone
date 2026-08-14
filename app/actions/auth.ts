"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  createCustomer,
  createCustomerToken,
  deleteCustomerToken,
  getCustomer,
} from "@/lib/shopify/customer"
import type { Customer } from "@/lib/shopify/types"

const TOKEN_COOKIE = "glowa_customer_token"

async function setTokenCookie(token: string, expiresAt: string | null) {
  const store = await cookies()
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt ? new Date(expiresAt) : undefined,
  })
}

export async function getCurrentCustomer(): Promise<Customer | null> {
  const store = await cookies()
  const token = store.get(TOKEN_COOKIE)?.value
  if (!token) return null
  try {
    return await getCustomer(token)
  } catch {
    return null
  }
}

export async function getCustomerToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(TOKEN_COOKIE)?.value ?? null
}

export type AuthState = { error: string | null }

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const firstName = String(formData.get("firstName") ?? "").trim()
  const lastName = String(formData.get("lastName") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password || !firstName) {
    return { error: "Please fill in all required fields." }
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." }
  }

  const { customer, errors } = await createCustomer({ firstName, lastName, email, password })
  if (errors.length > 0 || !customer) {
    return { error: errors[0] ?? "Could not create your account." }
  }

  const { token, expiresAt, errors: tokenErrors } = await createCustomerToken(email, password)
  if (!token) {
    return { error: tokenErrors[0] ?? "Account created. Please sign in." }
  }
  await setTokenCookie(token, expiresAt)
  redirect("/account")
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Please enter your email and password." }
  }

  const { token, expiresAt, errors } = await createCustomerToken(email, password)
  if (!token) {
    return { error: errors[0] ?? "Incorrect email or password." }
  }
  await setTokenCookie(token, expiresAt)
  redirect("/account")
}

export async function signOutAction() {
  const store = await cookies()
  const token = store.get(TOKEN_COOKIE)?.value
  if (token) await deleteCustomerToken(token)
  store.delete(TOKEN_COOKIE)
  redirect("/")
}
