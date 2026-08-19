/**
 * Who a request acts for.
 *
 * One shopper identity, and only one: the account behind a session. An agent gets that
 * session as a bearer token the shopper obtained themselves through the email-OTP flow;
 * a browser gets it as a cookie. Either way the answer is a real account.
 *
 * X-Customer-Ref used to be a second answer — the caller asserting who it was acting
 * for. It is gone, and nothing here reads it. A ref is only a claim, so everything it
 * unlocked was reachable by anyone holding the shared secret; the wishlist and orders
 * already refused it for that reason, and the cart and profile now do too. The cost is
 * that a shopper must sign in before their first cart write, which is deliberate.
 *
 * The caller credential is separate and still checked independently: X-Agent-Key proves
 * the request came from the integration, and neither credential substitutes for the
 * other.
 */

import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { agentKeyPresented, assertAgentKey, requireAgentKey } from "@/lib/api/agent"
import { ApiFailure, assertDatabaseConfigured } from "@/lib/api/http"

/**
 * Written for the agent, not for a developer reading docs.
 *
 * An LLM reads this and decides what to do next. "Requires authentication" reads as a
 * wall it cannot get past, and it hands off to a human — which on the integration side
 * silences the conversation for 24 hours. So it says, plainly, that this is recoverable
 * and exactly which two calls recover it.
 */
export const SIGN_IN_HINT =
  'This is expected and recoverable — do not hand off to a human. The shopper is not signed in yet, or their token expired. Sign them in: POST /api/auth/email-otp/send-verification-otp with {email, type:"sign-in"}, ask the shopper for the 6-digit code they receive, then POST /api/auth/sign-in/email-otp with {email, otp}. Take data.token from the response, retry this call with `Authorization: Bearer <token>` plus X-Agent-Key, and continue.'

export type Subject = {
  userId: string
  /** The account's own email. Contact details live on the customer profile. */
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
 * Validates an agent key if one is presented, so a bad key is a 401 rather than a quiet
 * fall-through to an anonymous session. Null here means an anonymous browser, which the
 * cart still serves through its cookie.
 */
export async function resolveSubject(): Promise<Subject | null> {
  await assertAgentKey()

  const user = await sessionUser()
  return user ? { userId: user.id, email: user.email } : null
}

/** The subject for a route that requires one. 401s when the caller is anonymous. */
export async function requireSubject(): Promise<Subject> {
  assertDatabaseConfigured()
  const subject = await resolveSubject()
  if (!subject) {
    throw new ApiFailure(401, "unauthorized", "This endpoint requires a signed-in shopper.", SIGN_IN_HINT)
  }
  return subject
}

/**
 * The subject for a shopper-scoped route: wishlist, orders, and the customer profile.
 *
 * Two independent checks, and both must pass — X-Agent-Key proves the caller is the
 * GLOWA integration, and the bearer token proves the shopper signed in. A valid token
 * with no agent key is rejected, and so is an agent key with no token.
 */
export async function requireSessionSubject(): Promise<Subject> {
  assertDatabaseConfigured()
  await requireAgentKey()

  const user = await sessionUser()
  if (!user) {
    throw new ApiFailure(401, "unauthorized", "This endpoint requires a signed-in shopper.", SIGN_IN_HINT)
  }
  return { userId: user.id, email: user.email }
}

/**
 * The subject for the cart, which serves agents and anonymous browsers alike.
 *
 * An agent call — anything presenting X-Agent-Key — must carry a bearer token, exactly
 * like the wishlist. There is no anonymous agent bag any more: without a ref there is
 * nothing to key one to, and inventing one would recreate the hole the ref left.
 *
 * A request with no agent key is a browser. Those keep the cartId cookie and the
 * anonymous bag, so returning null here is a valid answer rather than an error.
 */
export async function resolveCartSubject(): Promise<Subject | null> {
  if (await agentKeyPresented()) {
    assertDatabaseConfigured()
    await requireAgentKey()

    const user = await sessionUser()
    if (!user) {
      throw new ApiFailure(401, "unauthorized", "This endpoint requires a signed-in shopper.", SIGN_IN_HINT)
    }
    return { userId: user.id, email: user.email }
  }

  const user = await sessionUser()
  return user ? { userId: user.id, email: user.email } : null
}
