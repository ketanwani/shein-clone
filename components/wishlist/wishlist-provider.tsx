"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type WishlistContextValue = {
  items: string[]
  has: (handle: string) => boolean
  toggle: (handle: string) => void
  count: number
}

const WishlistContext = createContext<WishlistContextValue | null>(null)
const STORAGE_KEY = "glowa_wishlist"

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setItems(JSON.parse(raw))
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // ignore
    }
  }, [items, hydrated])

  const has = (handle: string) => items.includes(handle)
  const toggle = (handle: string) =>
    setItems((prev) => (prev.includes(handle) ? prev.filter((h) => h !== handle) : [...prev, handle]))

  return (
    <WishlistContext.Provider value={{ items, has, toggle, count: items.length }}>
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider")
  return ctx
}
