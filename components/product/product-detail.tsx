"use client"

import { useState } from "react"
import Image from "next/image"
import { Heart, Minus, Plus, Check, Truck, RotateCcw, ShieldCheck } from "lucide-react"
import type { Product, ProductVariant } from "@/lib/shopify/types"
import { formatMoney, discountPercent } from "@/lib/utils/format"
import { useCart } from "@/components/cart/cart-provider"
import { useWishlist } from "@/components/wishlist/wishlist-provider"
import { cn } from "@/lib/utils"

function findVariant(product: Product, selected: Record<string, string>): ProductVariant | undefined {
  return product.variants.find((v) =>
    v.selectedOptions.every((o) => selected[o.name] === o.value),
  )
}

export function ProductDetail({ product }: { product: Product }) {
  const { addItem, isPending } = useCart()
  const { toggle, has } = useWishlist()
  const wished = has(product.handle)

  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const opt of product.options) {
      if (opt.values.length === 1) initial[opt.name] = opt.values[0]
    }
    return initial
  })
  const [quantity, setQuantity] = useState(1)
  const [activeImage, setActiveImage] = useState(0)

  const allSelected = product.options.every((o) => selected[o.name])
  const variant = allSelected ? findVariant(product, selected) : undefined
  const displayVariant = variant ?? product.variants[0]

  const price = displayVariant?.price ?? product.priceRange.minVariantPrice
  const compareAt = displayVariant?.compareAtPrice ?? product.compareAtPriceRange.minVariantPrice
  const hasDiscount = compareAt && Number(compareAt.amount) > Number(price.amount)
  const percent = hasDiscount ? discountPercent(price.amount, compareAt.amount) : 0

  const images = product.images.length > 0 ? product.images : product.featuredImage ? [product.featuredImage] : []
  const soldOut = displayVariant ? !displayVariant.availableForSale : !product.availableForSale

  function handleAdd() {
    if (!variant) return
    addItem(variant.id, quantity)
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 lg:grid-cols-2">
      {/* Gallery */}
      <div className="flex flex-col gap-3">
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
          {images[activeImage] && (
            <Image
              src={images[activeImage].url || "/placeholder.svg"}
              alt={images[activeImage].altText ?? product.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          )}
          {hasDiscount && (
            <span className="absolute left-3 top-3 rounded bg-sale px-2 py-1 text-sm font-bold text-sale-foreground">
              -{percent}%
            </span>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {images.map((img, i) => (
              <button
                key={img.url}
                type="button"
                onClick={() => setActiveImage(i)}
                aria-label={`View image ${i + 1}`}
                className={cn(
                  "relative h-20 w-16 shrink-0 overflow-hidden rounded border-2",
                  i === activeImage ? "border-accent" : "border-transparent",
                )}
              >
                <Image src={img.url || "/placeholder.svg"} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col">
        <p className="text-sm text-muted-foreground">{product.productType}</p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-balance md:text-3xl">{product.title}</h1>

        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-3xl font-extrabold text-sale">{formatMoney(price)}</span>
          {hasDiscount && (
            <>
              <span className="text-lg text-muted-foreground line-through">{formatMoney(compareAt)}</span>
              <span className="rounded bg-sale/10 px-2 py-0.5 text-sm font-bold text-sale">
                Save {percent}%
              </span>
            </>
          )}
        </div>

        {/* Options */}
        <div className="mt-6 flex flex-col gap-5">
          {product.options
            .filter((o) => !(o.values.length === 1 && o.values[0] === "One Size"))
            .map((option) => (
              <div key={option.id}>
                <span className="text-sm font-semibold">{option.name}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {option.values.map((value) => {
                    const active = selected[option.name] === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setSelected((prev) => ({ ...prev, [option.name]: value }))
                        }
                        className={cn(
                          "min-w-11 rounded-full border px-4 py-2 text-sm transition",
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border hover:border-foreground",
                        )}
                      >
                        {value}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

          {/* Quantity */}
          <div>
            <span className="text-sm font-semibold">Quantity</span>
            <div className="mt-2 flex w-fit items-center rounded-full border border-border">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="flex h-10 w-10 items-center justify-center"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-medium">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                aria-label="Increase quantity"
                className="flex h-10 w-10 items-center justify-center"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!variant || soldOut || isPending}
            className="flex-1 rounded-full bg-accent py-3.5 text-sm font-bold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {soldOut ? "Sold Out" : !allSelected ? "Select Options" : isPending ? "Adding..." : "Add to Bag"}
          </button>
          <button
            type="button"
            onClick={() => toggle(product.handle)}
            aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={wished}
            className="flex h-13 w-13 items-center justify-center rounded-full border border-border p-3.5 transition hover:border-foreground"
          >
            <Heart className={cn("h-5 w-5", wished ? "fill-accent text-accent" : "")} />
          </button>
        </div>

        {/* Trust badges */}
        <div className="mt-6 grid grid-cols-3 gap-2 rounded-lg bg-muted p-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <Truck className="h-5 w-5 text-accent" />
            <span className="text-xs text-muted-foreground">Free shipping over $29</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <RotateCcw className="h-5 w-5 text-accent" />
            <span className="text-xs text-muted-foreground">45-day returns</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <span className="text-xs text-muted-foreground">Secure checkout</span>
          </div>
        </div>

        {/* Description */}
        {product.descriptionHtml && (
          <div className="mt-6 border-t border-border pt-6">
            <h2 className="text-sm font-semibold">Description</h2>
            <div
              className="mt-2 text-sm leading-relaxed text-muted-foreground [&_p]:mb-2"
              dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
            />
            {product.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                  >
                    <Check className="h-3 w-3" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
