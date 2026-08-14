"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import {
  addToServerWishlist,
  removeFromServerWishlist,
  syncWishlist,
} from "@/app/actions/wishlist"

type WishlistContextValue = {
  items: string[]
  has: (handle: string) => boolean
  toggle: (handle: string) => void
  count: number
}

const WishlistContext = createContext<WishlistContextValue | null>(null)
const STORAGE_KEY = "glowa_wishlist"

export function WishlistProvider({
  children,
  isLoggedIn,
}: {
  children: ReactNode
  isLoggedIn: boolean
}) {
  const [items, setItems] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)
  const syncedRef = useRef(false)

  // Load local items on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setItems(JSON.parse(raw))
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  // When logged in, merge guest items into the server wishlist once, then adopt it.
  useEffect(() => {
    if (!hydrated || !isLoggedIn || syncedRef.current) return
    syncedRef.current = true
    let guest: string[] = []
    try {
      guest = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    } catch {
      // ignore
    }
    syncWishlist(guest).then((server) => {
      if (server) setItems(server)
    })
  }, [hydrated, isLoggedIn])

  // Persist to localStorage as a mirror / guest store.
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // ignore
    }
  }, [items, hydrated])

  const has = (handle: string) => items.includes(handle)

  const toggle = (handle: string) => {
    setItems((prev) => {
      const exists = prev.includes(handle)
      if (isLoggedIn) {
        if (exists) removeFromServerWishlist(handle)
        else addToServerWishlist(handle)
      }
      return exists ? prev.filter((h) => h !== handle) : [...prev, handle]
    })
  }

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
