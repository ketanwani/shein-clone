"use client"

import { createContext, useContext, useState, useTransition, type ReactNode } from "react"
import type { Cart } from "@/lib/shopify/types"
import {
  addToCartAction,
  updateCartLineAction,
  removeCartLineAction,
} from "@/app/actions/cart"

type CartContextValue = {
  cart: Cart | null
  isOpen: boolean
  isPending: boolean
  openCart: () => void
  closeCart: () => void
  addItem: (merchandiseId: string, quantity?: number) => void
  updateItem: (lineId: string, quantity: number) => void
  removeItem: (lineId: string) => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({
  children,
  initialCart,
}: {
  children: ReactNode
  initialCart: Cart | null
}) {
  const [cart, setCart] = useState<Cart | null>(initialCart)
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const openCart = () => setIsOpen(true)
  const closeCart = () => setIsOpen(false)

  const addItem = (merchandiseId: string, quantity = 1) => {
    setIsOpen(true)
    startTransition(async () => {
      const next = await addToCartAction(merchandiseId, quantity)
      setCart(next)
    })
  }

  const updateItem = (lineId: string, quantity: number) => {
    startTransition(async () => {
      const next = await updateCartLineAction(lineId, quantity)
      setCart(next)
    })
  }

  const removeItem = (lineId: string) => {
    startTransition(async () => {
      const next = await removeCartLineAction(lineId)
      setCart(next)
    })
  }

  return (
    <CartContext.Provider
      value={{ cart, isOpen, isPending, openCart, closeCart, addItem, updateItem, removeItem }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
