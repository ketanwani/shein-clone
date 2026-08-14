import { shopifyFetch } from "./client"
import type { Product } from "./types"

const PRODUCT_FRAGMENT = /* GraphQL */ `
  fragment ProductFields on Product {
    id
    handle
    title
    description
    descriptionHtml
    productType
    tags
    availableForSale
    featuredImage {
      url
      altText
      width
      height
    }
    images(first: 8) {
      edges {
        node {
          url
          altText
          width
          height
        }
      }
    }
    options {
      id
      name
      values
    }
    variants(first: 100) {
      edges {
        node {
          id
          title
          availableForSale
          selectedOptions {
            name
            value
          }
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
        }
      }
    }
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    compareAtPriceRange {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
  }
`

type RawProduct = Omit<Product, "images" | "variants"> & {
  images: { edges: { node: Product["images"][number] }[] }
  variants: { edges: { node: Product["variants"][number] }[] }
}

function reshape(raw: RawProduct | null): Product | null {
  if (!raw) return null
  return {
    ...raw,
    images: raw.images.edges.map((e) => e.node),
    variants: raw.variants.edges.map((e) => e.node),
  }
}

export async function getProducts(options?: {
  query?: string
  sortKey?: "BEST_SELLING" | "CREATED_AT" | "PRICE" | "TITLE" | "RELEVANCE"
  reverse?: boolean
  first?: number
}): Promise<Product[]> {
  const data = await shopifyFetch<{ products: { edges: { node: RawProduct }[] } }>({
    query: /* GraphQL */ `
      query getProducts($query: String, $sortKey: ProductSortKeys, $reverse: Boolean, $first: Int!) {
        products(query: $query, sortKey: $sortKey, reverse: $reverse, first: $first) {
          edges {
            node {
              ...ProductFields
            }
          }
        }
      }
      ${PRODUCT_FRAGMENT}
    `,
    variables: {
      query: options?.query ?? "",
      sortKey: options?.sortKey ?? "BEST_SELLING",
      reverse: options?.reverse ?? false,
      first: options?.first ?? 50,
    },
    cache: "no-store",
  })

  return data.products.edges.map((e) => reshape(e.node)).filter((p): p is Product => p !== null)
}

export async function getProduct(handle: string): Promise<Product | null> {
  const data = await shopifyFetch<{ product: RawProduct | null }>({
    query: /* GraphQL */ `
      query getProduct($handle: String!) {
        product(handle: $handle) {
          ...ProductFields
        }
      }
      ${PRODUCT_FRAGMENT}
    `,
    variables: { handle },
    cache: "no-store",
  })

  return reshape(data.product)
}

export async function getProductRecommendations(productId: string): Promise<Product[]> {
  const data = await shopifyFetch<{ productRecommendations: RawProduct[] }>({
    query: /* GraphQL */ `
      query getRecs($productId: ID!) {
        productRecommendations(productId: $productId) {
          ...ProductFields
        }
      }
      ${PRODUCT_FRAGMENT}
    `,
    variables: { productId },
    cache: "no-store",
  })

  return (data.productRecommendations ?? []).map((p) => reshape(p)).filter((p): p is Product => p !== null)
}
