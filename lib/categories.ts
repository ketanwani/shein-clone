import { IS_MOCK_STORE } from "@/lib/shopify/client"

export type Category = {
  slug: string
  name: string
  productType?: string
  tag?: string
}

// Ordered nav categories. Each maps to a Shopify productType or tag filter.
export const CATEGORIES: Category[] = [
  { slug: "new-in", name: "New In", tag: "New In" },
  { slug: "women", name: "Women", tag: "Women" },
  { slug: "men", name: "Men", tag: "Men" },
  { slug: "dresses", name: "Dresses", productType: "Dresses" },
  { slug: "tops", name: "Tops", productType: "Tops" },
  { slug: "bottoms", name: "Bottoms", productType: "Bottoms" },
  { slug: "shoes", name: "Shoes", productType: "Shoes" },
  { slug: "beauty", name: "Beauty", productType: "Beauty" },
  { slug: "jewelry", name: "Jewelry", productType: "Jewelry" },
  { slug: "bags", name: "Bags", productType: "Bags" },
  { slug: "home", name: "Home", productType: "Home" },
  { slug: "sale", name: "Sale", tag: "Sale" },
]

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug)
}

// Build a Shopify Storefront query string for a category.
export function categoryQuery(category: Category): string | undefined {
  // mock.shop has no tags or product types, and returns nothing for those filters.
  // Drop the filter there so collection pages show the demo catalogue instead of
  // rendering empty. A real store filters normally.
  if (IS_MOCK_STORE) return undefined
  if (category.productType) return `product_type:'${category.productType}'`
  if (category.tag) return `tag:'${category.tag}'`
  return undefined
}
