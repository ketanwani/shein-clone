/**
 * Who a request acts for, whichever credential it arrived with.
 *
 * Three paths reach the same place — a userId that the bag, wishlist and orders key off:
 *
 *   session  Authorization: Bearer <token>, or a cookie in a browser
 *   agent    X-Agent-Key + X-Customer-Ref  (stateless; see lib/api/agent.ts)
 *   browser  session cookie (unchanged)
 *
 * The session is tried first and wins. A bearer token names an account the shopper
 * proved they own by completing an OTP; X-Customer-Ref is only the caller asserting who
 * it is acting for. When a request carries both, the proof beats the claim.
 *
 * The agent envelope is still validated on every request even when a session is what
 * ends up identifying the caller, so a bad key is a 401 rather than quietly degrading
 * into an anonymous session.
 */

import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { assertAgentKey, presentedCustomerRef, requireAgentKey, resolveAgentSubject } from "@/lib/api/agent"
import { reconcileCustomerRef } from "@/lib/api/adopt"
import { ApiFailure, assertDatabaseConfigured } from "@/lib/api/http"

const SIGN_IN_HINT =
  "Agents: send X-Agent-Key and X-Customer-Ref. Browsers: sign in, or POST /api/auth/sign-in/email with {email, password} and send the returned token as `Authorization: Bearer <token>`."

/**
 * Written for the agent, not for a developer reading docs.
 *
 * An LLM reads this and decides what to do next. "Requires authentication" reads as a
 * wall it cannot get past, and it hands off to a human — which on the integration side
 * silences the conversation for 24 hours. So it says, plainly, that this is recoverable
 * and exactly which two calls recover it.
 */
const BEARER_HINT =
  "This is expected and recoverable — do not hand off to a human. The shopper is not signed in yet, or their token expired. Sign them in: POST /api/auth/email-otp/send-verification-otp with {email, type:\"sign-in\"}, ask the shopper for the 6-digit code they receive, then POST /api/auth/sign-in/email-otp with {email, otp}. Take data.token from the response, retry this call with `Authorization: Bearer <token>` plus X-Agent-Key, and continue."

export type Subject = {
  userId: string
  /** True when the caller is a trusted agent acting for a shopper it named itself. */
  viaAgent: boolean
  /** Contact address supplied by the agent, if any. Never an identity. */
  email: string | null
}

/**
 * The signed-in account behind a bearer token or cookie, or null.
 *
 * Stays quiet on failure: the root layout resolves the bag on every page render, and a
 * database that is down should not take the storefront with it.
 */
async function sessionUser() {
  if (!process.env.DATABASE_URL) return null
  try {
    const result = await auth.api.getSession({ headers: await headers() })
    return result?.user ?? null
  } catch {
    return null
  }
}

/**
 * Resolves the subject, or null when nobody is identified.
 *
 * Throws for a malformed agent request (bad key, or a ref with no key), but stays quiet
 * for an absent or broken session.
 */
export async function resolveSubject(): Promise<Subject | null> {
  const envelope = await assertAgentKey()

  const user = await sessionUser()
  if (user) {
    // Both credentials present: hand the ref's shopper over to the account, or refuse if
    // the ref already belongs to someone else. Must happen before anything reads the
    // bag, or checkout resolves an empty one.
    await reconcileCustomerRef(envelope?.customerRef ?? null, user.id)
    return { userId: user.id, viaAgent: false, email: user.email }
  }

  if (!envelope) return null

  const agent = await resolveAgentSubject()
  return agent ? { userId: agent.userId, viaAgent: true, email: agent.email } : null
}

/** The subject for a route that requires one. 401s when the caller is anonymous. */
export async function requireSubject(): Promise<Subject> {
  assertDatabaseConfigured()
  const subject = await resolveSubject()
  if (!subject) {
    throw new ApiFailure(401, "unauthorized", "This endpoint requires a signed-in user or an agent key.", SIGN_IN_HINT)
  }
  return subject
}

/**
 * The subject for a route where the shopper must have proved who they are.
 *
 * Two independent checks, and both must pass:
 *
 *   X-Agent-Key            the caller is the GLOWA integration
 *   Authorization: Bearer  the shopper signed in, and this token is theirs
 *
 * X-Customer-Ref is deliberately not consulted here. On the wishlist and the order
 * history it would be a way round the token: anyone holding the shared secret could name
 * a shopper and read their history without that shopper ever signing in. The bag and the
 * customer profile still accept it — those are what the agent fills in on the shopper's
 * behalf before there is an account to speak of.
 */
export async function requireSessionSubject(): Promise<Subject> {
  assertDatabaseConfigured()
  await requireAgentKey()

  const user = await sessionUser()
  if (!user) {
    throw new ApiFailure(401, "unauthorized", "This endpoint requires a signed-in shopper.", BEARER_HINT)
  }

  // The integration sends X-Customer-Ref on every call, so these routes see all three
  // credentials. The token decides identity; the ref is reconciled against it so a pair
  // naming two different shoppers is an error rather than a quiet preference.
  await reconcileCustomerRef(await presentedCustomerRef(), user.id)

  return { userId: user.id, viaAgent: false, email: user.email }
}
