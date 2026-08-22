/**
 * The bag.
 *
 * Shopify holds it, but the products in it are ours (lib/catalogue), so every line goes
 * through a translation on the way in and back out again:
 *
 *   in   our variant id -> a real mock.shop variant, with our id kept in a line attribute
 *   out  that attribute -> our title, image, options and price, over Shopify's line
 *
 * The attribute is the identity. Backing variants are drawn round-robin from mock.shop's
 * 307 purchasable variants and repeat freely, so the merchandise id says nothing about
 * which of our products a line holds — only `_v` does.
 *
 * Money is recomputed here rather than trusted from upstream, because Shopify prices the
 * backing variant and we are selling ours. Doing it inside reshape() means every caller
 * — cart drawer, checkout page, the agent's GET /api/cart, and the order total, which is
 * summed from `line.cost` — sees one consistent set of numbers. A line that predates
 * this mapping, or one added directly against a Shopify id, keeps its upstream values
 * instead of breaking.
 */

import { shopifyFetch } from "./client"
import { ApiFailure } from "@/lib/api/failure"
import { backingVariantFor, isLocalVariantId, resolveVariant } from "@/lib/catalogue"
import type { Cart, CartLine } from "./types"

/** Carries our variant id on the Shopify line. mock.shop stores and returns these. */
const VARIANT_ATTRIBUTE = "_v"

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
          attributes {
            key
            value
          }
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

type RawLine = CartLine & { attributes?: { key: string; value: string | null }[] }

type RawCart = Omit<Cart, "lines"> & {
  lines: { edges: { node: RawLine }[] }
}

/**
 * Puts our product back on a Shopify line, and reprices it.
 *
 * Returns the line untouched when there is no attribute to go on, or when the id in it
 * no longer resolves — a catalogue regeneration can retire a variant while a bag still
 * references it, and showing the upstream merchandise beats erroring on a stale bag.
 */
function localiseLine(line: RawLine): CartLine {
  const localId = line.attributes?.find((a) => a.key === VARIANT_ATTRIBUTE)?.value
  if (!localId) return stripAttributes(line)

  const resolved = resolveVariant(localId)
  if (!resolved) return stripAttributes(line)

  const { product, variant } = resolved
  const unit = Number.parseFloat(variant.price.amount)

  return {
    id: line.id,
    quantity: line.quantity,
    cost: {
      totalAmount: {
        amount: (unit * line.quantity).toFixed(2),
        currencyCode: variant.price.currencyCode,
      },
    },
    merchandise: {
      id: variant.id,
      title: variant.title,
      selectedOptions: variant.selectedOptions,
      image: product.featuredImage,
      product: { handle: product.handle, title: product.title },
    },
  }
}

/** `attributes` is plumbing, not part of the Cart contract callers consume. */
function stripAttributes(line: RawLine): CartLine {
  const { attributes: _attributes, ...rest } = line
  return rest
}

function reshape(raw: RawCart | null): Cart | null {
  if (!raw) return null

  const lines = raw.lines.edges.map((e) => localiseLine(e.node))

  // Summed from the localised lines so the total cannot disagree with what is listed
  // above it. Shopify's own subtotal prices the backing variants and is discarded.
  const subtotal = lines.reduce((sum, l) => sum + Number.parseFloat(l.cost.totalAmount.amount), 0)
  const currencyCode =
    lines[0]?.cost.totalAmount.currencyCode ?? raw.cost.subtotalAmount.currencyCode
  const amount = subtotal.toFixed(2)

  return {
    ...raw,
    cost: {
      subtotalAmount: { amount, currencyCode },
      totalAmount: { amount, currencyCode },
    },
    totalQuantity: lines.reduce((n, l) => n + l.quantity, 0),
    lines,
  }
}

/**
 * Turns our variant id into something Shopify will accept, keeping ours on the line.
 *
 * Two sizes of the same product resolve to different local ids, so they stay separate
 * lines even when they happen to share a backing variant — Shopify merges only when both
 * the merchandise and the attributes match.
 */
function toShopifyLine(line: { merchandiseId: string; quantity: number }) {
  if (!isLocalVariantId(line.merchandiseId)) return line

  const backing = backingVariantFor(line.merchandiseId)
  if (!backing) {
    // The caller sent a variant that does not exist, which is a bad request rather than
    // a broken server. A 500 here would tell the agent to retry or give up, when what it
    // actually needs to do is stop constructing ids and copy one from a product response.
    throw new ApiFailure(
      400,
      "bad_request",
      `Unknown product variant: ${line.merchandiseId}`,
      "Variant ids are not constructible. Fetch the product with GET /api/products/{handle} and copy a value from variants[].id verbatim.",
    )
  }

  return {
    merchandiseId: backing,
    quantity: line.quantity,
    attributes: [{ key: VARIANT_ATTRIBUTE, value: line.merchandiseId }],
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
    variables: { cartId, lines: lines.map(toShopifyLine) },
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
