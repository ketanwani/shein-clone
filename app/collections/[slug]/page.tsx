import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getCategory, categoryQuery, CATEGORIES } from "@/lib/categories"
import { getProducts } from "@/lib/shopify/products"
import { CollectionView } from "@/components/collection/collection-view"

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const category = getCategory(slug)
  if (!category) return { title: "Collection — GLOWA" }
  return {
    title: `${category.name} — GLOWA`,
    description: `Shop ${category.name} at GLOWA. Trendy styles, tiny prices.`,
  }
}

type SortParam = "featured" | "price-asc" | "price-desc" | "newest"

const SORT_MAP: Record<SortParam, { sortKey: "BEST_SELLING" | "PRICE" | "CREATED_AT"; reverse: boolean }> = {
  featured: { sortKey: "BEST_SELLING", reverse: false },
  "price-asc": { sortKey: "PRICE", reverse: false },
  "price-desc": { sortKey: "PRICE", reverse: true },
  newest: { sortKey: "CREATED_AT", reverse: true },
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ sort?: string }>
}) {
  const { slug } = await params
  const { sort } = await searchParams
  const category = getCategory(slug)
  if (!category) notFound()

  const sortKey = (sort as SortParam) in SORT_MAP ? (sort as SortParam) : "featured"
  const { sortKey: shopifySort, reverse } = SORT_MAP[sortKey]

  const products = await getProducts({
    query: categoryQuery(category),
    sortKey: shopifySort,
    reverse,
    first: 50,
  })

  return (
    <CollectionView
      title={category.name}
      count={products.length}
      products={products}
      activeSort={sortKey}
      slug={category.slug}
    />
  )
}
