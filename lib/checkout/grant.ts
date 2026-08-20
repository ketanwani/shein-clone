/**
 * One-time checkout links.
 *
 * The agent used to complete checkout by calling POST /api/orders with a card number in
 * the body, which meant asking the shopper to type card details into an Instagram DM.
 * Those transcripts are persisted and logged. Instead the agent hands over a link, the
 * shopper pays on our page, and the agent reads the order back afterwards. The agent
 * never sees the card or the address.
 *
 * ─── What a grant is, and is not ────────────────────────────────────────────────────
 *
 * It authorises a checkout, not a login. Holding one lets you read that shopper's bag,
 * read and write their address book, and place one order. It does not reach order
 * history, the wishlist, the profile, or any account page, and it is not a Better Auth
 * session.
 *
 * That line matters because anyone holding the agent key can mint a link for any email
 * address. If the link logged you in, the key would be an account-takeover primitive.
 * Scoped this way, the worst it can do is buy something and ship it to an address the
 * holder supplies — bad, but bounded, and visible in the order history afterwards.
 *
 * Enforcement is structural rather than by convention: the cookie is written with
 * `path=/checkout`, so the browser never attaches it to /api/* at all, and nothing in
 * lib/api/subject.ts reads it.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { and, eq, gt, isNull, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { checkoutGrant } from "@/lib/db/schema"

/** How long the link in the chat stays tappable. */
export const LINK_TTL_MS = 10 * 60 * 1000

/** How long the shopper then has to fill the form, counted from first use. */
export const SESSION_TTL_MS = 30 * 60 * 1000

export const CHECKOUT_COOKIE = "glowa_checkout"

/**
 * Scoped to the checkout page. The browser will not send it to /api/*, so a grant
 * cannot reach the order history or the wishlist even if something there forgot to
 * check.
 */
export const CHECKOUT_COOKIE_PATH = "/checkout"

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

/** Constant time over fixed-length hex digests, so no timing signal about the token. */
function hashesMatch(a: string, b: string) {
  const left = Buffer.from(a, "hex")
  const right = Buffer.from(b, "hex")
  return left.length === right.length && timingSafeEqual(left, right)
}

export type Grant = {
  id: string
  userId: string
  expiresAt: Date
  sessionExpiresAt: Date | null
  consumedAt: Date | null
}

/**
 * Creates a grant and returns the raw token exactly once.
 *
 * 32 bytes from the CSPRNG, base64url. Only the digest is stored, so the token cannot
 * be recovered from the database — losing it means minting a new link, which is the
 * behaviour we want.
 */
export async function mintGrant(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + LINK_TTL_MS)

  await db.insert(checkoutGrant).values({
    id: `cg_${randomBytes(12).toString("hex")}`,
    userId,
    tokenHash: sha256(token),
    expiresAt,
  })

  return { token, expiresAt }
}

/**
 * How many of this shopper's links are still outstanding — minted, not yet spent, not
 * yet expired.
 *
 * This is the quantity worth limiting. Counting mints per window punishes a shopper who
 * keeps buying, because every order needs its own single-use link and a chat that is
 * going well burns through them fastest. Counting *unused* links targets the thing
 * actually being abused: handing out links nobody asked for.
 *
 * A grant lives by its link TTL until someone opens it, and by the session clock after
 * that, so both are checked.
 */
export async function countLiveGrants(userId: string): Promise<number> {
  const now = new Date()
  return db.$count(
    checkoutGrant,
    and(
      eq(checkoutGrant.userId, userId),
      isNull(checkoutGrant.consumedAt),
      or(
        and(isNull(checkoutGrant.sessionExpiresAt), gt(checkoutGrant.expiresAt, now)),
        gt(checkoutGrant.sessionExpiresAt, now),
      ),
    ),
  )
}

