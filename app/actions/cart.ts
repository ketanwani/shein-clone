"use server"

import { cookies } from "next/headers"
import { resolveSubject } from "@/lib/api/subject"
import { clearCartForUser, rememberCart, savedCartId } from "@/lib/cart/store"
import { createCart, getCart, addToCart, updateCart, removeFromCart } from "@/lib/shopify/cart"
import type { Cart } from "@/lib/shopify/types"

const CART_COOKIE = "cartId"

function writeCartCookie(store: Awaited<ReturnType<typeof cookies>>, cartId: string) {
  store.set(CART_COOKIE, cartId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
}

/**
 * Finds the caller's bag. Two ways in, one shared store (the user_cart table):
 *
 * Signed in, by bearer token or cookie: keyed by the account. This is the only path an
 * agent has — there is no ref to key an anonymous agent bag to any more, and the route
 * turns an agent call without a token away before it reaches here.
 *
 * Anonymous browser: the cartId cookie, exactly as before. A bag started that way is
 * adopted by the account on the first authenticated call, so signing in mid-shop loses
 * nothing.
 */
async function resolveCartId(create: boolean): Promise<string | null> {
  const subject = await resolveSubject()

  const store = await cookies()
  const cookieCartId = store.get(CART_COOKIE)?.value ?? null

  if (subject) {
    const saved = await savedCartId(subject.userId)
    if (saved) return saved

    if (cookieCartId) {
      await rememberCart(subject.userId, cookieCartId)
      return cookieCartId
    }

    if (!create) return null
    const cart = await createCart()
    await rememberCart(subject.userId, cart.id)
    writeCartCookie(store, cart.id)
    return cart.id
  }

  if (cookieCartId) return cookieCartId
  if (!create) return null

  const cart = await createCart()
  writeCartCookie(store, cart.id)
  return cart.id
}

export async function getCartAction(): Promise<Cart | null> {
  const cartId = await resolveCartId(false)
  if (!cartId) return null
  try {
    return await getCart(cartId)
  } catch {
    return null
  }
}

export async function addToCartAction(merchandiseId: string, quantity = 1): Promise<Cart> {
  const cartId = await resolveCartId(true)
  return addToCart(cartId!, [{ merchandiseId, quantity }])
}

export async function updateCartLineAction(lineId: string, quantity: number): Promise<Cart> {
  const cartId = await resolveCartId(true)
  if (quantity <= 0) {
    return removeFromCart(cartId!, [lineId])
  }
  return updateCart(cartId!, [{ id: lineId, quantity }])
}

export async function removeCartLineAction(lineId: string): Promise<Cart> {
  const cartId = await resolveCartId(true)
  return removeFromCart(cartId!, [lineId])
}

export async function clearCartAction(): Promise<void> {
  const subject = await resolveSubject()

  // Harmless for an agent, which has no cookie jar to clear; dropping the stored
  // reference below is what actually abandons its bag.
  const store = await cookies()
  store.delete(CART_COOKIE)

  if (subject) await clearCartForUser(subject.userId)
}
