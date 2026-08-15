import { getProduct } from "@/lib/shopify/products"
import { serializeProduct } from "@/lib/api/serialize"
import { json, apiError, withAuth } from "@/lib/api/http"

export const dynamic = "force-dynamic"

// GET /api/v1/products/:handle
export const GET = withAuth<{ params: Promise<{ handle: string }> }>(async (_req, _principal, ctx) => {
  const { handle } = await ctx.params
  const product = await getProduct(handle)
  if (!product) return apiError(404, "not_found", `No product found with handle '${handle}'.`)
  return json({ product: serializeProduct(product) })
})
