"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock, CreditCard } from "lucide-react"
import { placeOrderAction } from "@/app/actions/orders"
import { useCart } from "@/components/cart/cart-provider"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent"
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"

function formatCardNumber(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim()
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function CheckoutForm({
  defaultEmail,
  defaultName,
}: {
  defaultEmail: string
  defaultName: string
}) {
  const router = useRouter()
  const { clearCart } = useCart()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [card, setCard] = useState("4242 4242 4242 4242")
  const [expiry, setExpiry] = useState("12/34")
  const [cvc, setCvc] = useState("123")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(e.currentTarget)
    const result = await placeOrderAction({
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? ""),
      address: String(form.get("address") ?? ""),
      city: String(form.get("city") ?? ""),
      zip: String(form.get("zip") ?? ""),
      country: String(form.get("country") ?? ""),
      cardNumber: card,
      expiry,
      cvc,
    })

    if (!result.ok) {
      setError(result.error)
      setPending(false)
      return
    }

    clearCart()
    router.push(`/checkout/success/${result.orderNumber}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
        <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p>
          <span className="font-semibold">Test mode.</span> No real payment is taken. Use card{" "}
          <span className="font-mono font-semibold">4242 4242 4242 4242</span> with any future expiry and any CVC.
        </p>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-bold">Contact & Shipping</legend>
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" name="email" type="email" required defaultValue={defaultEmail} className={inputClass} />
        </div>
        <div>
          <label htmlFor="name" className={labelClass}>Full name</label>
          <input id="name" name="name" required defaultValue={defaultName} className={inputClass} />
        </div>
        <div>
          <label htmlFor="address" className={labelClass}>Address</label>
          <input id="address" name="address" required placeholder="123 Main St" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="city" className={labelClass}>City</label>
            <input id="city" name="city" required placeholder="New York" className={inputClass} />
          </div>
          <div>
            <label htmlFor="zip" className={labelClass}>ZIP</label>
            <input id="zip" name="zip" required placeholder="10001" className={inputClass} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="country" className={labelClass}>Country</label>
            <input id="country" name="country" required defaultValue="United States" className={inputClass} />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-bold">Payment</legend>
        <div>
          <label htmlFor="card" className={labelClass}>Card number</label>
          <input
            id="card"
            inputMode="numeric"
            autoComplete="cc-number"
            value={card}
            onChange={(e) => setCard(formatCardNumber(e.target.value))}
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="expiry" className={labelClass}>Expiry (MM/YY)</label>
            <input
              id="expiry"
              inputMode="numeric"
              autoComplete="cc-exp"
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="cvc" className={labelClass}>CVC</label>
            <input
              id="cvc"
              inputMode="numeric"
              autoComplete="cc-csc"
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-full bg-accent py-4 text-sm font-bold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
      >
        <Lock className="h-4 w-4" />
        {pending ? "Processing payment..." : "Pay now"}
      </button>
    </form>
  )
}
