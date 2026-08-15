import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ShoppingBag } from "lucide-react"
import { auth } from "@/lib/auth"
import { getCartAction } from "@/app/actions/cart"
import { formatPrice } from "@/lib/utils/format"
import { CheckoutForm } from "@/components/checkout/checkout-form"

export const metadata: Metadata = { title: "Checkout — GLOWA" }

const FREE_SHIPPING_THRESHOLD = 29
const FLAT_SHIPPING = 3.99
const TAX_RATE = 0.08

export default async function CheckoutPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login?redirect=/checkout")

  const cart = await getCartAction()

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <ShoppingBag className="h-12 w-12 text-muted-foreground" />
        <h1 className="font-serif text-2xl font-extrabold">Your bag is empty</h1>
        <p className="text-sm text-muted-foreground">Add a few pieces before checking out.</p>
        <Link
          href="/"
          className="mt-2 rounded-full bg-accent px-6 py-3 text-sm font-bold text-accent-foreground"
        >
          Start Shopping
        </Link>
      </div>
    )
  }

  const currency = cart.cost.subtotalAmount.currencyCode
  const subtotal = Number.parseFloat(cart.cost.subtotalAmount.amount)
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING
  const tax = Number((subtotal * TAX_RATE).toFixed(2))
  const total = Number((subtotal + shipping + tax).toFixed(2))

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-serif text-3xl font-extrabold">Checkout</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_400px]">
        <CheckoutForm defaultEmail={session.user.email} defaultName={session.user.name ?? ""} />

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border p-5">
            <h2 className="text-lg font-bold">Order Summary</h2>
            <ul className="mt-4 flex flex-col gap-4">
              {cart.lines.map((line) => (
                <li key={line.id} className="flex gap-3">
                  <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded bg-muted">
                    {line.merchandise.image && (
                      <Image
                        src={line.merchandise.image.url || "/placeholder.svg"}
                        alt={line.merchandise.image.altText ?? line.merchandise.product.title}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    )}
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-xs font-bold text-background">
                      {line.quantity}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span className="line-clamp-2 text-sm">{line.merchandise.product.title}</span>
                    {line.merchandise.title !== "Default Title" && (
                      <span className="text-xs text-muted-foreground">{line.merchandise.title}</span>
                    )}
                  </div>
                  <span className="text-sm font-semibold">{formatPrice(line.cost.totalAmount.amount, currency)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-5 flex flex-col gap-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatPrice(subtotal, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd>{shipping === 0 ? "Free" : formatPrice(shipping, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Estimated tax</dt>
                <dd>{formatPrice(tax, currency)}</dd>
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-3 text-base font-bold">
                <dt>Total</dt>
                <dd>{formatPrice(total, currency)}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}
