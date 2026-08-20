import { redirect } from "next/navigation"
import { cookies, headers } from "next/headers"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ShoppingBag, LinkIcon } from "lucide-react"
import { auth } from "@/lib/auth"
import { getCartAction } from "@/app/actions/cart"
import { getCartForUser } from "@/lib/cart/store"
import { getProfile, listAddresses } from "@/lib/api/customer"
import { CHECKOUT_COOKIE, checkCheckoutSession } from "@/lib/checkout/grant"
import { formatPrice } from "@/lib/utils/format"
import { CheckoutForm } from "@/components/checkout/checkout-form"
import type { AddressPayload } from "@/lib/api/customer"
import type { Cart } from "@/lib/shopify/types"

/**
 * Never indexed and never unfurled. The URL that reaches this page carries a checkout
 * token in the query string on first hit, and a preview card built from it would put a
 * thumbnail of somebody's basket into a chat thread.
 */
export const metadata: Metadata = {
  title: "Checkout — GLOWA",
  robots: { index: false, follow: false, nocache: true },
}

/** Where the shopper goes back to once they are done. */
const BACK_TO_CHAT = "https://ig.me/m/glowa.assistant"

const FREE_SHIPPING_THRESHOLD = 29
const FLAT_SHIPPING = 3.99
const TAX_RATE = 0.08

type Viewer =
  | { kind: "session"; userId: string; email: string; name: string }
  | { kind: "grant"; userId: string; email: string; name: string; addresses: AddressPayload[] }
  | { kind: "expired" }
  | { kind: "anonymous" }

/**
 * Who is checking out.
 *
 * The grant cookie is tried first: a shopper arriving from a chat link has no account
 * session, and should not be bounced to a login form they cannot complete. A cookie
 * that no longer resolves means an expired or spent link, which gets its own page
 * rather than a redirect.
 */
async function resolveViewer(): Promise<Viewer> {
  const token = (await cookies()).get(CHECKOUT_COOKIE)?.value

  if (token) {
    const check = await checkCheckoutSession(token)
    if (!check.ok) return { kind: "expired" }

    const [profile, addresses] = await Promise.all([
      getProfile(check.grant.userId),
      listAddresses(check.grant.userId),
    ])
    return {
      kind: "grant",
      userId: check.grant.userId,
      email: profile.email ?? "",
      name: profile.name ?? "",
      addresses,
    }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { kind: "anonymous" }
  return {
    kind: "session",
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name ?? "",
  }
}

export default async function CheckoutPage() {
  const viewer = await resolveViewer()

  if (viewer.kind === "expired") return <ExpiredLink />
  if (viewer.kind === "anonymous") redirect("/login?redirect=/checkout")

  // The live bag, not a snapshot taken when the link was minted — anything added after
  // the agent sent the link has to be in here, or the shopper silently loses it.
  const cart =
    viewer.kind === "grant" ? await getCartForUser(viewer.userId) : await getCartAction()

  if (!cart || cart.lines.length === 0) return <EmptyBag fromLink={viewer.kind === "grant"} />

  const currency = cart.cost.subtotalAmount.currencyCode
  const subtotal = Number.parseFloat(cart.cost.subtotalAmount.amount)
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING
  const tax = Number((subtotal * TAX_RATE).toFixed(2))
  const total = Number((subtotal + shipping + tax).toFixed(2))

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-serif text-3xl font-extrabold">Checkout</h1>
      {viewer.kind === "grant" && (
        <p className="mt-2 text-sm text-muted-foreground">
          Checking out as <span className="font-semibold text-foreground">{viewer.email}</span>. Your card details
          stay on this page — they are never sent back to the chat.
        </p>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_400px]">
        <CheckoutForm
          mode={viewer.kind === "grant" ? "grant" : "session"}
          defaultEmail={viewer.email}
          defaultName={viewer.name}
          addresses={viewer.kind === "grant" ? viewer.addresses : []}
          backToChatUrl={BACK_TO_CHAT}
        />

        <OrderSummary cart={cart} currency={currency} subtotal={subtotal} shipping={shipping} tax={tax} total={total} />
      </div>
    </div>
  )
}

function ExpiredLink() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <LinkIcon className="h-12 w-12 text-muted-foreground" />
      <h1 className="font-serif text-2xl font-extrabold">This checkout link has expired</h1>
      <p className="text-sm text-muted-foreground">
        Checkout links are good for a short while, and each one can be used for a single order. Head back to the
        chat and ask for a new one — your bag is still there.
      </p>
      <a
        href={BACK_TO_CHAT}
        className="mt-2 rounded-full bg-accent px-6 py-3 text-sm font-bold text-accent-foreground"
      >
        Back to chat
      </a>
    </div>
  )
}

function EmptyBag({ fromLink }: { fromLink: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <ShoppingBag className="h-12 w-12 text-muted-foreground" />
      <h1 className="font-serif text-2xl font-extrabold">Your bag is empty</h1>
      <p className="text-sm text-muted-foreground">
        {fromLink ? "Head back to the chat and add something first." : "Add a few pieces before checking out."}
      </p>
      {fromLink ? (
        <a href={BACK_TO_CHAT} className="mt-2 rounded-full bg-accent px-6 py-3 text-sm font-bold text-accent-foreground">
          Back to chat
        </a>
      ) : (
        <Link href="/" className="mt-2 rounded-full bg-accent px-6 py-3 text-sm font-bold text-accent-foreground">
          Start Shopping
        </Link>
      )}
    </div>
  )
}

function OrderSummary({
  cart,
  currency,
  subtotal,
  shipping,
  tax,
  total,
}: {
  cart: Cart
  currency: string
  subtotal: number
  shipping: number
  tax: number
  total: number
}) {
  return (
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
  )
}
