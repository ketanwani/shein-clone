import type { Metadata } from "next"
import { getProducts } from "@/lib/shopify/products"
import { ProductGrid } from "@/components/product/product-grid"

export const metadata: Metadata = {
  title: "Search — GLOWA",
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = q?.trim() ?? ""
  const products = query ? await getProducts({ query, sortKey: "RELEVANCE", first: 50 }) : []

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-serif text-2xl font-extrabold md:text-3xl">
        {query ? (
          <>
            Results for <span className="text-accent">&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          "Search"
        )}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {query ? `${products.length} items found` : "Type in the search bar to find products."}
      </p>
      {query && <ProductGrid products={products} />}
    </div>
  )
}
