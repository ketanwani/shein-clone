/**
 * Who a request acts for.
 *
 * Two answers, tried in that order:
 *
 *   session          a bearer token from the email-OTP flow, or a browser cookie
 *   X-Shopper-Email  the address the caller names, provisioned on first sight
 *
 * The session wins whenever there is one. It is the stronger claim — the shopper proved
 * the address is theirs — so the website's logged-in flows are unaffected by any header
 * an agent might also send, and switching back to token-only identity later is a matter
 * of turning the header off.
 *
 * The header exists because the Instagram agent runtime cannot currently carry a token
 * between calls; see lib/api/shopper.ts for why, and for the security it costs.
 *
 * X-Agent-Key is separate from both and still required on every shopper-scoped route.
 * It proves the caller, never the shopper, and neither substitutes for the other.
 */

import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { agentKeyPresented, assertAgentKey, requireAgentKey } from "@/lib/api/agent"
import { resolveShopperByEmail, shopperEmailHeaderEnabled } from "@/lib/api/shopper"
import { ApiFailure, assertDatabaseConfigured } from "@/lib/api/http"

/**
 * Written for the agent, not for a developer reading docs.
 *
 * An LLM reads this and decides what to do next. "Requires authentication" reads as a
 * wall it cannot get past, and it hands off to a human — which on the integration side
 * silences the conversation for 24 hours. So it says plainly that this is recoverable,
 * and names the one header that fixes it.
 */
export const NO_SHOPPER_HINT =
  "This is expected and recoverable — do not hand off to a human. No shopper was named. Send X-Shopper-Email with the shopper's email address (the same value on every call for that shopper), alongside X-Agent-Key, and retry. Alternatively, if you hold a session token from POST /api/auth/sign-in/email-otp, send it as `Authorization: Bearer <token>` instead."

/** Same situation, worded for a deployment where the email header is switched off. */
const TOKEN_ONLY_HINT =
  "This is expected and recoverable — do not hand off to a human. The shopper is not signed in yet, or their token expired. Sign them in: POST /api/auth/email-otp/send-verification-otp with {email, type:\"sign-in\"}, ask the shopper for the 6-digit code they receive, then POST /api/auth/sign-in/email-otp with {email, otp}. Take data.token from the response, retry this call with `Authorization: Bearer <token>` plus X-Agent-Key, and continue."

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

/** 400 rather than 401: nothing was rejected, the request simply named nobody. */
function noShopperNamed() {
  return new ApiFailure(
    400,
    "bad_request",
    shopperEmailHeaderEnabled()
      ? "No shopper identified. Send X-Shopper-Email, or a bearer token."
      : "No shopper identified. Send a bearer token.",
    shopperEmailHeaderEnabled() ? NO_SHOPPER_HINT : TOKEN_ONLY_HINT,
  )
}

/**
 * Resolves the subject, or null when nobody is named.
 *
 * Validates an agent key if one is presented, so a bad key is a 401 rather than a quiet
 * fall-through. Null here means an anonymous browser, which the cart still serves
 * through its cookie.
 */
export async function resolveSubject(): Promise<Subject | null> {
  await assertAgentKey()

  const user = await sessionUser()
  if (user) return { userId: user.id, email: user.email }

  return resolveShopperByEmail()
}

/** The subject for a route that requires one. */
export async function requireSubject(): Promise<Subject> {
  assertDatabaseConfigured()
  const subject = await resolveSubject()
  if (!subject) throw noShopperNamed()
  return subject
}

/**
 * The subject for a shopper-scoped route: wishlist, orders, and the customer profile.
 *
 * X-Agent-Key proves the caller and is always required. The shopper comes from a session
 * if there is one, otherwise from X-Shopper-Email. A request with neither names nobody,
 * which is a 400 naming both options rather than a 401 — there is no credential to
 * reject, only a missing one to supply.
 */
export async function requireShopperSubject(): Promise<Subject> {
  assertDatabaseConfigured()
  await requireAgentKey()

  const user = await sessionUser()
  if (user) return { userId: user.id, email: user.email }

  const named = await resolveShopperByEmail()
  if (named) return named

  throw noShopperNamed()
}

/**
 * The subject for the cart, which serves agents and anonymous browsers alike.
 *
 * An agent call — anything presenting X-Agent-Key — must name a shopper, exactly like
 * the wishlist. A request with no agent key is a browser, which keeps the cartId cookie
 * and the anonymous bag, so returning null here is a valid answer rather than an error.
 */
export async function resolveCartSubject(): Promise<Subject | null> {
  if (await agentKeyPresented()) return requireShopperSubject()

  const user = await sessionUser()
  return user ? { userId: user.id, email: user.email } : null
}
