/**
 * A small fixed-window counter, used to keep send-OTP from becoming a free mailer.
 *
 * In-process and therefore per-instance: two servers behind a load balancer each allow
 * the configured budget. That is deliberate for this deployment — it needs no Redis and
 * fails open rather than taking sign-in down — but it is the thing to replace with a
 * shared store before this is a real front door.
 */

type Window = { count: number; resetAt: number }

export type RateLimitRule = {
  /** Requests allowed per window. */
  max: number
  /** Window length in milliseconds. */
  windowMs: number
}

/** Bounds memory when a caller cycles through many distinct keys. */
const MAX_TRACKED_KEYS = 10_000

const windows = new Map<string, Window>()

function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

/**
 * Counts one request against `key`.
 *
 * Returns null when the request is within budget, or the number of whole seconds until
 * the window resets when it is not. A blocked request does not extend the window, so a
 * caller that keeps hammering still gets in as soon as the window rolls over.
 */
export function consume(key: string, rule: RateLimitRule): number | null {
  const now = Date.now()
  if (windows.size >= MAX_TRACKED_KEYS) sweep(now)

  const existing = windows.get(key)
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs })
    return null
  }

  if (existing.count >= rule.max) return Math.max(1, Math.ceil((existing.resetAt - now) / 1000))

  existing.count += 1
  return null
}

/** Only used by tests and by the dev server's hot reload; never on a request path. */
export function resetRateLimits() {
  windows.clear()
}

/**
 * The best guess at who is calling, for rate limiting only.
 *
 * X-Forwarded-For is caller-controlled unless a proxy overwrites it, so this is a
 * speed bump rather than an identity. The per-email limit is the one that actually
 * protects a given inbox; this one just stops a single host walking an address list.
 */
export function callerFingerprint(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]!.trim() || "unknown"
  return request.headers.get("x-real-ip")?.trim() || "unknown"
}
