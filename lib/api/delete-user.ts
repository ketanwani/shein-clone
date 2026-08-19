/**
 * Erasing a test shopper, for a demo deployment.
 *
 * Nothing in the product needs this. It exists so a tester can re-run the sign-up and
 * checkout flow against the same address without accumulating state, and it is gated
 * accordingly — see app/api/admin/users/route.ts for the three checks in front of it.
 *
 * The delete is total: every row keyed to the account, plus any OTP still pending
 * against the address, so the next sign-in starts from nothing. It runs in one
 * transaction, because a half-deleted shopper — orders gone, addresses left behind —
 * is a worse state to debug than either end.
 */

import { and, eq, inArray, like } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customerAddress,
  customerProfile,
  order,
  orderIdempotency,
  orderItem,
  user,
  userCart,
  verification,
  wishlistItem,
} from "@/lib/db/schema"

export type DeletionCounts = Record<string, number>

export type DeletionResult = {
  deleted: boolean
  email: string
  userId: string | null
  counts: DeletionCounts
  dryRun: boolean
}

/**
 * Removes the account behind an address and everything it owns.
 *
 * `session` and `account` carry ON DELETE CASCADE, so dropping the user row takes them.
 * Every other table stores userId as plain text and has to be cleared explicitly —
 * which is exactly the kind of thing that rots, so the list lives here rather than
 * being spread across callers.
 */
export async function deleteUserByEmail(rawEmail: string, dryRun: boolean): Promise<DeletionResult> {
  const email = rawEmail.trim().toLowerCase()

  const [found] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)

  if (!found) {
    // Still clear any pending code, so a mistyped test address cannot leave one behind.
    const otps = await clearPendingOtps(email, dryRun)
    return { deleted: false, email, userId: null, counts: { verification: otps }, dryRun }
  }

  const userId = found.id
  const counts: DeletionCounts = {}

  const orderIds = (
    await db.select({ id: order.id }).from(order).where(eq(order.userId, userId))
  ).map((r) => r.id)

  if (dryRun) {
    counts.order_item =
      orderIds.length === 0 ? 0 : await db.$count(orderItem, inArray(orderItem.orderId, orderIds))
    counts.order = orderIds.length
    counts.order_idempotency = await db.$count(orderIdempotency, eq(orderIdempotency.userId, userId))
    counts.wishlist_item = await db.$count(wishlistItem, eq(wishlistItem.userId, userId))
    counts.customer_address = await db.$count(customerAddress, eq(customerAddress.userId, userId))
    counts.customer_profile = await db.$count(customerProfile, eq(customerProfile.userId, userId))
    counts.user_cart = await db.$count(userCart, eq(userCart.userId, userId))
    counts.verification = await countPendingOtps(email)
    counts.user = 1
    return { deleted: false, email, userId, counts, dryRun }
  }

  await db.transaction(async (tx) => {
    // Line items first: they hang off orderId, so deleting the orders first would leave
    // them orphaned with nothing left to find them by.
    counts.order_item =
      orderIds.length === 0
        ? 0
        : (await tx.delete(orderItem).where(inArray(orderItem.orderId, orderIds))).rowCount ?? 0

    counts.order = (await tx.delete(order).where(eq(order.userId, userId))).rowCount ?? 0
    counts.order_idempotency =
      (await tx.delete(orderIdempotency).where(eq(orderIdempotency.userId, userId))).rowCount ?? 0
    counts.wishlist_item = (await tx.delete(wishlistItem).where(eq(wishlistItem.userId, userId))).rowCount ?? 0
    counts.customer_address =
      (await tx.delete(customerAddress).where(eq(customerAddress.userId, userId))).rowCount ?? 0
    counts.customer_profile =
      (await tx.delete(customerProfile).where(eq(customerProfile.userId, userId))).rowCount ?? 0
    counts.user_cart = (await tx.delete(userCart).where(eq(userCart.userId, userId))).rowCount ?? 0

    counts.verification = (await tx.delete(verification).where(pendingOtpFilter(email))).rowCount ?? 0

    // Last, and it cascades to session and account.
    counts.user = (await tx.delete(user).where(eq(user.id, userId))).rowCount ?? 0
  })

  return { deleted: true, email, userId, counts, dryRun }
}

/**
 * Better Auth stores a pending code under `<type>-otp-<email>`, so an address can have
 * one per flow. Matching on the suffix clears them all without needing to know the set.
 */
function pendingOtpFilter(email: string) {
  return and(like(verification.identifier, `%-otp-${email}`))
}

async function countPendingOtps(email: string) {
  return db.$count(verification, pendingOtpFilter(email))
}

async function clearPendingOtps(email: string, dryRun: boolean) {
  if (dryRun) return countPendingOtps(email)
  return (await db.delete(verification).where(pendingOtpFilter(email))).rowCount ?? 0
}
