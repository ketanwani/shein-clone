import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { userCart } from "@/lib/db/schema"
import { createCart, getCart } from "@/lib/shopify/cart"
import type { Cart } from "@/lib/shopify/types"

/**
 * Resolves the Shopify cart id for a user, persisting the mapping in `user_cart`.
 * When `create` is true a new Shopify cart is created if the user has none (or
 * their stored cart has expired on Shopify's side).
 */
export async function resolveUserCartId(userId: string, create: boolean): Promise<string | null> {
  const [row] = await db
    .select({ cartId: userCart.cartId })
    .from(userCart)
    .where(eq(userCart.userId, userId))
    .limit(1)

  if (row?.cartId) {
    // Confirm the cart still exists on Shopify; if not, fall through to recreate.
    const existing = await getCart(row.cartId).catch(() => null)
    if (existing) return row.cartId
  }

  if (!create) return null

  const cart = await createCart()
  await db
    .insert(userCart)
    .values({ userId, cartId: cart.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: userCart.userId, set: { cartId: cart.id, updatedAt: new Date() } })
  return cart.id
}

/** Returns the user's current cart, or null if they have no active cart. */
export async function getUserCart(userId: string): Promise<Cart | null> {
  const cartId = await resolveUserCartId(userId, false)
  if (!cartId) return null
  return getCart(cartId)
}

/** Clears the stored cart mapping for a user (e.g. after checkout). */
export async function clearUserCart(userId: string): Promise<void> {
  await db.delete(userCart).where(eq(userCart.userId, userId))
}
