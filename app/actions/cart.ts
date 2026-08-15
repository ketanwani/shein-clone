"use server"

import { cookies } from "next/headers"
import { createCart, getCart, addToCart, updateCart, removeFromCart } from "@/lib/shopify/cart"
import type { Cart } from "@/lib/shopify/types"

const CART_COOKIE = "cartId"

async function resolveCartId(create: boolean): Promise<string | null> {
  const store = await cookies()
  let cartId = store.get(CART_COOKIE)?.value ?? null

  if (!cartId && create) {
    const cart = await createCart()
    cartId = cart.id
    store.set(CART_COOKIE, cartId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
  }

  return cartId
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
  const store = await cookies()
  store.delete(CART_COOKIE)
}
