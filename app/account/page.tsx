import { redirect } from "next/navigation"
import type { Metadata } from "next"
import Image from "next/image"
import { Package } from "lucide-react"
import { getCurrentCustomer, getCustomerToken, signOutAction } from "@/app/actions/auth"
import { getCustomerOrders } from "@/lib/shopify/customer"
import { formatMoney } from "@/lib/utils/format"

export const metadata: Metadata = { title: "My Account — GLOWA" }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

export default async function AccountPage() {
  const customer = await getCurrentCustomer()
  if (!customer) redirect("/login")

  const token = await getCustomerToken()
  const orders = token ? await getCustomerOrders(token) : []

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-extrabold">
            Hi, {customer.firstName ?? "there"}
          </h1>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
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

      <h2 className="mb-4 mt-10 text-xl font-bold">Order History</h2>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border py-16 text-center">
          <Package className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">You have no orders yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <span className="font-semibold">Order #{order.orderNumber}</span>
                  <span className="ml-3 text-sm text-muted-foreground">
                    {formatDate(order.processedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {order.fulfillmentStatus && (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize">
                      {order.fulfillmentStatus.toLowerCase().replace(/_/g, " ")}
                    </span>
                  )}
                  <span className="font-bold">{formatMoney(order.totalPrice)}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {order.lineItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded bg-muted">
                      {item.image && (
                        <Image
                          src={item.image.url || "/placeholder.svg"}
                          alt={item.image.altText ?? item.title}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                    </div>
                    <span className="text-sm font-medium">{formatMoney(item.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
