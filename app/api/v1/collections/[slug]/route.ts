import { categoryQuery, getCategory } from "@/lib/categories"
import { getProducts } from "@/lib/shopify/products"
import { apiError, json, requireApiKey } from "@/lib/api/helpers"

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const { slug } = await params
  const category = getCategory(slug)
  if (!category) return apiError(`Collection '${slug}' not found.`, 404)

  const { searchParams } = new URL(req.url)
  const firstRaw = Number.parseInt(searchParams.get("first") ?? "", 10)
  const first = Number.isFinite(firstRaw) ? Math.min(Math.max(firstRaw, 1), 100) : 50

  try {
    const products = await getProducts({ query: categoryQuery(category), first })
    return json({ collection: category, count: products.length, products })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to fetch collection.", 502)
  }
}
