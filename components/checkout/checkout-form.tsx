"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock, CreditCard } from "lucide-react"
import { placeOrderAction, submitGrantCheckoutAction } from "@/app/actions/orders"
import { useCart } from "@/components/cart/cart-provider"
import type { AddressPayload } from "@/lib/api/customer"

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
  mode = "session",
  addresses = [],
  backToChatUrl,
}: {
  defaultEmail: string
  defaultName: string
  /** "grant" is a shopper arriving from a chat link, with no account session. */
  mode?: "session" | "grant"
  addresses?: AddressPayload[]
  backToChatUrl?: string
}) {
  const router = useRouter()
  const { clearCart } = useCart()
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [pending, setPending] = useState(false)
  const [card, setCard] = useState("4242 4242 4242 4242")
  const [expiry, setExpiry] = useState("12/34")
  const [cvc, setCvc] = useState("123")

  const saved = addresses.find((a) => a.is_default) ?? addresses[0] ?? null
  // Default to the saved address when there is one, so a returning shopper only has to
  // confirm. "new" opens the inline fields.
  const [addressId, setAddressId] = useState<string>(saved ? saved.id : "new")
  const usingSaved = mode === "grant" && addressId !== "new"

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(e.currentTarget)
    const shipping = usingSaved
      ? { addressId, address: null, city: null, zip: null, country: null }
      : {
          addressId: null,
          address: String(form.get("address") ?? ""),
          city: String(form.get("city") ?? ""),
          zip: String(form.get("zip") ?? ""),
          country: String(form.get("country") ?? ""),
        }

    // Two entry points, one order path behind them. The grant action takes no email and
    // no shopper id: it reads both from the httpOnly cookie, so nothing here can name a
    // different shopper.
    const result =
      mode === "grant"
        ? await submitGrantCheckoutAction({
            name: String(form.get("name") ?? ""),
            ...shipping,
            cardNumber: card,
            expiry,
            cvc,
          })
        : await placeOrderAction({
            email: String(form.get("email") ?? ""),
            name: String(form.get("name") ?? ""),
            address: shipping.address ?? "",
            city: shipping.city ?? "",
            zip: shipping.zip ?? "",
            country: shipping.country ?? "",
            cardNumber: card,
            expiry,
            cvc,
          })

    if (!result.ok) {
      setError(result.error)
      if ("expired" in result && result.expired) setExpired(true)
      setPending(false)
      return
    }

    clearCart()
    router.push(`/checkout/success/${result.orderNumber}${mode === "grant" ? "?from=link" : ""}`)
  }

  // A link that died mid-form: the form is useless now, so replace it rather than
  // leaving the shopper retrying a submit that cannot succeed.
  if (expired) {
    return (
      <div className="rounded-xl border border-border p-6 text-center">
        <h2 className="font-serif text-xl font-extrabold">This checkout link has expired</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Each link is good for a short while and a single order. Head back to the chat and ask for a new one — your
          bag is still there.
        </p>
        {backToChatUrl && (
          <a
            href={backToChatUrl}
            className="mt-5 inline-block rounded-full bg-accent px-6 py-3 text-sm font-bold text-accent-foreground"
          >
            Back to chat
          </a>
        )}
      </div>
    )
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
        {mode === "grant" ? (
          // The address is on the account already; asking again invites a typo that
          // detaches the order from the shopper the agent is talking to.
          <p className="text-sm text-muted-foreground">
            Sending your confirmation to <span className="font-semibold text-foreground">{defaultEmail}</span>.
          </p>
        ) : (
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" name="email" type="email" required defaultValue={defaultEmail} className={inputClass} />
          </div>
        )}
        <div>
          <label htmlFor="name" className={labelClass}>Full name</label>
          <input id="name" name="name" required defaultValue={defaultName} className={inputClass} />
        </div>
        {mode === "grant" && addresses.length > 0 && (
          <div>
            <label htmlFor="savedAddress" className={labelClass}>Ship to</label>
            <select
              id="savedAddress"
              value={addressId}
              onChange={(e) => setAddressId(e.target.value)}
              className={inputClass}
            >
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {[a.label, a.line1, a.city, a.zip, a.country].filter(Boolean).join(", ")}
                </option>
              ))}
              <option value="new">Use a different address…</option>
            </select>
          </div>
        )}

        {!usingSaved && (
          <div>
            <label htmlFor="address" className={labelClass}>Address</label>
            <input id="address" name="address" required placeholder="123 Main St" className={inputClass} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" hidden={usingSaved}>
          <div>
            <label htmlFor="city" className={labelClass}>City</label>
            <input id="city" name="city" required placeholder="New York" className={inputClass} />
          </div>
          <div>
            <label htmlFor="zip" className={labelClass}>ZIP</label>
            <input id="zip" name="zip" required={!usingSaved} placeholder="10001" className={inputClass} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="country" className={labelClass}>Country</label>
            <input id="country" name="country" required={!usingSaved} defaultValue="United States" className={inputClass} />
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
