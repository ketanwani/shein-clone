import { getProduct } from "@/lib/shopify/products"
import { handle as withErrors, json, notFound } from "@/lib/api/http"

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  return withErrors(request, async () => {
    const { handle } = await params
    const product = await getProduct(handle)
    if (!product) throw notFound(`No product with handle "${handle}".`)
    return json({ product })
  })
}
