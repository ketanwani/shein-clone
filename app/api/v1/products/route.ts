import { getProducts } from "@/lib/shopify/products"
import { serializeProduct } from "@/lib/api/serialize"
import { json, withAuth } from "@/lib/api/http"

export const dynamic = "force-dynamic"

const SORT_MAP: Record<string, { sortKey: "BEST_SELLING" | "CREATED_AT" | "PRICE" | "RELEVANCE"; reverse: boolean }> = {
  best_selling: { sortKey: "BEST_SELLING", reverse: false },
  newest: { sortKey: "CREATED_AT", reverse: true },
  price_asc: { sortKey: "PRICE", reverse: false },
  price_desc: { sortKey: "PRICE", reverse: true },
  relevance: { sortKey: "RELEVANCE", reverse: false },
}

// GET /api/v1/products?q=dress&sort=price_asc&limit=20
export const GET = withAuth(async (req) => {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim() || undefined
  const sortParam = url.searchParams.get("sort")?.toLowerCase() ?? (q ? "relevance" : "best_selling")
  const sort = SORT_MAP[sortParam] ?? SORT_MAP.best_selling
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "50", 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50

  const products = await getProducts({ query: q, sortKey: sort.sortKey, reverse: sort.reverse, first: limit })
  return json({ products: products.map(serializeProduct), count: products.length })
})
