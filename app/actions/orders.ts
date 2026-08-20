"use server"

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { cookies } from "next/headers"
import { requireSubject } from "@/lib/api/subject"
import { CHECKOUT_COOKIE, checkCheckoutSession, consumeGrant } from "@/lib/checkout/grant"
import {
  addressNotFound,
  findAddress,
  getProfile,
  saveAddressOnce,
  updateProfile,
  type AddressPayload,
} from "@/lib/api/customer"
import { order, orderIdempotency, orderItem } from "@/lib/db/schema"
import { clearCartForUser, getCartForUser } from "@/lib/cart/store"

const TEST_CARD = "4242424242424242"
const FREE_SHIPPING_THRESHOLD = 29
const FLAT_SHIPPING = 3.99
const TAX_RATE = 0.08
const MAX_QTY_PER_LINE = 20

/** The agent's asserted shopper, or the signed-in user. Throws 401 when neither. */
async function getUserId() {
  const subject = await requireSubject()
  return { id: subject.userId, email: subject.email }
}

/** The order a previous call already created under this key, if there was one. */
async function replayedOrderNumber(userId: string, key: string): Promise<string | null> {
  const [found] = await db
    .select({ orderNumber: orderIdempotency.orderNumber })
    .from(orderIdempotency)
    .where(and(eq(orderIdempotency.userId, userId), eq(orderIdempotency.key, key)))
    .limit(1)
  return found?.orderNumber ?? null
}

export type PlaceOrderInput = {
  /** Optional when the shopper's profile already holds them. */
  email?: string | null
  name?: string | null
  /** Inline address. Ignored when addressId is supplied. */
  address?: string | null
  city?: string | null
  zip?: string | null
  country?: string | null
  /** An id from the shopper's own address book. Wins over an inline address. */
  addressId?: string | null
  cardNumber: string
  expiry: string
  cvc: string
}

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; replayed: boolean }
  | { ok: false; error: string }

/**
 * Settles where the order ships to, and who it is for.
 *
 * `addressId` wins over an inline address when both are sent. An id that is not this
 * customer's throws 404 rather than silently falling through to an inline address — or,
 * far worse, to somebody else's doorstep. An inline address is saved to the book so the
 * shopper does not have to dictate it again, and its id comes back on the order.
 *
 * Contact details fall back to the stored profile, which is what lets a returning
 * shopper check out with nothing but an address id and a card.
 */
type Destination = { email: string; name: string; address: AddressPayload }

async function resolveDestination(
  userId: string,
  input: PlaceOrderInput,
): Promise<{ ok: true; destination: Destination } | { ok: false; missing: string[] }> {
  const profile = await getProfile(userId)
  const email = input.email?.trim() || profile.email
  const name = input.name?.trim() || profile.name

  const missing: string[] = []
  if (!email) missing.push("email")
  if (!name) missing.push("name")

  let address: AddressPayload | null = null

  if (input.addressId) {
    address = await findAddress(userId, input.addressId)
    if (!address) throw addressNotFound(input.addressId)
  } else if (input.address?.trim() && input.city?.trim() && input.zip?.trim() && input.country?.trim()) {
    address = await saveAddressOnce(userId, {
      line1: input.address,
      city: input.city,
      zip: input.zip,
      country: input.country,
    })
  } else {
    missing.push("shipping_address")
  }

  if (!email || !name || !address) return { ok: false, missing }
  return { ok: true, destination: { email, name, address } }
}

/**
 * Places an order from the subject's bag.
 *
 * `idempotencyKey` makes retries safe: agents retry on timeout, and without this a
 * second attempt would buy the same bag twice. The key is reserved before the order is
 * written, so a concurrent duplicate loses the race and replays the winner instead of
 * creating its own order. Validation failures happen before the reservation, so a
 * declined card does not burn the key.
 */
export async function placeOrderAction(
  input: PlaceOrderInput,
  idempotencyKey?: string | null,
): Promise<PlaceOrderResult> {
  return placeOrderForShopper(await getUserId(), input, idempotencyKey)
}

