import { shopifyFetch } from "./client"
import type { Cart } from "./types"

const CART_FRAGMENT = /* GraphQL */ `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    cost {
      subtotalAmount {
        amount
        currencyCode
      }
      totalAmount {
        amount
        currencyCode
      }
    }
    lines(first: 100) {
      edges {
        node {
          id
          quantity
          cost {
            totalAmount {
              amount
              currencyCode
            }
          }
          merchandise {
            ... on ProductVariant {
              id
              title
              selectedOptions {
                name
                value
              }
              image {
                url
                altText
                width
                height
              }
              product {
                handle
                title
              }
            }
          }
        }
      }
    }
  }
`

type RawCart = Omit<Cart, "lines"> & {
  lines: { edges: { node: Cart["lines"][number] }[] }
}

function reshape(raw: RawCart | null): Cart | null {
  if (!raw) return null
  return {
    ...raw,
    lines: raw.lines.edges.map((e) => e.node),
  }
}

export async function createCart(): Promise<Cart> {
  const data = await shopifyFetch<{ cartCreate: { cart: RawCart } }>({
    query: /* GraphQL */ `
      mutation cartCreate {
        cartCreate {
          cart {
            ...CartFields
          }
        }
      }
      ${CART_FRAGMENT}
    `,
  })
  return reshape(data.cartCreate.cart)!
}

export async function getCart(cartId: string): Promise<Cart | null> {
  const data = await shopifyFetch<{ cart: RawCart | null }>({
    query: /* GraphQL */ `
      query getCart($cartId: ID!) {
        cart(id: $cartId) {
          ...CartFields
        }
      }
      ${CART_FRAGMENT}
    `,
    variables: { cartId },
  })
  return reshape(data.cart)
}

export async function addToCart(cartId: string, lines: { merchandiseId: string; quantity: number }[]): Promise<Cart> {
  const data = await shopifyFetch<{ cartLinesAdd: { cart: RawCart } }>({
    query: /* GraphQL */ `
      mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart {
            ...CartFields
          }
        }
      }
      ${CART_FRAGMENT}
    `,
    variables: { cartId, lines },
  })
  return reshape(data.cartLinesAdd.cart)!
}

export async function updateCart(cartId: string, lines: { id: string; quantity: number }[]): Promise<Cart> {
  const data = await shopifyFetch<{ cartLinesUpdate: { cart: RawCart } }>({
    query: /* GraphQL */ `
      mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) {
          cart {
            ...CartFields
          }
        }
      }
      ${CART_FRAGMENT}
    `,
    variables: { cartId, lines },
  })
  return reshape(data.cartLinesUpdate.cart)!
}

export async function removeFromCart(cartId: string, lineIds: string[]): Promise<Cart> {
  const data = await shopifyFetch<{ cartLinesRemove: { cart: RawCart } }>({
    query: /* GraphQL */ `
      mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart {
            ...CartFields
          }
        }
      }
      ${CART_FRAGMENT}
    `,
    variables: { cartId, lineIds },
  })
  return reshape(data.cartLinesRemove.cart)!
}
