/**
 * Handing a customer ref's shopper over to the account they signed in as.
 *
 * The agent fills a bag and saves an address long before anyone signs in — that is the
 * point of X-Customer-Ref, and it is why the bag works with no cookie jar. But checkout
 * needs a bearer token, and the token names a different row: a real account, not the
 * synthetic shopper the ref provisioned. Without a handover the agent builds a bag under
 * one identity and tries to buy it under another, and finds it empty.
 *
 * So the first authenticated call carrying a ref adopts it. Everything keyed by the
 * synthetic shopper moves to the account, and the ref is marked as belonging to that
 * account from then on.
 *
 * The mark is what makes this safe to do automatically. Adoption happens once and is
 * exclusive: a ref already linked to one account, presented with another account's
 * token, is a conflict. Answering it by quietly preferring one credential would mean the
 * agent could not tell which shopper it was talking to, which is the one thing this
 * surface cannot get wrong.
 */

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  agentCustomer,
  customerAddress,
  order,
  orderIdempotency,
  userCart,
  wishlistItem,
} from "@/lib/db/schema"
import { ApiFailure } from "@/lib/api/failure"

export class CustomerRefConflict extends ApiFailure {
  constructor() {
    super(
      409,
      "customer_ref_mismatch",
      "This X-Customer-Ref belongs to a different shopper than the bearer token.",
      "The ref was already handed over to another account. Send the token for that shopper, or start a new conversation with a fresh X-Customer-Ref. Do not retry with the same pair.",
    )
  }
}

/**
 * Reconciles a presented ref against the signed-in account.
 *
 * Returns silently when there is nothing to do — no ref, a ref nobody has used yet, or a
 * ref already linked to this same account. Throws CustomerRefConflict when the ref
 * belongs to someone else.
 *
 * Safe to call more than once per request: after the first call the ref is linked, and
 * every later call takes the short path.
 */
export async function reconcileCustomerRef(customerRef: string | null, accountUserId: string): Promise<void> {
  if (!customerRef) return

  const [row] = await db
    .select({ userId: agentCustomer.userId, linkedUserId: agentCustomer.linkedUserId })
    .from(agentCustomer)
    .where(eq(agentCustomer.customerRef, customerRef))
    .limit(1)

  // A ref nobody has used yet owns nothing, so there is nothing to adopt and nothing it
  // could conflict with. The token alone identifies the caller.
  if (!row) return

  if (row.linkedUserId) {
    if (row.linkedUserId !== accountUserId) throw new CustomerRefConflict()
    return
  }

  // The synthetic shopper and the account are the same person as of now.
  if (row.userId !== accountUserId) await moveEverything(row.userId, accountUserId)

  await db
    .update(agentCustomer)
    .set({ linkedUserId: accountUserId, updatedAt: new Date() })
    .where(and(eq(agentCustomer.customerRef, customerRef), eq(agentCustomer.userId, row.userId)))
}

/**
 * Re-keys every row the synthetic shopper owns onto the account.
 *
 * One transaction, because a half-moved shopper is worse than an unmoved one: an address
 * that arrived without its bag would have the agent checking out against a bag that no
 * longer exists.
 */
async function moveEverything(fromUserId: string, toUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // The bag. An account that already has one keeps it, matching how a signed-in
    // browser treats its own saved bag as more authoritative than a stray cookie.
    const [accountCart] = await tx
      .select({ cartId: userCart.cartId })
      .from(userCart)
      .where(eq(userCart.userId, toUserId))
      .limit(1)

    if (accountCart) {
      await tx.delete(userCart).where(eq(userCart.userId, fromUserId))
    } else {
      await tx.update(userCart).set({ userId: toUserId, updatedAt: new Date() }).where(eq(userCart.userId, fromUserId))
    }

    // Addresses. An account with a default of its own keeps it, so the shopper does not
    // silently start shipping somewhere else.
    const existingAddresses = await tx
      .select({ id: customerAddress.id })
      .from(customerAddress)
      .where(eq(customerAddress.userId, toUserId))

    await tx
      .update(customerAddress)
      .set({ userId: toUserId, ...(existingAddresses.length > 0 ? { isDefault: false } : {}) })
      .where(eq(customerAddress.userId, fromUserId))

    // Saved items. The unique index on (userId, productHandle) means a handle the
    // account already has would collide, so drop those first and move the rest.
    const accountHandles = await tx
      .select({ handle: wishlistItem.productHandle })
      .from(wishlistItem)
      .where(eq(wishlistItem.userId, toUserId))

    if (accountHandles.length > 0) {
      await tx.delete(wishlistItem).where(
        and(
          eq(wishlistItem.userId, fromUserId),
          inArray(
            wishlistItem.productHandle,
            accountHandles.map((r) => r.handle),
          ),
        ),
      )
    }
    await tx.update(wishlistItem).set({ userId: toUserId }).where(eq(wishlistItem.userId, fromUserId))

    // Order history, and the idempotency keys that protect it, so a retry spanning the
    // handover still replays rather than buying twice.
    await tx.update(order).set({ userId: toUserId }).where(eq(order.userId, fromUserId))
    await tx.update(orderIdempotency).set({ userId: toUserId }).where(eq(orderIdempotency.userId, fromUserId))
  })
}
