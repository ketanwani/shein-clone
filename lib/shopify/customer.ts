import { shopifyFetch } from "./client"
import type { Customer, Order } from "./types"

const CUSTOMER_FIELDS = `
  id
  firstName
  lastName
  email
`

export async function createCustomer(input: {
  firstName: string
  lastName: string
  email: string
  password: string
}): Promise<{ customer: Customer | null; errors: string[] }> {
  const query = `
    mutation customerCreate($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        customer { ${CUSTOMER_FIELDS} }
        customerUserErrors { message }
      }
    }
  `
  const data = await shopifyFetch<{
    customerCreate: {
      customer: Customer | null
      customerUserErrors: { message: string }[]
    }
  }>({ query, variables: { input } })

  return {
    customer: data.customerCreate.customer,
    errors: data.customerCreate.customerUserErrors.map((e) => e.message),
  }
}

export async function createCustomerToken(
  email: string,
  password: string,
): Promise<{ token: string | null; expiresAt: string | null; errors: string[] }> {
  const query = `
    mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken { accessToken expiresAt }
        customerUserErrors { message }
      }
    }
  `
  const data = await shopifyFetch<{
    customerAccessTokenCreate: {
      customerAccessToken: { accessToken: string; expiresAt: string } | null
      customerUserErrors: { message: string }[]
    }
  }>({ query, variables: { input: { email, password } } })

  const result = data.customerAccessTokenCreate
  return {
    token: result.customerAccessToken?.accessToken ?? null,
    expiresAt: result.customerAccessToken?.expiresAt ?? null,
    errors: result.customerUserErrors.map((e) => e.message),
  }
}

export async function deleteCustomerToken(token: string): Promise<void> {
  const query = `
    mutation customerAccessTokenDelete($token: String!) {
      customerAccessTokenDelete(customerAccessToken: $token) {
        deletedAccessToken
      }
    }
  `
  await shopifyFetch({ query, variables: { token } }).catch(() => {})
}

export async function getCustomer(token: string): Promise<Customer | null> {
  const query = `
    query getCustomer($token: String!) {
      customer(customerAccessToken: $token) {
        ${CUSTOMER_FIELDS}
      }
    }
  `
  const data = await shopifyFetch<{ customer: Customer | null }>({
    query,
    variables: { token },
    cache: "no-store",
  })
  return data.customer
}

export async function getCustomerOrders(token: string): Promise<Order[]> {
  const query = `
    query getCustomerOrders($token: String!) {
      customer(customerAccessToken: $token) {
        orders(first: 20, sortKey: PROCESSED_AT, reverse: true) {
          edges {
            node {
              id
              orderNumber
              processedAt
              financialStatus
              fulfillmentStatus
              currentTotalPrice { amount currencyCode }
              lineItems(first: 20) {
                edges {
                  node {
                    title
                    quantity
                    variant {
                      image { url altText }
                      price { amount currencyCode }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `
  const data = await shopifyFetch<{
    customer: {
      orders: { edges: { node: RawOrder }[] }
    } | null
  }>({ query, variables: { token }, cache: "no-store" })

  if (!data.customer) return []
  return data.customer.orders.edges.map((e) => normalizeOrder(e.node))
}

type RawOrder = {
  id: string
  orderNumber: number
  processedAt: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  currentTotalPrice: { amount: string; currencyCode: string }
  lineItems: {
    edges: {
      node: {
        title: string
        quantity: number
        variant: {
          image: { url: string; altText: string | null } | null
          price: { amount: string; currencyCode: string }
        } | null
      }
    }[]
  }
}

function normalizeOrder(node: RawOrder): Order {
  return {
    id: node.id,
    orderNumber: node.orderNumber,
    processedAt: node.processedAt,
    financialStatus: node.financialStatus,
    fulfillmentStatus: node.fulfillmentStatus,
    totalPrice: node.currentTotalPrice,
    lineItems: node.lineItems.edges.map((e) => ({
      title: e.node.title,
      quantity: e.node.quantity,
      image: e.node.variant?.image ?? null,
      price: e.node.variant?.price ?? node.currentTotalPrice,
    })),
  }
}
