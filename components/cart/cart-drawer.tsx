"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { X, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react"
import { useCart } from "./cart-provider"
import { formatMoney } from "@/lib/utils/format"
import { productPath } from "@/lib/routes"

export function CartDrawer() {
  const { cart, isOpen, isPending, closeCart, updateItem, removeItem } = useCart()
  const router = useRouter()

  function checkout() {
    if (!cart || cart.lines.length === 0) return
    closeCart()
    router.push("/checkout")
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-foreground/40 transition-opacity ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeCart}
        aria-hidden={!isOpen}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-background shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Shopping cart"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <ShoppingBag className="h-5 w-5" />
            My Bag {cart ? `(${cart.totalQuantity})` : ""}
          </h2>
          <button type="button" onClick={closeCart} aria-label="Close cart">
            <X className="h-6 w-6" />
          </button>
        </div>

        {!cart || cart.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Your bag is empty</p>
            <button
              type="button"
              onClick={closeCart}
              className="mt-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground"
            >
              Start Shopping
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4">
              {cart.lines.map((line) => (
                <div key={line.id} className="flex gap-3 border-b border-border py-4">
                  <Link
                    href={productPath(line.merchandise.product.handle)}
                    onClick={closeCart}
                    className="relative h-24 w-20 shrink-0 overflow-hidden rounded bg-muted"
                  >
                    {line.merchandise.image && (
                      <Image
                        src={line.merchandise.image.url || "/placeholder.svg"}
                        alt={line.merchandise.image.altText ?? line.merchandise.product.title}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col">
                    <div className="flex justify-between gap-2">
                      <Link
                        href={productPath(line.merchandise.product.handle)}
                        onClick={closeCart}
                        className="line-clamp-2 text-sm hover:underline"
                      >
                        {line.merchandise.product.title}
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(line.id)}
                        disabled={isPending}
                        aria-label="Remove item"
                        className="text-muted-foreground hover:text-sale"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {line.merchandise.title !== "Default Title" && (
                      <span className="mt-0.5 text-xs text-muted-foreground">
                        {line.merchandise.selectedOptions
                          .map((o) => o.value)
                          .join(" / ")}
                      </span>
                    )}
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center rounded-full border border-border">
                        <button
                          type="button"
                          onClick={() => updateItem(line.id, line.quantity - 1)}
                          disabled={isPending}
                          aria-label="Decrease quantity"
                          className="flex h-7 w-7 items-center justify-center"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-sm">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateItem(line.id, line.quantity + 1)}
                          disabled={isPending}
                          aria-label="Increase quantity"
                          className="flex h-7 w-7 items-center justify-center"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-sm font-bold">
                        {formatMoney(line.cost.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border px-4 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-lg font-bold">
                  {formatMoney(cart.cost.subtotalAmount)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Shipping & taxes calculated at checkout
              </p>
              <button
                type="button"
                onClick={checkout}
                disabled={isPending}
                className="mt-3 w-full rounded-full bg-accent py-3 text-sm font-bold text-accent-foreground disabled:opacity-60"
              >
                Checkout
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
