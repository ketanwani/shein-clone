import { getProducts } from "@/lib/shopify/products"
import { handlePublic, json, readLimit } from "@/lib/api/http"
import { resolveSort } from "@/lib/api/sort"

export async function GET(request: Request) {
  return handlePublic(request, async () => {
    const url = new URL(request.url)
    const q = url.searchParams.get("q")?.trim() ?? ""
    const limit = readLimit(url, 20, 50)
    const { sortKey, reverse } = resolveSort(url.searchParams.get("sort"), q ? "relevance" : "featured")

    const products = await getProducts({ query: q || undefined, sortKey, reverse, first: limit })
    return json({ count: products.length, products })
  })
}
