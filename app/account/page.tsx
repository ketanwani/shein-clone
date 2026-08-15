import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Package, Heart } from "lucide-react"
import { auth } from "@/lib/auth"
import { signOutAction } from "@/app/actions/account"
import { getOrdersAction } from "@/app/actions/orders"
import { formatPrice } from "@/lib/utils/format"

export const metadata: Metadata = { title: "My Account — GLOWA" }

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  const firstName = session.user.name?.split(" ")[0] ?? "there"
  const orders = await getOrdersAction()

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-extrabold">Hi, {firstName}</h1>
          <p className="text-sm text-muted-foreground">{session.user.email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-full border border-border px-5 py-2 text-sm font-semibold transition hover:border-foreground"
          >
            Sign Out
          </button>
        </form>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/wishlist"
          className="flex items-center gap-3 rounded-lg border border-border p-5 transition hover:border-foreground"
        >
          <Heart className="h-6 w-6 text-accent" />
          <div>
            <p className="font-semibold">My Wishlist</p>
            <p className="text-sm text-muted-foreground">Saved items across your devices</p>
          </div>
        </Link>
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg border border-border p-5 transition hover:border-foreground"
        >
          <Package className="h-6 w-6 text-accent" />
          <div>
            <p className="font-semibold">Keep Shopping</p>
            <p className="text-sm text-muted-foreground">Discover new drops daily</p>
          </div>
        </Link>
      </div>

      <h2 className="mb-4 mt-10 text-xl font-bold">Order History</h2>
      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border py-16 text-center">
          <Package className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">You have no orders yet.</p>
          <Link href="/" className="text-sm font-semibold text-accent hover:underline">
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-xl border border-border p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <p className="font-semibold">{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold capitalize text-accent">
                    {order.status}
                  </span>
                  <span className="font-bold">{formatPrice(order.total, order.currency)}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {order.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.productHandle ? `/products/${item.productHandle}` : "/"}
                    className="flex items-center gap-2"
                  >
                    <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded bg-muted">
                      {item.imageUrl && (
                        <Image
                          src={item.imageUrl || "/placeholder.svg"}
                          alt={item.title}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <span className="max-w-[10rem] text-xs text-muted-foreground">
                      {item.title}
                      {item.variantTitle ? ` · ${item.variantTitle}` : ""} × {item.quantity}
                    </span>
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
