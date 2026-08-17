import { getProduct } from "@/lib/shopify/products"
import { apiError, json, requireApiKey } from "@/lib/api/helpers"

export async function GET(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const { handle } = await params
  try {
    const product = await getProduct(handle)
    if (!product) return apiError(`Product '${handle}' not found.`, 404)
    return json({ product })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to fetch product.", 502)
  }
}
