"use client"

import { useRouter } from "next/navigation"
import type { Product } from "@/lib/shopify/types"
import { ProductGrid } from "@/components/product/product-grid"

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
]

export function CollectionView({
  title,
  count,
  products,
  activeSort,
  slug,
}: {
  title: string
  count: number
  products: Product[]
  activeSort: string
  slug: string
}) {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-extrabold">{title}</h1>
          <p className="text-sm text-muted-foreground">{count} items</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort by</span>
          <select
            value={activeSort}
            onChange={(e) => router.push(`/collections/${slug}?sort=${e.target.value}`)}
            className="rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-accent"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ProductGrid products={products} />
    </div>
  )
}
