"use client"

import Image from "next/image"
import Link from "next/link"
import { Heart } from "lucide-react"
import type { Product } from "@/lib/shopify/types"
import { formatMoney, discountPercent } from "@/lib/utils/format"
import { useWishlist } from "@/components/wishlist/wishlist-provider"
import { cn } from "@/lib/utils"
import { productPath } from "@/lib/routes"

export function ProductCard({ product }: { product: Product }) {
  const { toggle, has } = useWishlist()
  const wished = has(product.handle)

  const price = product.priceRange.minVariantPrice
  const compareAt = product.compareAtPriceRange.minVariantPrice
  const hasDiscount = Number(compareAt.amount) > Number(price.amount)
  const percent = hasDiscount ? discountPercent(price.amount, compareAt.amount) : 0

  return (
    <div className="group relative flex flex-col">
      <Link
        href={productPath(product.handle)}
        className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-muted"
      >
        {product.featuredImage ? (
          <Image
            src={product.featuredImage.url || "/placeholder.svg"}
            alt={product.featuredImage.altText ?? product.title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No image
          </div>
        )}
        {hasDiscount && (
          <span className="absolute left-2 top-2 rounded bg-sale px-1.5 py-0.5 text-xs font-bold text-sale-foreground">
            -{percent}%
          </span>
        )}
      </Link>

      <button
        type="button"
        onClick={() => toggle(product.handle)}
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={wished}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur transition hover:bg-background"
      >
        <Heart
          className={cn("h-4 w-4", wished ? "fill-accent text-accent" : "text-foreground")}
        />
      </button>

      <div className="mt-2 flex flex-col gap-1">
        <Link
          href={productPath(product.handle)}
          className="line-clamp-2 text-sm leading-snug text-foreground hover:underline"
        >
          {product.title}
        </Link>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-sale">{formatMoney(price)}</span>
          {hasDiscount && (
            <span className="text-xs text-muted-foreground line-through">
              {formatMoney(compareAt)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
