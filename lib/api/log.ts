/**
 * Console logging for the REST API, so the dev server output shows exactly what an
 * agent called and what it got back. Set API_LOG=0 (or false/off) to silence it.
 *
 * API_LOG_VERBOSE=1 adds every request header and the request body, for working out why
 * a call did something unexpected. It is off by default, and not because of noise:
 * these requests carry the agent key, bearer tokens, passwords, OTPs, card numbers and
 * home addresses, and a log file outlives the request that wrote it. Verbose mode
 * redacts the credentials and the card (see SECRET_HEADERS and SECRET_FIELDS) but still
 * writes email addresses and shipping addresses in full, because those are usually the
 * thing being debugged. Development only.
 */

const OFF = new Set(["0", "false", "off"])

const enabled = () => !OFF.has((process.env.API_LOG ?? "").toLowerCase())

/** Opt-in. Off unless explicitly set, like every other debug switch here. */
const verbose = () => process.env.API_LOG_VERBOSE === "1"

/**
 * Deciding which header values are safe to write down.
 *
 * This started as a list of known credential headers, which was the wrong shape: the
 * first time it ran behind Vercel it printed x-vercel-oidc-token — a production-scoped
 * identity token — along with x-vercel-proxy-signature and an Authorization bearer
 * nested inside x-vercel-sc-headers. A platform can add a header carrying a secret at
 * any time, and an allowlist of bad names only ever knows about yesterday's.
 *
 * So it now matches on shape as well as name, and treats anything that looks like a
 * credential as one. A false positive costs a fingerprint instead of a value in a debug
 * log; a false negative writes a live token to disk.
 */
const SECRET_HEADER_NAME = /(^|-)(authorization|cookie|token|secret|signature|sig|key|credential|password|otp|auth|jwt)(-|$)/i

/** Three base64url segments: a JWT, whoever emitted it and whatever it is called. */
const JWT_SHAPED = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/

/** A value long enough to be a token is treated as one, whatever the header is called. */
const LONG_VALUE = 120

function looksSecret(name: string, value: string) {
  if (SECRET_HEADER_NAME.test(name)) return true
  if (JWT_SHAPED.test(value)) return true
  if (/\bBearer\s+\S/i.test(value)) return true
  return value.length > LONG_VALUE
}

/**
 * Body fields never worth logging. A password or a card number is never the reason a
 * call misbehaved, and writing either down is a problem in its own right.
 */
const SECRET_FIELDS = new Set([
  "password",
  "newpassword",
  "confirm",
  "currentpassword",
  "cardnumber",
  "cvc",
  "otp",
  "token",
])

const BODY_PREVIEW_CHARS = 600

function redactSecret(value: string) {
  const bare = value.replace(/^Bearer\s+/i, "")
  return bare.length > 6 ? `${bare.slice(0, 6)}… (${bare.length} chars)` : `… (${bare.length} chars)`
}

/** Every header, with anything credential-shaped reduced to a fingerprint. */
export function formatHeaders(headers: Headers) {
  const lines: string[] = []
  for (const [name, value] of [...headers.entries()].sort()) {
    lines.push(`      ${name}: ${looksSecret(name, value) ? redactSecret(value) : value}`)
  }
  return lines.join("\n")
}

/** Recursively blanks the fields above, whatever nesting they arrive in. */
function redactBody(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactBody)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        SECRET_FIELDS.has(k.toLowerCase()) ? [k, "[redacted]"] : [k, redactBody(v)],
      ),
    )
  }
  return value
}

/**
 * The request body, read from a clone so the handler still gets to parse the original.
 * Reading `request.body` directly here would leave the route with an empty stream.
 */
async function formatBody(request: Request): Promise<string | null> {
  if (request.method === "GET" || request.method === "HEAD") return null
  try {
    const text = await request.clone().text()
    if (!text) return null
    try {
      const pretty = JSON.stringify(redactBody(JSON.parse(text)))
      return pretty.length > BODY_PREVIEW_CHARS ? `${pretty.slice(0, BODY_PREVIEW_CHARS)}…` : pretty
    } catch {
      // Not JSON — a form post, say. Truncate rather than guess at its shape.
      return text.length > BODY_PREVIEW_CHARS ? `${text.slice(0, BODY_PREVIEW_CHARS)}…` : text
    }
  } catch {
    return "(unreadable body)"
  }
}

/**
 * Logs headers and body for one request. Separate from logRequestStart because it has
 * to await the body, and the start line should appear immediately.
 */
export async function logRequestDetail(pending: Pending | null, request: Request) {
  if (!pending || !verbose()) return
  console.log(`[api] ${pending.id}     headers:\n${formatHeaders(request.headers)}`)
  const body = await formatBody(request)
  if (body) console.log(`[api] ${pending.id}     body: ${body}`)
}

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
    await logRequestDetail(pending, request)
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
    const safe = maskEmails(text)
    return safe.length > PREVIEW_CHARS ? `${safe.slice(0, PREVIEW_CHARS)}… (${safe.length} chars)` : safe
  } catch {
    return "(unreadable body)"
  }
}

// Customer profiles and orders carry the shopper's address, and logs outlive the
// request. Keep enough to correlate a report with a call, not enough to be a mailing
// list: ada@example.com -> a***@example.com.
const EMAIL = /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

export function maskEmails(text: string) {
  return text.replace(EMAIL, (_match, first: string, domain: string) => `${first}***${domain}`)
}
