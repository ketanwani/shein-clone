/**
 * Overrides the Better Auth catch-all at this one path.
 *
 * A static segment wins over `[...all]`, so this handler answers and Better Auth's
 * generic one never sees the request. Two things are added on top of it: rate limits
 * keyed on the address as well as the source, and a response that is identical whether
 * or not the address has an account.
 */

import { requireAgentKey } from "@/lib/api/agent"
import { assertDatabaseConfigured, badRequest, handle, json, readJsonBody, readString } from "@/lib/api/http"
import { ApiFailure } from "@/lib/api/failure"
import { sendSignInOtp } from "@/lib/api/otp"
import { callerFingerprint, consume } from "@/lib/api/rate-limit"

/**
 * Neither limit depends on whether the account exists, so neither leaks that.
 *
 * The per-email budget does the real work: it matches the code lifetime, so a shopper
 * can ask again if the first never arrives, and no inbox can be used as a mailer. It is
 * per address, so one shopper asking too often never affects another.
 */
const PER_EMAIL = { max: 3, windowMs: 10 * 60 * 1000 }

/**
 * The per-source ceiling: a runaway backstop, not an abuse control.
 *
 * Every shopper signing in through the Meta connector arrives from the same small set of
 * egress addresses, so counting by IP counts aggregate traffic rather than misbehaviour.
 * The old 100 per 10 minutes was low enough that ordinary shared-egress load would trip
 * it and start turning real shoppers away — while an attacker holding a valid key and a
 * spread of addresses walked straight past it.
 *
 * Exempting valid keys outright would make this dead code, since requireAgentKey has
 * already rejected everything without one before we get here. So it stays, raised to a
 * sustained request per second from a single address: far above what shared egress
 * produces, low enough to cap a client stuck in a retry loop.
 */
const PER_SOURCE = { max: 600, windowMs: 10 * 60 * 1000 }

export async function POST(request: Request) {
  return handle(request, async () => {
    // Checked before the body is read, and before a single bucket is touched, so an
    // unauthenticated caller cannot spend someone else's budget.
    await requireAgentKey()
    assertDatabaseConfigured()

    const body = await readJsonBody(request)
    const email = readString(body, "email").trim().toLowerCase()
    const type = readString(body, "type")
    if (type !== "sign-in") {
      throw badRequest(`"type" must be "sign-in".`, "This endpoint only issues sign-in codes.")
    }

    // A malformed request is the caller's own bug and says nothing about any shopper, so
    // it stays a 400. Everything past this point is uniform.
    throttle(`otp:email:${email}`, PER_EMAIL)
    throttle(`otp:source:${callerFingerprint(request)}`, PER_SOURCE)

    await sendSignInOtp(email)

    // Identical whether the address has an account, has none, or was never going to get
    // an email because no provider is configured. The code is never in this body: an
    // agent holding it could sign the shopper in without them.
    return json({ success: true })
  })
}

function throttle(key: string, rule: { max: number; windowMs: number }) {
  const retryAfter = consume(key, rule)
  if (retryAfter === null) return
  throw new ApiFailure(
    429,
    "rate_limited",
    "Too many verification codes requested.",
    `Wait ${retryAfter}s before requesting another code.`,
  )
}
