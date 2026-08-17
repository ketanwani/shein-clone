import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { order, orderItem } from "@/lib/db/schema"
import { getCart } from "@/lib/shopify/cart"

const TEST_CARD = "4242424242424242"
const FREE_SHIPPING_THRESHOLD = 29
const FLAT_SHIPPING = 3.99
const TAX_RATE = 0.08
const MAX_QTY_PER_LINE = 20

export type PlaceOrderCoreInput = {
  userId: string
  cartId: string
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

export type PlaceOrderCoreResult =
  | { ok: true; orderNumber: string }
  | { ok: false; error: string }

/**
 * Stateless order placement used by the REST API. Unlike the server action,
 * it takes an explicit `userId` and `cartId` (no cookies / session).
 * Prices and totals are recomputed from the authoritative Shopify cart.
 */
export async function placeOrderCore(input: PlaceOrderCoreInput): Promise<PlaceOrderCoreResult> {
  const required: (keyof PlaceOrderCoreInput)[] = [
    "email",
    "name",
    "address",
    "city",
    "zip",
    "country",
  ]
  for (const field of required) {
    if (!input[field]?.trim()) return { ok: false, error: "Please fill in all shipping fields." }
  }

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

  const cart = await getCart(input.cartId)
  if (!cart || cart.lines.length === 0) {
    return { ok: false, error: "Cart is empty or not found." }
  }

  const currency = cart.cost.subtotalAmount.currencyCode

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

  const [created] = await db
    .insert(order)
    .values({
      userId: input.userId,
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

  return { ok: true, orderNumber }
}

export async function getOrdersForUser(userId: string) {
  const orders = await db
    .select()
    .from(order)
    .where(eq(order.userId, userId))
    .orderBy(desc(order.createdAt))

  return Promise.all(
    orders.map(async (o) => {
      const lines = await db.select().from(orderItem).where(eq(orderItem.orderId, o.id))
      return { ...o, items: lines }
    }),
  )
}

export async function getOrderForUser(userId: string, orderNumber: string) {
  const [found] = await db
    .select()
    .from(order)
    .where(and(eq(order.userId, userId), eq(order.orderNumber, orderNumber)))
    .limit(1)
  if (!found) return null
  const lines = await db.select().from(orderItem).where(eq(orderItem.orderId, found.id))
  return { ...found, items: lines }
}
