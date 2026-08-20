/**
 * Moves a checkout token out of the URL and into a cookie.
 *
 * `proxy.ts`, not `middleware.ts` — the latter is deprecated in Next 16 and renamed.
 *
 * This runs here rather than in the page because a Server Component cannot set a
 * cookie: Next only allows that in a Route Handler or Server Function, and /checkout
 * has to stay a page. The proxy is the one place that can both write the cookie and
 * redirect in a single response.
 *
 * The redirect is the point. A token left in the address bar leaks through browser
 * history, Referer headers on any outbound link, screenshots the shopper sends back to
 * the chat, and analytics. One 302 removes all of that before the page renders.
 *
 * The token is only moved here, never checked: validating it needs the database, and
 * the page does that on the very next request anyway. An invalid token therefore sets a
 * cookie that resolves to nothing and renders the expired page, which is the same
 * outcome by a shorter route.
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { CHECKOUT_COOKIE, CHECKOUT_COOKIE_PATH, SESSION_TTL_MS } from "@/lib/checkout/grant"

export function proxy(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t")
  if (!token) return

  const clean = new URL(request.nextUrl)
  clean.searchParams.delete("t")

  const response = NextResponse.redirect(clean, 302)
  response.cookies.set(CHECKOUT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Scoped to the checkout page, so the browser never attaches it to /api/*. A grant
    // cannot reach the order history or the wishlist even by accident.
    path: CHECKOUT_COOKIE_PATH,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })

  // Nothing should cache a redirect that hands out a session cookie.
  response.headers.set("Cache-Control", "no-store")
  return response
}

export const config = { matcher: "/checkout" }
