import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getProduct, getProductRecommendations } from "@/lib/shopify/products"
import { ProductDetail } from "@/components/product/product-detail"
import { ProductGrid } from "@/components/product/product-grid"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const product = await getProduct(handle)
  if (!product) return { title: "Product not found — GLOWA" }
  return {
    title: `${product.title} — GLOWA`,
    description: product.description.slice(0, 155),
    openGraph: product.featuredImage
      ? { images: [{ url: product.featuredImage.url }] }
      : undefined,
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const product = await getProduct(handle)
  if (!product) notFound()

  const recommendations = await getProductRecommendations(product.id)

  return (
    <div>
      <ProductDetail product={product} />

      {recommendations.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10">
          <h2 className="mb-6 font-serif text-2xl font-extrabold">You May Also Like</h2>
          <ProductGrid products={recommendations.slice(0, 5)} />
        </section>
      )}
    </div>
  )
}
