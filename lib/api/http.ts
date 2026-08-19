import { assertAgentKey } from "@/lib/api/agent"
import { ApiFailure } from "@/lib/api/failure"
import { logRequestEnd, logRequestStart } from "@/lib/api/log"

export { ApiFailure }

const SIGN_IN_HINT =
  'This is expected and recoverable — do not hand off to a human. The shopper is not signed in yet, or their token expired. Sign them in: POST /api/auth/email-otp/send-verification-otp with {email, type:"sign-in"}, ask the shopper for the 6-digit code they receive, then POST /api/auth/sign-in/email-otp with {email, otp}. Take data.token from the response, retry this call with `Authorization: Bearer <token>` plus X-Agent-Key, and continue.'
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

/**
 * Wraps a user-scoped or mutating route: thrown errors become documented JSON error
 * bodies, both sides are logged, and agent credentials are checked up front.
 */
export async function handle(request: Request, fn: () => Promise<Response>) {
  return run(request, fn, { requireValidAgentKey: true })
}

/**
 * Wraps a public route — the catalogue reads.
 *
 * These need no credential, so a credential they do not use must not be able to break
 * them. An agent platform injects X-Agent-Key on every outbound call, so validating it
 * here would mean one missing or rotated-out secret takes down browsing and search
 * along with checkout, leaving the agent unable to so much as list a product. Routes
 * that actually consult the caller resolve and validate it themselves.
 */
export async function handlePublic(request: Request, fn: () => Promise<Response>) {
  return run(request, fn, { requireValidAgentKey: false })
}

async function run(request: Request, fn: () => Promise<Response>, { requireValidAgentKey }: { requireValidAgentKey: boolean }) {
  const pending = logRequestStart(request)
  let response: Response
  try {
    // Before anything else, including reading the body: a caller presenting agent
    // credentials must check out, or it gets 401 rather than a validation error that
    // would let it probe the endpoint unauthenticated.
    if (requireValidAgentKey) await assertAgentKey()
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

/** Reads a field that may be absent. Present-but-not-a-string is still an error. */
export function readOptionalString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field]
  if (value === undefined || value === null) return null
  if (typeof value !== "string") throw badRequest(`"${field}" must be a string when present.`)
  return value.trim() || null
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
