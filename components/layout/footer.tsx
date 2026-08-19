import Link from "next/link"
import { CATEGORIES } from "@/lib/categories"
import { collectionPath } from "@/lib/routes"

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-muted">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <span className="font-serif text-2xl font-extrabold">GLOWA</span>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Trendy fashion at tiny prices. New styles dropping every single day.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-bold">Shop</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {CATEGORIES.slice(0, 6).map((c) => (
                <li key={c.slug}>
                  <Link
                    href={collectionPath(c.slug)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-bold">Help</h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              <li>Shipping & Returns</li>
              <li>Size Guide</li>
              <li>Track My Order</li>
              <li>Contact Us</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-bold">Get 15% off your first order</h3>
            <p className="mt-3 text-sm text-muted-foreground">
              Sign up for drops, deals, and exclusive offers.
            </p>
            <form className="mt-3 flex gap-2">
              <input
                type="email"
                placeholder="Email address"
                aria-label="Email address"
                className="min-w-0 flex-1 rounded-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
              >
                Join
              </button>
            </form>
          </div>
        </div>
        <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} GLOWA. All prices in USD. This is a demo store.
        </div>
      </div>
    </footer>
  )
}
