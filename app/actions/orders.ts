"use server"

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { requireSubject } from "@/lib/api/subject"
import { order, orderIdempotency, orderItem } from "@/lib/db/schema"
import { getCartAction, clearCartAction } from "@/app/actions/cart"

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
  email: string
  name: string
  address: string
  city: string
  zip: string
  country: string
  cardNumber: string
  expiry: string
  cvc: string
}

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; replayed: boolean }
  | { ok: false; error: string }

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
  const user = await getUserId()

  if (idempotencyKey) {
    const previous = await replayedOrderNumber(user.id, idempotencyKey)
    if (previous) return { ok: true, orderNumber: previous, replayed: true }
  }

  // Basic required-field validation
  const required: (keyof PlaceOrderInput)[] = ["email", "name", "address", "city", "zip", "country"]
  for (const field of required) {
    if (!input[field]?.trim()) return { ok: false, error: "Please fill in all shipping fields." }
  }

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
  const cart = await getCartAction()
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

  try {
    return await writeOrder(user.id, orderNumber, input, { items, subtotal, shipping, tax, total, currency, digits })
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
  input: PlaceOrderInput,
  { items, subtotal, shipping, tax, total, currency, digits }: OrderTotals,
): Promise<PlaceOrderResult> {
  const [created] = await db
    .insert(order)
    .values({
      userId,
      orderNumber,
      email: input.email.trim(),
      shippingName: input.name.trim(),
      shippingAddress: input.address.trim(),
      shippingCity: input.city.trim(),
      shippingZip: input.zip.trim(),
      shippingCountry: input.country.trim(),
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
  await clearCartAction()

  return { ok: true, orderNumber, replayed: false }
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
