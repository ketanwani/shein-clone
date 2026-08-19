/**
 * Email-OTP sign-in, shaped for the Meta integration.
 *
 * Better Auth already implements the flow; what this module adds is the contract the
 * integration is configured against, and the two rules that contract turns on.
 *
 * UNIFORM RESPONSES. The agent answers Instagram DMs, so anything it can be made to say
 * is a public oracle. Ask it to sign in a hundred addresses and it must not reveal which
 * ones shop here. So send-verification-otp answers an identical 200 either way, and
 * verification answers an identical 401 `invalid_code` for a wrong code, an expired
 * code, a burnt-through attempt limit and an address with no account.
 *
 * STABLE SHAPE. The integration extracts the token with a literal path string, so the
 * body is `{ data: { token, expiresAt, user } }` and the token is at `data.token`.
 * Better Auth returns `{ token, user }` flat with no expiry, which is why this wraps it
 * rather than letting the catch-all handler answer. Changing either the nesting or the
 * field names silently stops the integration capturing the token.
 */

import { isAPIError } from "better-auth/api"
import { auth, SESSION_EXPIRES_IN_SECONDS } from "@/lib/auth"
import { ApiFailure } from "@/lib/api/failure"

/**
 * The fixed code this deployment also accepts, or null when the bypass is off.
 *
 * Off unless DEMO_OTP_CODE is explicitly set — not keyed off NODE_ENV or a build flag,
 * so turning it off is one visible change in one place. While it is on, anyone who can
 * reach the server and holds the agent key can sign in as any email address and read
 * that shopper's wishlist and orders. It exists because no mail provider is wired up
 * yet, and it is the only reason a sign-in can currently complete.
 */
export function demoOtpCode(): string | null {
  return process.env.DEMO_OTP_CODE?.trim() || null
}

if (demoOtpCode()) {
  console.warn(
    "[auth] DEMO_OTP_CODE is set — a fixed code signs in as ANY email address. " +
      "Unset it to accept only genuine emailed codes.",
  )
}

// One message for every way verification can fail. Two different strings, or two
// different hints, would be enough to tell an unknown address from a wrong code.
const INVALID_CODE_MESSAGE = "That code is not valid."
const INVALID_CODE_HINT =
  "Request a new code with POST /api/auth/email-otp/send-verification-otp, then send it within 10 minutes. Codes are single-use."

function invalidCode() {
  return new ApiFailure(401, "invalid_code", INVALID_CODE_MESSAGE, INVALID_CODE_HINT)
}

/**
 * Sends a sign-in code, and reports nothing about whether the address has an account.
 *
 * Better Auth's own 4xx here are precisely the answers that would differ between a known
 * and an unknown address, so they are swallowed and the caller still sees 200. Anything
 * that is not an API error — Postgres unreachable, say — is allowed to surface, because
 * a 503 tells the caller about the server rather than about the shopper.
 */
export async function sendSignInOtp(email: string): Promise<void> {
  try {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } })
  } catch (err) {
    if (!isAPIError(err)) throw err
  }
}

export type SignInResult = {
  token: string
  /** ISO 8601, UTC. When this passes, re-run the sign-in flow. */
  expiresAt: string
  user: unknown
}

/**
 * Verifies a code and issues a session.
 *
 * The account is created here rather than at send time. A shopper who mistypes their
 * address gets a code mailed to a stranger, and that is bad enough without also
 * provisioning the stranger an account — deferring creation to a correct code means a
 * typo leaves nothing behind.
 */
export async function signInWithOtp(email: string, otp: string): Promise<SignInResult> {
  try {
    const result = await auth.api.signInEmailOTP({ body: { email, otp: await redeemableCode(email, otp) } })
    return {
      token: result.token,
      expiresAt: await sessionExpiry(result.token),
      user: result.user,
    }
  } catch (err) {
    if (err instanceof ApiFailure) throw err
    // Wrong code, expired code, too many attempts, unknown address — one answer.
    if (isAPIError(err)) throw invalidCode()
    throw err
  }
}

/**
 * The code actually handed to Better Auth.
 *
 * Normally the caller's own. When the demo bypass is on and the caller sent the fixed
 * value, this mints a genuine code server-side and returns that instead, so verification
 * runs the real path: same account creation, same session, same response shape, same
 * uniform failures. Demo mode changes which code is accepted and nothing else.
 *
 * createVerificationOTP is server-only — Better Auth does not expose it over HTTP — so
 * this cannot be used to fetch a code for an address you do not control.
 */
async function redeemableCode(email: string, presented: string): Promise<string> {
  const demo = demoOtpCode()
  if (!demo || presented !== demo) return presented
  return auth.api.createVerificationOTP({ body: { email, type: "sign-in" } })
}

/**
 * When the session Better Auth just created runs out.
 *
 * Asked of Better Auth rather than read off the session row, and rather than computed
 * from the configured window. `session.expiresAt` is a `timestamp` with no time zone, so
 * a direct read comes back shifted by the server's UTC offset — eight hours out on the
 * machine this was written on, which would have had the integration re-authenticating
 * late. Going through the same call that later enforces the expiry means the number
 * reported is the number the server acts on, whatever the column does.
 *
 * The fallback covers the lookup coming back empty: the integration branches on this
 * field to decide when to re-authenticate, so a slightly early estimate beats no field.
 */
async function sessionExpiry(token: string): Promise<string> {
  const result = await auth.api.getSession({
    headers: new Headers({ authorization: `Bearer ${token}` }),
  })

  const expiresAt = result?.session?.expiresAt ?? new Date(Date.now() + SESSION_EXPIRES_IN_SECONDS * 1000)
  return new Date(expiresAt).toISOString()
}
