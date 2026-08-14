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
  handle: string
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

export type Order = {
  id: string
  orderNumber: number
  processedAt: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  totalPrice: Money
  lineItems: {
    title: string
    quantity: number
    image: { url: string; altText: string | null } | null
    price: Money
  }[]
}

export type Customer = {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
}
