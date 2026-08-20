/**
 * The bag, addressed by account id.
 *
 * A plain module, not a `"use server"` one, and that distinction is the point: every
 * export from a server-action file is a callable endpoint, so a function taking a
 * userId there would let anyone name any shopper. These take a userId and are only
 * reachable from server code that has already decided whose bag it is entitled to touch.
 *
 * app/actions/cart.ts owns the cookie and session logic and calls into this; the
 * checkout-grant flow calls into it with the shopper the grant names.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { userCart } from "@/lib/db/schema"
import { createCart, getCart } from "@/lib/shopify/cart"
import type { Cart } from "@/lib/shopify/types"

export async function savedCartId(userId: string): Promise<string | null> {
  const [saved] = await db
    .select({ cartId: userCart.cartId })
    .from(userCart)
    .where(eq(userCart.userId, userId))
    .limit(1)
  return saved?.cartId ?? null
}

export async function rememberCart(userId: string, cartId: string) {
  await db
    .insert(userCart)
    .values({ userId, cartId })
    .onConflictDoUpdate({ target: userCart.userId, set: { cartId, updatedAt: new Date() } })
}

/** The account's bag id, creating one only when asked to. */
export async function cartIdForUser(userId: string, create: boolean): Promise<string | null> {
  const saved = await savedCartId(userId)
  if (saved) return saved
  if (!create) return null

  const cart = await createCart()
  await rememberCart(userId, cart.id)
  return cart.id
}

/**
 * The account's live bag.
 *
 * Live, not a snapshot: a checkout page opened from a link must show anything the
 * shopper added after the link was sent, or they lose items without being told.
 */
export async function getCartForUser(userId: string): Promise<Cart | null> {
  const cartId = await cartIdForUser(userId, false)
  if (!cartId) return null
  try {
    return await getCart(cartId)
  } catch {
    return null
  }
}

/** Drops the account's stored bag reference. The next add starts a fresh one. */
export async function clearCartForUser(userId: string) {
  await db.delete(userCart).where(eq(userCart.userId, userId))
}