/**
 * The order path itself, with the shopper already decided.
 *
 * Deliberately NOT exported. Every export from a `"use server"` module is an endpoint
 * the browser can call, so exporting something that takes a userId would let anyone
 * place an order as anyone. Callers in this file resolve the shopper first; the
 * checkout-grant flow reaches it through placeOrderFromGrantAction below, which derives
 * the shopper from an httpOnly cookie rather than from its arguments.
 */
async function placeOrderForShopper(
  user: { id: string; email: string | null },
  input: PlaceOrderInput,
  idempotencyKey?: string | null,
): Promise<PlaceOrderResult> {
  if (idempotencyKey) {
    const previous = await replayedOrderNumber(user.id, idempotencyKey)
    if (previous) return { ok: true, orderNumber: previous, replayed: true }
  }

  // Throws 404 for an address id this customer does not own; never falls through.
  const resolved = await resolveDestination(user.id, input)
  if (!resolved.ok) {
    return { ok: false, error: `Still needed before checkout: ${resolved.missing.join(", ")}.` }
  }
  const destination = resolved.destination

  // Simulated payment: only the Stripe-style test card succeeds.
  const digits = input.cardNumber.replace(/\D/g, "")
  if (digits !== TEST_CARD) {
    return { ok: false, error: "Card declined. Use test card 4242 4242 4242 4242." }
  }
  if (!/^\d{2}\s*\/\s*\d{2}$/.test(input.expiry.trim())) {
    return { ok: false, error: "Enter a valid expiry date (MM/YY)." }
  }
  if (!/^\d{3,4}$/.test(input.cvc.trim())) {
    return { ok: false, error: "Enter a valid CVC." }
  }

  // Read the authoritative server-side cart from Shopify.
  const cart = await getCartForUser(user.id)
  if (!cart || cart.lines.length === 0) {
    return { ok: false, error: "Your bag is empty." }
  }

  const currency = cart.cost.subtotalAmount.currencyCode

  // Recompute the order total from server-side prices — never trust client values.
  let subtotal = 0
  const items = cart.lines.map((line) => {
    const qty = Math.floor(line.quantity)
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY_PER_LINE) {
      throw new Error("Invalid quantity in cart.")
    }
    const lineTotal = Number.parseFloat(line.cost.totalAmount.amount)
    subtotal += lineTotal
    const unitPrice = (lineTotal / qty).toFixed(2)
    const variant =
      line.merchandise.title && line.merchandise.title !== "Default Title"
        ? line.merchandise.title
        : null
    return {
      title: line.merchandise.product.title,
      variantTitle: variant,
      quantity: qty,
      price: unitPrice,
      imageUrl: line.merchandise.image?.url ?? null,
      productHandle: line.merchandise.product.handle,
    }
  })

  subtotal = Number(subtotal.toFixed(2))
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING
  const tax = Number((subtotal * TAX_RATE).toFixed(2))
  const total = Number((subtotal + shipping + tax).toFixed(2))

  const orderNumber = `GLW-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`

  // Claim the key before writing anything. If a concurrent duplicate already claimed it,
  // that call owns the order and this one becomes a replay of it.
  if (idempotencyKey) {
    await db
      .insert(orderIdempotency)
      .values({ userId: user.id, key: idempotencyKey, orderNumber })
      .onConflictDoNothing()

    const claimed = await replayedOrderNumber(user.id, idempotencyKey)
    if (claimed && claimed !== orderNumber) return { ok: true, orderNumber: claimed, replayed: true }
  }

  // Remember what the shopper told us, so a returning visit only needs an address id.
  await updateProfile(user.id, { email: destination.email, name: destination.name })

  try {
    return await writeOrder(user.id, orderNumber, destination, {
      items,
      subtotal,
      shipping,
      tax,
      total,
      currency,
      digits,
    })
  } catch (err) {
    // Do not strand the key on a failed write — the agent must be able to retry.
    if (idempotencyKey) {
      await db
        .delete(orderIdempotency)
        .where(and(eq(orderIdempotency.userId, user.id), eq(orderIdempotency.key, idempotencyKey)))
    }
    throw err
  }
}

type OrderTotals = {
  items: {
    title: string
    variantTitle: string | null
    quantity: number
    price: string
    imageUrl: string | null
    productHandle: string
  }[]
  subtotal: number
  shipping: number
  tax: number
  total: number
  currency: string
  digits: string
}