/** Rows are matched by digest; the raw token never reaches a query. */
async function findByToken(token: string): Promise<Grant | null> {
  const digest = sha256(token)
  const [row] = await db
    .select({
      id: checkoutGrant.id,
      userId: checkoutGrant.userId,
      tokenHash: checkoutGrant.tokenHash,
      expiresAt: checkoutGrant.expiresAt,
      sessionExpiresAt: checkoutGrant.sessionExpiresAt,
      consumedAt: checkoutGrant.consumedAt,
    })
    .from(checkoutGrant)
    .where(eq(checkoutGrant.tokenHash, digest))
    .limit(1)

  // The index lookup already matched, so this is belt and braces — but it keeps the
  // comparison constant time regardless of how the row was found.
  if (!row || !hashesMatch(row.tokenHash, digest)) return null
  return row
}

export type GrantCheck =
  | { ok: true; grant: Grant }
  | { ok: false; reason: "unknown" | "expired" | "consumed" }

/**
 * Validates a token arriving as a link.
 *
 * Reusable within its TTL on purpose. Instagram fetches links to build preview cards,
 * so a token consumed on first GET would be burnt by the unfurl bot before the shopper
 * ever tapped it — which presents as a link that is randomly already dead. A grant ends
 * when an order is placed against it, or when it expires, and not before.
 */
export async function checkLinkToken(token: string): Promise<GrantCheck> {
  const grant = await findByToken(token)
  if (!grant) return { ok: false, reason: "unknown" }
  if (grant.consumedAt) return { ok: false, reason: "consumed" }
  if (grant.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" }
  return { ok: true, grant }
}

/**
 * Validates the cookie set after the link was followed.
 *
 * The session clock starts on first use rather than at mint, so the ten minutes the
 * shopper had to notice the DM is not also the time they get to type an address.
 */
export async function checkCheckoutSession(token: string): Promise<GrantCheck> {
  const grant = await findByToken(token)
  if (!grant) return { ok: false, reason: "unknown" }
  if (grant.consumedAt) return { ok: false, reason: "consumed" }

  if (!grant.sessionExpiresAt) {
    // First use. The link must still be within its own TTL to start a session.
    if (grant.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" }
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS)
    await db
      .update(checkoutGrant)
      .set({ sessionExpiresAt })
      .where(and(eq(checkoutGrant.id, grant.id), isNull(checkoutGrant.sessionExpiresAt)))
    return { ok: true, grant: { ...grant, sessionExpiresAt } }
  }

  if (grant.sessionExpiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" }
  return { ok: true, grant }
}

/**
 * Ends the grant, recording the order it bought.
 *
 * Conditional on consumedAt still being null, so two submits racing cannot both claim
 * the same grant — the loser sees a consumed grant and stops.
 */
export async function consumeGrant(grantId: string, orderId: number | null): Promise<boolean> {
  const updated = await db
    .update(checkoutGrant)
    .set({ consumedAt: new Date(), orderId })
    .where(and(eq(checkoutGrant.id, grantId), isNull(checkoutGrant.consumedAt)))
    .returning({ id: checkoutGrant.id })

  return updated.length > 0
}

/**
 * The grant behind a receipt page, after it has been spent.
 *
 * checkCheckoutSession deliberately refuses a consumed grant, but the shopper still has
 * to see the confirmation for the order it just bought. This returns a spent grant and
 * the order it paid for, and nothing else — so the cookie can show exactly one receipt
 * and cannot be turned into a view of the account's order history.
 */
export async function grantReceipt(token: string): Promise<{ userId: string; orderId: number } | null> {
  const digest = sha256(token)
  const [row] = await db
    .select({
      userId: checkoutGrant.userId,
      tokenHash: checkoutGrant.tokenHash,
      orderId: checkoutGrant.orderId,
    })
    .from(checkoutGrant)
    .where(eq(checkoutGrant.tokenHash, digest))
    .limit(1)

  if (!row || !hashesMatch(row.tokenHash, digest) || row.orderId === null) return null
  return { userId: row.userId, orderId: row.orderId }
}
