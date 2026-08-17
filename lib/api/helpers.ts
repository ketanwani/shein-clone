import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"

/**
 * Shared helpers for the public REST API under /api/v1.
 *
 * Auth model: machine-to-machine bearer token. The AI agent (or Postman)
 * sends `Authorization: Bearer <GLOWA_API_KEY>` on every request.
 *
 * Because there is no browser session, user-scoped resources (orders,
 * wishlist) take an explicit `userId` or `email` supplied by the caller.
 */

export function json(data: unknown, init?: number | ResponseInit) {
  const responseInit = typeof init === "number" ? { status: init } : init
  return NextResponse.json(data, responseInit)
}

export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

/**
 * Verifies the bearer token against GLOWA_API_KEY.
 * Returns an error `Response` when unauthorized, otherwise `null`.
 */
export function requireApiKey(req: Request): Response | null {
  const expected = process.env.GLOWA_API_KEY
  if (!expected) {
    return apiError(
      "API is not configured. Set the GLOWA_API_KEY environment variable in Project Settings.",
      503,
    )
  }

  const header = req.headers.get("authorization") ?? ""
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : ""

  if (!token || token !== expected) {
    return apiError("Unauthorized. Provide a valid 'Authorization: Bearer <API_KEY>' header.", 401)
  }
  return null
}

/**
 * Resolves a user id from either an explicit `userId` or an `email`.
 * Returns null when neither resolves to a real user.
 */
export async function resolveUserId(params: {
  userId?: string | null
  email?: string | null
}): Promise<string | null> {
  if (params.userId) {
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.id, params.userId)).limit(1)
    return row?.id ?? null
  }
  if (params.email) {
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, params.email.toLowerCase().trim()))
      .limit(1)
    return row?.id ?? null
  }
  return null
}

/** Safely parses a JSON body, returning {} on empty/invalid input. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const text = await req.text()
    if (!text) return {} as T
    return JSON.parse(text) as T
  } catch {
    return {} as T
  }
}
