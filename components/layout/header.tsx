"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Search, Heart, ShoppingBag, User, Menu, X } from "lucide-react"
import { CATEGORIES } from "@/lib/categories"
import { useCart } from "@/components/cart/cart-provider"
import { CartDrawer } from "@/components/cart/cart-drawer"

type SessionUser = { name?: string | null } | null

export function Header({ user }: { user: SessionUser }) {
  const router = useRouter()
  const { cart, openCart } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState("")

  const count = cart?.totalQuantity ?? 0

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      {/* Promo bar */}
      <div className="bg-foreground py-1.5 text-center text-xs font-medium text-background">
        FREE SHIPPING ON ORDERS OVER $29 · NEW DROPS DAILY
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <button
          type="button"
          className="lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        <Link href="/" className="font-serif text-2xl font-extrabold tracking-tight">
          GLOWA
        </Link>

        <form onSubmit={onSearch} className="relative ml-auto hidden max-w-md flex-1 lg:block">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dresses, tops, shoes..."
            className="w-full rounded-full border border-border bg-muted py-2 pl-4 pr-10 text-sm outline-none focus:border-accent"
            aria-label="Search products"
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
        </form>

        <nav className="ml-auto flex items-center gap-3 lg:ml-0">
          <Link
            href={user ? "/account" : "/login"}
            className="flex items-center gap-1 text-sm hover:text-accent"
            aria-label={user ? "Account" : "Sign in"}
          >
            <User className="h-5 w-5" />
            <span className="hidden xl:inline">
              {user ? (user.name?.split(" ")[0] ?? "Account") : "Sign in"}
            </span>
          </Link>
          <Link href="/wishlist" className="hover:text-accent" aria-label="Wishlist">
            <Heart className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={openCart}
            className="relative hover:text-accent"
            aria-label={`Cart with ${count} items`}
          >
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-sale px-1 text-[10px] font-bold text-sale-foreground">
                {count}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Category nav */}
      <nav className="mx-auto hidden max-w-7xl items-center gap-5 overflow-x-auto px-4 pb-2 lg:flex">
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/collections/${c.slug}`}
            className={`whitespace-nowrap text-sm font-medium hover:text-accent ${
              c.slug === "sale" ? "text-sale" : "text-foreground"
            }`}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="font-serif text-xl font-extrabold">GLOWA</span>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={onSearch} className="relative mt-4">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-full border border-border bg-muted py-2 pl-4 pr-10 text-sm outline-none"
                aria-label="Search products"
              />
              <button type="submit" aria-label="Search" className="absolute right-3 top-1/2 -translate-y-1/2">
                <Search className="h-4 w-4 text-muted-foreground" />
              </button>
            </form>
            <div className="mt-4 flex flex-col">
              {CATEGORIES.map((c) => (
                <Link
                  key={c.slug}
                  href={`/collections/${c.slug}`}
                  onClick={() => setMobileOpen(false)}
                  className={`border-b border-border py-3 text-sm font-medium ${
                    c.slug === "sale" ? "text-sale" : ""
                  }`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <CartDrawer />
    </header>
  )
}
