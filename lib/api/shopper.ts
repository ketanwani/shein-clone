/**
 * Naming a shopper with an email header, for the demo.
 *
 * The bearer token from the email-OTP flow is still the right answer and is still here:
 * the shopper proves the address is theirs, and nothing but that token can act for them.
 * Two gaps in the Instagram agent runtime make it unusable for now — the bundle does not
 * install the hook that injects the token into outbound calls, and a new session is
 * opened per tool call, so a token captured at sign-in is written somewhere no later
 * call reads. Both are owned by other teams and neither lands in time.
 *
 * What is left is an identity that carries no server-side state between calls at all:
 * the caller names the shopper on every request, in a header.
 *
 * ─── This is a real security regression, and it is deliberate ───────────────────────
 *
 * X-Shopper-Email is asserted by the caller, exactly as X-Customer-Ref was. Anyone
 * holding X-Agent-Key can read or modify any shopper's bag, wishlist, profile and order
 * history by naming their address. That is precisely the property the ref was removed
 * for. It is accepted here because this deployment carries mock products and simulated
 * payments and no real shopper data, and it is gated behind ALLOW_SHOPPER_EMAIL_HEADER
 * so it cannot be on by accident. Switch back to the token when the runtime supports it.
 */

import { randomUUID } from "node:crypto"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"

const SHOPPER_EMAIL_HEADER = "x-shopper-email"

/**
 * Off unless explicitly enabled, matching DEMO_OTP_CODE and ALLOW_USER_DELETE.
 *
 * With it unset the header is not read at all, so a deployment that has not opted in
 * behaves exactly as it did before: bearer token or nothing.
 */
export function shopperEmailHeaderEnabled(): boolean {
  return Boolean(process.env.ALLOW_SHOPPER_EMAIL_HEADER?.trim())
}

if (shopperEmailHeaderEnabled()) {
  console.warn(
    "[shopper] ALLOW_SHOPPER_EMAIL_HEADER is set — X-Shopper-Email names the shopper. " +
      "Anyone holding X-Agent-Key can act as any address. Demo deployments only.",
  )
}

/** Deliberately permissive: enough to reject a header that is plainly not an address. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The address this request names, normalised, or null.
 *
 * Trimmed and lowercased so `Ada@Example.com` and `ada@example.com` are one shopper.
 * Without that, casing alone would silently split someone's bag from their order
 * history, and the caller has no reason to be consistent about it.
 */
export async function presentedShopperEmail(): Promise<string | null> {
  if (!shopperEmailHeaderEnabled()) return null
  const raw = (await headers()).get(SHOPPER_EMAIL_HEADER)?.trim().toLowerCase()
  if (!raw || !LOOKS_LIKE_EMAIL.test(raw)) return null
  return raw
}

/**
 * Finds or creates the account behind an address.
 *
 * The row is a real user, keyed on the same unique email column the OTP flow uses, so a
 * shopper provisioned this way and one who later signs in properly converge on a single
 * account rather than ending up with two. emailVerified stays false, because nothing
 * here proves the address belongs to whoever named it — which is the whole caveat.
 */
export async function provisionShopper(email: string): Promise<string> {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
  if (existing) return existing.id

  const id = `shopper_${randomUUID()}`
  await db
    .insert(user)
    .values({ id, name: "", email, emailVerified: false })
    .onConflictDoNothing({ target: user.email })

  // Two first calls for the same address can race; whichever insert landed is the winner.
  const [settled] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
  return settled?.id ?? id
}

/** The shopper this request names, provisioned on first sight. Null when none is named. */
export async function resolveShopperByEmail(): Promise<{ userId: string; email: string } | null> {
  const email = await presentedShopperEmail()
  if (!email) return null
  return { userId: await provisionShopper(email), email }
}
