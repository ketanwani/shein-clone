/**
 * Console logging for the REST API, so the dev server output shows exactly what an
 * agent called and what it got back. Set API_LOG=0 (or false/off) to silence it.
 */

const OFF = new Set(["0", "false", "off"])

const enabled = () => !OFF.has((process.env.API_LOG ?? "").toLowerCase())

/** Auth bodies carry OTPs and session tokens, so those responses are logged status-only. */
const REDACTED = /^\/api\/auth\//

const PREVIEW_CHARS = 300

let counter = 0

type Pending = {
  id: string
  method: string
  path: string
  startedAt: number
  redact: boolean
}

/** Logs the incoming request and returns the handle needed to log its response. */
export function logRequestStart(request: Request): Pending | null {
  if (!enabled()) return null

  const url = new URL(request.url)
  const pending: Pending = {
    id: `#${String(++counter).padStart(3, "0")}`,
    method: request.method,
    path: url.pathname + url.search,
    startedAt: performance.now(),
    redact: REDACTED.test(url.pathname),
  }

  console.log(`[api] ${pending.id} --> ${pending.method} ${pending.path} ${describeCaller(request)}`)
  return pending
}

export async function logRequestEnd(pending: Pending | null, response: Response) {
  if (!pending) return

  const ms = Math.round(performance.now() - pending.startedAt)
  const body = pending.redact ? "[redacted]" : await previewBody(response)
  const line = `[api] ${pending.id} <-- ${response.status} ${pending.method} ${pending.path} ${ms}ms ${body}`

  if (response.status >= 500) console.error(line)
  else if (response.status >= 400) console.warn(line)
  else console.log(line)
}

/** For handlers that throw past the JSON error mapping instead of returning a response. */
export function logRequestFailure(pending: Pending | null, err: unknown) {
  if (!pending) return
  const ms = Math.round(performance.now() - pending.startedAt)
  console.error(`[api] ${pending.id} <-- threw ${pending.method} ${pending.path} ${ms}ms`, err)
}

/** Wraps a route handler that manages its own responses (e.g. the better-auth catch-all). */
export function withApiLogging(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const pending = logRequestStart(request)
    try {
      const response = await fn(request)
      await logRequestEnd(pending, response)
      return response
    } catch (err) {
      logRequestFailure(pending, err)
      throw err
    }
  }
}

/** How the caller authenticated and what it says it is — enough to tell an agent from a browser. */
function describeCaller(request: Request) {
  const authorization = request.headers.get("authorization")
  const auth = authorization
    ? `bearer ${redactToken(authorization)}`
    : request.headers.get("cookie")
      ? "cookie"
      : "none"

  const ua = request.headers.get("user-agent")?.slice(0, 60) ?? "unknown"
  return `(auth=${auth}, ua="${ua}")`
}

/** Enough of the token to correlate calls, not enough to replay one from a log file. */
function redactToken(authorization: string) {
  const token = authorization.replace(/^Bearer\s+/i, "")
  return token.length > 8 ? `${token.slice(0, 8)}…` : "…"
}

async function previewBody(response: Response) {
  try {
    const text = await response.clone().text()
    if (!text) return "(empty body)"
    return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}… (${text.length} chars)` : text
  } catch {
    return "(unreadable body)"
  }
}
