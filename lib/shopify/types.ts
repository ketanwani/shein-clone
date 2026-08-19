export type Money = {
  amount: string
  currencyCode: string
}

export type ProductImage = {
  url: string
  altText: string | null
  width: number | null
  height: number | null
}

export type ProductVariant = {
  id: string
  title: string
  availableForSale: boolean
  selectedOptions: { name: string; value: string }[]
  price: Money
  compareAtPrice: Money | null
}

export type ProductOption = {
  id: string
  name: string
  values: string[]
}

export type Product = {
  id: string
  /** URL slug. Still the lookup key every endpoint takes — `url` is additive to it. */
  handle: string
  /**
   * Absolute, https canonical link to this product's page.
   *
   * Built from lib/routes.ts so it cannot drift from the route the site renders. Present
   * on every product, in list responses as well as detail, because chat cards are built
   * from list results.
   */
  url: string
  title: string
  description: string
  descriptionHtml: string
  productType: string
  tags: string[]
  availableForSale: boolean
  featuredImage: ProductImage | null
  images: ProductImage[]
  options: ProductOption[]
  variants: ProductVariant[]
  priceRange: {
    minVariantPrice: Money
    maxVariantPrice: Money
  }
  compareAtPriceRange: {
    minVariantPrice: Money
    maxVariantPrice: Money
  }
}

export type CartLine = {
  id: string
  quantity: number
  cost: { totalAmount: Money }
  merchandise: {
    id: string
    title: string
    selectedOptions: { name: string; value: string }[]
    image: ProductImage | null
    product: {
      handle: string
      title: string
    }
  }
}

export type Cart = {
  id: string
  checkoutUrl: string
  totalQuantity: number
  cost: {
    subtotalAmount: Money
    totalAmount: Money
  }
  lines: CartLine[]
}


