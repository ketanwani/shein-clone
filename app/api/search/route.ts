import { getProducts } from "@/lib/shopify/products"
import { badRequest, handle, json, readLimit } from "@/lib/api/http"
import { resolveSort } from "@/lib/api/sort"

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    const q = url.searchParams.get("q")?.trim()
    if (!q) throw badRequest('The "q" query parameter is required.', "Example: /api/search?q=summer%20dress")

    const limit = readLimit(url, 20, 50)
    const { sortKey, reverse } = resolveSort(url.searchParams.get("sort"), "relevance")

    const products = await getProducts({ query: q, sortKey, reverse, first: limit })
    return json({ query: q, count: products.length, products })
  })
}
