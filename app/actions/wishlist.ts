"use server"

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { resolveSubject } from "@/lib/api/subject"
import { wishlistItem } from "@/lib/db/schema"
import { getProduct } from "@/lib/shopify/products"
import type { Product } from "@/lib/shopify/types"

export async function getWishlistProducts(handles: string[]): Promise<Product[]> {
  if (handles.length === 0) return []
  const results = await Promise.all(handles.map((h) => getProduct(h)))
  return results.filter((p): p is Product => p !== null)
}

/** The agent's asserted shopper, or the signed-in user. Null when neither is present. */
async function getUserId() {
  const subject = await resolveSubject()
  return subject?.userId ?? null
}

/** Returns the server-side wishlist handles for the resolved user, or null if there is none. */
export async function getServerWishlist(): Promise<string[] | null> {
  const userId = await getUserId()
  if (!userId) return null
  const rows = await db
    .select({ handle: wishlistItem.productHandle })
    .from(wishlistItem)
    .where(eq(wishlistItem.userId, userId))
  return rows.map((r) => r.handle)
}

/**
 * Merges any guest (localStorage) handles into the user's DB wishlist on login,
 * then returns the full, de-duplicated server wishlist.
 */
export async function syncWishlist(guestHandles: string[]): Promise<string[] | null> {
  const userId = await getUserId()
  if (!userId) return null

  if (guestHandles.length > 0) {
    await db
      .insert(wishlistItem)
      .values(guestHandles.map((handle) => ({ userId, productHandle: handle })))
      .onConflictDoNothing()
  }

  return getServerWishlist() as Promise<string[]>
}

export async function addToServerWishlist(handle: string) {
  const userId = await getUserId()
  if (!userId) return
  await db.insert(wishlistItem).values({ userId, productHandle: handle }).onConflictDoNothing()
}

export async function removeFromServerWishlist(handle: string) {
  const userId = await getUserId()
  if (!userId) return
  await db
    .delete(wishlistItem)
    .where(and(eq(wishlistItem.userId, userId), eq(wishlistItem.productHandle, handle)))
}
