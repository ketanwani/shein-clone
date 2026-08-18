import { assertAgentKey } from "@/lib/api/agent"
import { ApiFailure } from "@/lib/api/failure"
import { logRequestEnd, logRequestStart } from "@/lib/api/log"

export { ApiFailure }

const SIGN_IN_HINT =
  "Agents: send X-Agent-Key and X-Customer-Ref. Browsers: sign in, or POST /api/auth/sign-in/email with {email, password} and send the returned token as `Authorization: Bearer <token>`."
const SHOPIFY_HINT =
  "Set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN in .env.local, then restart the dev server."
const DATABASE_HINT =
  "Set DATABASE_URL in .env.local and create the tables from lib/db/schema.ts, then restart the dev server."

export function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export function badRequest(message: string, hint?: string) {
  return new ApiFailure(400, "bad_request", message, hint)
}

export function notFound(message: string) {
  return new ApiFailure(404, "not_found", message)
}

// Postgres/socket failures that mean "the database isn't reachable", not "the query was wrong".
const DB_ERROR_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "28P01", "3D000", "42P01"])

/** Turns any thrown value into a JSON error body with a useful status code. */
export function toErrorResponse(err: unknown) {
  if (err instanceof ApiFailure) {
    return json(
      { error: { code: err.code, message: err.message, ...(err.hint ? { hint: err.hint } : {}) } },
      err.status,
    )
  }

  const message = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: string } | null)?.code

  if (message.includes("Missing Shopify environment variables")) {
    return json({ error: { code: "shopify_unavailable", message, hint: SHOPIFY_HINT } }, 503)
  }

  if (code && DB_ERROR_CODES.has(code)) {
    return json(
      {
        error: {
          code: "database_unavailable",
          message: `Cannot reach Postgres: ${message}`,
          hint: DATABASE_HINT,
        },
      },
      503,
    )
  }

  if (message === "Unauthorized") {
    return json({ error: { code: "unauthorized", message: "Sign in first.", hint: SIGN_IN_HINT } }, 401)
  }

  console.error("[api] unhandled error:", err)
  return json({ error: { code: "internal_error", message } }, 500)
}

/** Wraps a route handler so thrown errors become documented JSON error bodies, and logs both sides. */
export async function handle(request: Request, fn: () => Promise<Response>) {
  const pending = logRequestStart(request)
  let response: Response
  try {
    // Before anything else, including reading the body: a caller presenting agent
    // credentials must check out, or it gets 401 rather than a validation error that
    // would let it probe the endpoint unauthenticated.
    await assertAgentKey()
    response = await fn()
  } catch (err) {
    response = toErrorResponse(err)
  }
  await logRequestEnd(pending, response)
  return response
}

/** 503 before doing any work, rather than a confusing connection error from pg. */
export function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new ApiFailure(
      503,
      "database_unavailable",
      "DATABASE_URL is not set, so this endpoint cannot read or write data.",
      DATABASE_HINT,
    )
  }
}

/** Reads a bounded positive integer from the query string. */
export function readLimit(url: URL, fallback: number, max: number) {
  const raw = url.searchParams.get("limit")
  if (raw === null) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw badRequest(`limit must be an integer between 1 and ${max}.`)
  }
  return value
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw badRequest("Request body must be valid JSON.", "Send Content-Type: application/json.")
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw badRequest("Request body must be a JSON object.")
  }
  return body as Record<string, unknown>
}

export function readString(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest(`"${field}" is required and must be a non-empty string.`)
  }
  return value
}

export function readInteger(
  body: Record<string, unknown>,
  field: string,
  { min, max, fallback }: { min: number; max: number; fallback?: number },
) {
  const value = body[field]
  if (value === undefined && fallback !== undefined) return fallback
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw badRequest(`"${field}" must be an integer between ${min} and ${max}.`)
  }
  return value as number
}
