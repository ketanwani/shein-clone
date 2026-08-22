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

/**
 * The filter for a category, in the same dialect a Shopify Storefront query uses.
 *
 * This used to return undefined against mock.shop, which has neither tags nor product
 * types — so every category page fell back to the unfiltered catalogue and all twelve
 * rendered the same 29 items. lib/catalogue supplies both fields now, so the filter is
 * always applied and the dialect still matches what a real store would answer.
 */
export function categoryQuery(category: Category): string | undefined {
  if (category.productType) return `product_type:'${category.productType}'`
  if (category.tag) return `tag:'${category.tag}'`
  return undefined
}
