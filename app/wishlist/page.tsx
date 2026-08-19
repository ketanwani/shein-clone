"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Heart } from "lucide-react"
import { useWishlist } from "@/components/wishlist/wishlist-provider"
import { getWishlistProducts } from "@/app/actions/wishlist"
import { ProductGrid } from "@/components/product/product-grid"
import type { Product } from "@/lib/shopify/types"
import { collectionPath } from "@/lib/routes"

export default function WishlistPage() {
  const { items } = useWishlist()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    getWishlistProducts(items).then((res) => {
      if (active) {
        setProducts(res)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [items])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 flex items-center gap-2 font-serif text-3xl font-extrabold">
        <Heart className="h-7 w-7 fill-accent text-accent" />
        My Wishlist
      </h1>

      {loading ? (
        <p className="py-16 text-center text-muted-foreground">Loading your favorites...</p>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Heart className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Your wishlist is empty.</p>
          <Link
            href={collectionPath("new-in")}
            className="mt-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground"
          >
            Discover Styles
          </Link>
        </div>
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  )
}
