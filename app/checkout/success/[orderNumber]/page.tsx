import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { cookies } from "next/headers"
import { and, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { order as orderTable, orderItem } from "@/lib/db/schema"
import { getOrderByNumberAction } from "@/app/actions/orders"
import { CHECKOUT_COOKIE, grantReceipt } from "@/lib/checkout/grant"
import { formatPrice } from "@/lib/utils/format"

export const metadata: Metadata = {
  title: "Order Confirmed — GLOWA",
  robots: { index: false, follow: false, nocache: true },
}

const BACK_TO_CHAT = "https://ig.me/m/glowa.assistant"

/**
 * The order this receipt is for, when the shopper arrived from a chat link.
 *
 * Scoped to the single order the grant paid for: matched by the grant's own orderId as
 * well as the number in the URL, so the cookie cannot be pointed at another order.
 */
async function orderFromGrant(orderNumber: string) {
  const token = (await cookies()).get(CHECKOUT_COOKIE)?.value
  if (!token) return null

  const receipt = await grantReceipt(token)
  if (!receipt) return null

  const [found] = await db
    .select()
    .from(orderTable)
    .where(and(eq(orderTable.id, receipt.orderId), eq(orderTable.orderNumber, orderNumber)))
    .limit(1)
  if (!found) return null

  const items = await db.select().from(orderItem).where(eq(orderItem.orderId, found.id))
  return { ...found, items }
}

export default async function OrderSuccessPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>
}) {
  const { orderNumber } = await params

  // A shopper who came from a chat link has no account session and must not be bounced
  // to a login form. Their grant proves exactly one thing: it bought this order.
  const fromGrant = await orderFromGrant(orderNumber)

  let order = fromGrant
  if (!order) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) redirect("/login")
    order = await getOrderByNumberAction(orderNumber)
  }
  if (!order) redirect("/account")

  const currency = order.currency

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex flex-col items-center text-center">
        <CheckCircle2 className="h-14 w-14 text-accent" />
        <h1 className="mt-4 font-serif text-3xl font-extrabold text-balance">Thank you for your order!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A confirmation was sent to {order.email}. Your order number is{" "}
          <span className="font-semibold text-foreground">{order.orderNumber}</span>.
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-border p-5">
        <ul className="flex flex-col gap-4">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-3">
              <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded bg-muted">
                {item.imageUrl && (
                  <Image src={item.imageUrl || "/placeholder.svg"} alt={item.title} fill sizes="64px" className="object-cover" />
                )}
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-sm">{item.title}</span>
                {item.variantTitle && <span className="text-xs text-muted-foreground">{item.variantTitle}</span>}
                <span className="text-xs text-muted-foreground">Qty {item.quantity}</span>
              </div>
              <span className="text-sm font-semibold">
                {formatPrice(Number(item.price) * item.quantity, currency)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-5 flex flex-col gap-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatPrice(order.subtotal, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>{Number(order.shipping) === 0 ? "Free" : formatPrice(order.shipping, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tax</dt>
            <dd>{formatPrice(order.tax, currency)}</dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-3 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatPrice(order.total, currency)}</dd>
          </div>
        </dl>

        <div className="mt-5 border-t border-border pt-4 text-sm">
          <p className="font-semibold">Shipping to</p>
          <p className="mt-1 text-muted-foreground">
            {order.shippingName}
            <br />
            {order.shippingAddress}
            <br />
            {order.shippingCity}, {order.shippingZip}
            <br />
            {order.shippingCountry}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/account"
          className="rounded-full border border-border px-6 py-3 text-center text-sm font-semibold transition hover:border-foreground"
        >
          View order history
        </Link>
        <Link
          href="/"
          className="rounded-full bg-accent px-6 py-3 text-center text-sm font-bold text-accent-foreground"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  )
}
