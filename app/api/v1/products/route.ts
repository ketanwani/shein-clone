import { getProducts } from "@/lib/shopify/products"
import { apiError, json, requireApiKey } from "@/lib/api/helpers"

const SORT_KEYS = ["BEST_SELLING", "CREATED_AT", "PRICE", "TITLE", "RELEVANCE"] as const
type SortKey = (typeof SORT_KEYS)[number]

export async function GET(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const query = searchParams.get("query") ?? undefined
  const sortParam = searchParams.get("sortKey")
  const sortKey = SORT_KEYS.includes(sortParam as SortKey) ? (sortParam as SortKey) : undefined
  const reverse = searchParams.get("reverse") === "true"
  const firstRaw = Number.parseInt(searchParams.get("first") ?? "", 10)
  const first = Number.isFinite(firstRaw) ? Math.min(Math.max(firstRaw, 1), 100) : 50

  try {
    const products = await getProducts({ query, sortKey, reverse, first })
    return json({ count: products.length, products })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to fetch products.", 502)
  }
}
