import type { Cart, Product } from "@/lib/shopify/types"

export function serializeProduct(p: Product) {
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    description: p.description,
    productType: p.productType,
    tags: p.tags,
    availableForSale: p.availableForSale,
    featuredImage: p.featuredImage?.url ?? null,
    images: p.images.map((i) => i.url),
    price: {
      min: p.priceRange.minVariantPrice.amount,
      max: p.priceRange.maxVariantPrice.amount,
      currency: p.priceRange.minVariantPrice.currencyCode,
    },
    compareAtPrice: {
      min: p.compareAtPriceRange.minVariantPrice.amount,
      max: p.compareAtPriceRange.maxVariantPrice.amount,
    },
    options: p.options.map((o) => ({ name: o.name, values: o.values })),
    variants: p.variants.map((v) => ({
      id: v.id,
      title: v.title,
      availableForSale: v.availableForSale,
      price: v.price.amount,
      compareAtPrice: v.compareAtPrice?.amount ?? null,
      currency: v.price.currencyCode,
      options: v.selectedOptions,
    })),
  }
}

export function serializeCart(cart: Cart | null) {
  if (!cart) {
    return { id: null, totalQuantity: 0, lines: [], cost: null }
  }
  return {
    id: cart.id,
    totalQuantity: cart.totalQuantity,
    cost: {
      subtotal: cart.cost.subtotalAmount.amount,
      total: cart.cost.totalAmount.amount,
      currency: cart.cost.subtotalAmount.currencyCode,
    },
    lines: cart.lines.map((l) => ({
      lineId: l.id,
      variantId: l.merchandise.id,
      productHandle: l.merchandise.product.handle,
      title: l.merchandise.product.title,
      variantTitle: l.merchandise.title,
      options: l.merchandise.selectedOptions,
      image: l.merchandise.image?.url ?? null,
      quantity: l.quantity,
      lineTotal: l.cost.totalAmount.amount,
    })),
  }
}

type OrderRow = {
  orderNumber: string
  email: string
  shippingName: string
  shippingAddress: string
  shippingCity: string
  shippingZip: string
  shippingCountry: string
  subtotal: string
  shipping: string
  tax: string
  total: string
  currency: string
  cardLast4: string | null
  status: string
  createdAt: Date | string
  items: {
    title: string
    variantTitle: string | null
    quantity: number
    price: string
    imageUrl?: string | null
    productHandle?: string | null
  }[]
}

export function serializeOrder(o: OrderRow) {
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : o.createdAt.toISOString(),
    email: o.email,
    shipping: {
      name: o.shippingName,
      address: o.shippingAddress,
      city: o.shippingCity,
      zip: o.shippingZip,
      country: o.shippingCountry,
    },
    totals: {
      subtotal: o.subtotal,
      shipping: o.shipping,
      tax: o.tax,
      total: o.total,
      currency: o.currency,
    },
    cardLast4: o.cardLast4,
    items: o.items.map((it) => ({
      title: it.title,
      variantTitle: it.variantTitle,
      quantity: it.quantity,
      price: it.price,
      productHandle: it.productHandle ?? null,
      image: it.imageUrl ?? null,
    })),
  }
}