async function writeOrder(
  userId: string,
  orderNumber: string,
  { email, name, address }: Destination,
  { items, subtotal, shipping, tax, total, currency, digits }: OrderTotals,
): Promise<PlaceOrderResult> {
  const [created] = await db
    .insert(order)
    .values({
      userId,
      orderNumber,
      email,
      shippingName: name,
      shippingAddress: address.line1,
      shippingCity: address.city,
      shippingZip: address.zip,
      shippingCountry: address.country,
      addressId: address.id,
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      currency,
      cardLast4: digits.slice(-4),
      status: "paid",
    })
    .returning({ id: order.id })

  await db.insert(orderItem).values(items.map((it) => ({ ...it, orderId: created.id })))

  // Empty the bag after a successful order.
  await clearCartForUser(userId)

  return { ok: true, orderNumber, replayed: false }
}

export type GrantCheckoutResult =
  | { ok: true; orderNumber: string }
  | { ok: false; error: string; expired?: boolean }

/**
 * Places the order behind a checkout link.
 *
 * Lives here, next to placeOrderForShopper, precisely so it can reach it without that
 * function being exported. Every export from a `"use server"` module is callable from
 * the browser, so an action taking a userId — or a grant object — would let anyone order
 * as anyone. This takes only form fields and derives the shopper from the httpOnly
 * cookie the proxy wrote.
 *
 * It runs the ordinary order path, so the row lands in Postgres exactly as
 * POST /api/orders would: same totals recomputed server-side, same address-book save,
 * same shape for the agent's list_orders and get_order afterwards.
 */
export async function submitGrantCheckoutAction(input: {
  name: string
  addressId?: string | null
  address?: string | null
  city?: string | null
  zip?: string | null
  country?: string | null
  cardNumber: string
  expiry: string
  cvc: string
}): Promise<GrantCheckoutResult> {
  const token = (await cookies()).get(CHECKOUT_COOKIE)?.value
  if (!token) return { ok: false, expired: true, error: "This checkout link is no longer valid." }

  const check = await checkCheckoutSession(token)
  if (!check.ok) {
    return { ok: false, expired: true, error: "This checkout link has expired or has already been used." }
  }
  const grant = check.grant

  const profile = await getProfile(grant.userId)

  const result = await placeOrderForShopper(
    { id: grant.userId, email: profile.email },
    {
      // The shopper's own address on the account; the form never asks for it again.
      email: profile.email,
      name: input.name,
      addressId: input.addressId ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      zip: input.zip ?? null,
      country: input.country ?? null,
      cardNumber: input.cardNumber,
      expiry: input.expiry,
      cvc: input.cvc,
    },
    // The grant is the idempotency key, so a double submit replays the first order
    // rather than buying the bag twice.
    grant.id,
  )

  if (!result.ok) return { ok: false, error: result.error }

  // End the grant. Conditional inside consumeGrant, so two submits racing cannot both
  // claim it; the loser already replayed the same order via the idempotency key.
  const [placed] = await db
    .select({ id: order.id })
    .from(order)
    .where(and(eq(order.userId, grant.userId), eq(order.orderNumber, result.orderNumber)))
    .limit(1)
  await consumeGrant(grant.id, placed?.id ?? null)

  return { ok: true, orderNumber: result.orderNumber }
}

export async function getOrdersAction() {
  const user = await getUserId()
  const orders = await db
    .select()
    .from(order)
    .where(eq(order.userId, user.id))
    .orderBy(desc(order.createdAt))

  const withItems = await Promise.all(
    orders.map(async (o) => {
      const lines = await db.select().from(orderItem).where(eq(orderItem.orderId, o.id))
      return { ...o, items: lines }
    }),
  )
  return withItems
}

export async function getOrderByNumberAction(orderNumber: string) {
  const user = await getUserId()
  const [found] = await db
    .select()
    .from(order)
    .where(and(eq(order.userId, user.id), eq(order.orderNumber, orderNumber)))
    .limit(1)
  if (!found) return null
  const lines = await db.select().from(orderItem).where(eq(orderItem.orderId, found.id))
  return { ...found, items: lines }
}
