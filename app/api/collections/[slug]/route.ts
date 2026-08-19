import { categoryQuery, getCategory } from "@/lib/categories"
import { getProducts } from "@/lib/shopify/products"
import { handlePublic, json, notFound, readLimit } from "@/lib/api/http"
import { absoluteUrl } from "@/lib/api/url"
import { collectionPath } from "@/lib/routes"
import { resolveSort } from "@/lib/api/sort"

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handlePublic(request, async () => {
    const { slug } = await params
    const category = getCategory(slug)
    if (!category) throw notFound(`No collection with slug "${slug}". List them with GET /api/collections.`)

    const url = new URL(request.url)
    const limit = readLimit(url, 20, 50)
    const { sortKey, reverse } = resolveSort(url.searchParams.get("sort"))

    const products = await getProducts({ query: categoryQuery(category), sortKey, reverse, first: limit })
    return json({
      // Same shape as an entry in GET /api/collections, so a caller can treat the two
      // interchangeably rather than special-casing which one carries a link.
      collection: { slug: category.slug, name: category.name, url: absoluteUrl(collectionPath(category.slug)) },
      count: products.length,
      products,
    })
  })
}
