import { getProduct, getProductRecommendations } from "@/lib/shopify/products"
import { handle as withErrors, json, notFound, readLimit } from "@/lib/api/http"

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  return withErrors(request, async () => {
    const { handle } = await params
    const product = await getProduct(handle)
    if (!product) throw notFound(`No product with handle "${handle}".`)

    const limit = readLimit(new URL(request.url), 10, 20)
    const products = (await getProductRecommendations(product.id)).slice(0, limit)
    return json({ count: products.length, products })
  })
}
