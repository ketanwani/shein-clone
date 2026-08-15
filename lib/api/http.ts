import "server-only"
import { NextResponse } from "next/server"
import { authenticateApiRequest, type ApiPrincipal } from "./auth"

export function json(data: unknown, init?: number | ResponseInit) {
  const responseInit = typeof init === "number" ? { status: init } : init
  return NextResponse.json(data as Record<string, unknown>, responseInit)
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status })
}

/**
 * Wraps a route handler with API-key authentication and uniform error handling.
 * The handler receives the authenticated principal plus the original args.
 */
export function withAuth<Ctx>(
  handler: (req: Request, principal: ApiPrincipal, ctx: Ctx) => Promise<Response> | Response,
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const principal = await authenticateApiRequest(req)
      if (!principal) {
        return apiError(
          401,
          "unauthorized",
          "Missing or invalid API key. Send it as 'Authorization: Bearer glowa_sk_...'.",
        )
      }
      return await handler(req, principal, ctx)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected server error."
      // Surface deliberate validation errors as 400, everything else as 500.
      const isValidation = err instanceof ApiValidationError
      return apiError(isValidation ? 400 : 500, isValidation ? "bad_request" : "server_error", message)
    }
  }
}

/** Throw to return a 400 with a specific message from inside a handler. */
export class ApiValidationError extends Error {}

export async function parseJsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new ApiValidationError("Request body must be valid JSON.")
  }
}
