const API_VERSION = "2025-04"

const domain = process.env.SHOPIFY_STORE_DOMAIN
const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN

/**
 * Only the cart still goes through here.
 *
 * Products used to as well, but Shopify's demo storefront serves 29 items with no
 * productType and no usable tags, so it could not answer a category query — see
 * lib/catalogue. The bag stayed because cart lines need real merchandise ids.
 */
export const endpoint = domain ? `https://${domain}/api/${API_VERSION}/graphql.json` : ""

export type ShopifyFetchOptions = {
  query: string
  variables?: Record<string, unknown>
  cache?: RequestCache
  tags?: string[]
}

export async function shopifyFetch<T>({ query, variables, cache = "no-store", tags }: ShopifyFetchOptions): Promise<T> {
  if (!domain || !token) {
    throw new Error(
      "Missing Shopify environment variables. Ensure SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN are set.",
    )
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache,
    ...(tags ? { next: { tags } } : {}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify request failed: ${res.status} ${text}`)
  }

  const json = (await res.json()) as { data: T; errors?: Array<{ message: string }> }

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "))
  }

  return json.data
}
