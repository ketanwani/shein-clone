/**
 * The product API. Backed by lib/catalogue, not by Shopify.
 *
 * mock.shop serves 29 products with no productType and no usable tags, so it cannot
 * answer "show me ten dresses" — every category page rendered the same 29 items. The
 * catalogue moved in-process; the bag did not, because cart lines still need real
 * merchandise ids. See lib/catalogue/index.ts.
 *
 * The signatures and the `query` dialect are unchanged on purpose: callers still pass
 * `product_type:'Dresses'` or `tag:'Sale'` or free text, so nothing above this file had
 * to move, and swapping a real Shopify store back in means reinstating the fetches here
 * and nothing else.
 */

import {
  allProducts,
  productByHandle,
  productsByTag,
  productsByType,
  searchProducts,
} from "@/lib/catalogue"
import type { Product } from "./types"

export type ProductSortKey = "BEST_SELLING" | "CREATED_AT" | "PRICE" | "TITLE" | "RELEVANCE"

/** `product_type:'Dresses'` / `tag:'Sale'`, the two structured forms callers build. */
const FILTER = /^(product_type|tag):\s*'([^']*)'$/i

const priceOf = (p: Product) => Number.parseFloat(p.priceRange.minVariantPrice.amount)

/**
 * Applies the query, honouring the structured filters and otherwise treating it as
 * something a shopper typed.
 */
function select(query: string | undefined): Product[] {
  const trimmed = query?.trim()
  if (!trimmed) return allProducts()

  const structured = FILTER.exec(trimmed)
  if (structured) {
    const [, field, value] = structured
    return field.toLowerCase() === "tag" ? productsByTag(value) : productsByType(value)
  }

  return searchProducts(trimmed)
}

function sort(products: Product[], sortKey: ProductSortKey, reverse: boolean): Product[] {
  const sorted = [...products]

  switch (sortKey) {
    case "TITLE":
      sorted.sort((a, b) => a.title.localeCompare(b.title))
      break
    case "PRICE":
      sorted.sort((a, b) => priceOf(a) - priceOf(b))
      break
    case "CREATED_AT":
      // Catalogue order stands in for recency; `reverse` then reads as "newest first",
      // which is what the home page asks for.
      break
    case "BEST_SELLING":
    case "RELEVANCE":
      // Already in the order select() produced — for a search that is match order, and
      // for everything else it is the curated catalogue order.
      break
  }

  return reverse ? sorted.reverse() : sorted
}

export async function getProducts(options?: {
  query?: string
  sortKey?: ProductSortKey
  reverse?: boolean
  first?: number
}): Promise<Product[]> {
  const selected = select(options?.query)
  const ordered = sort(selected, options?.sortKey ?? "BEST_SELLING", options?.reverse ?? false)
  return ordered.slice(0, options?.first ?? 50)
}

export async function getProduct(handle: string): Promise<Product | null> {
  return productByHandle(handle)
}

/**
 * Other things from the same category, which is as much as a catalogue this size can
 * honestly claim. Shopify's own recommendations endpoint needs order history to be
 * anything better, and mock.shop has none.
 */
export async function getProductRecommendations(productId: string): Promise<Product[]> {
  const source = allProducts().find((p) => p.id === productId)
  if (!source) return []

  return productsByType(source.productType)
    .filter((p) => p.id !== source.id)
    .slice(0, 8)
}
