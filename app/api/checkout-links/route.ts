/**
 * Mints a one-time checkout link for the shopper the call names.
 *
 * The agent hands the URL to the shopper in the chat and stops there: the address and
 * the card are entered on our page, so neither ever passes through a DM transcript.
 * Afterwards the agent reads the order back with GET /api/orders as usual.
 *
 * Same gating as every other shopper-scoped route — X-Agent-Key proves the caller,
 * X-Shopper-Email names the shopper, and ALLOW_SHOPPER_EMAIL_HEADER must be on.
 */

import { absoluteUrl } from "@/lib/api/url"
import { ApiFailure } from "@/lib/api/failure"
import { handle, json } from "@/lib/api/http"
import { callerFingerprint, consume } from "@/lib/api/rate-limit"
import { requireShopperSubject } from "@/lib/api/subject"
import { getCartForUser } from "@/lib/cart/store"
import { mintGrant } from "@/lib/checkout/grant"

/**
 * A link is a message to a shopper, so the budget is per address rather than per
 * caller: one shopper cannot be sprayed with links, and a busy integration serving many
 * shoppers is unaffected.
 */
const PER_EMAIL = { max: 5, windowMs: 10 * 60 * 1000 }

/** Coarse backstop only; shared egress means this counts traffic, not misbehaviour. */
const PER_SOURCE = { max: 600, windowMs: 10 * 60 * 1000 }

function throttle(key: string, rule: { max: number; windowMs: number }) {
  const retryAfter = consume(key, rule)
  if (retryAfter === null) return
  throw new ApiFailure(
    429,
    "rate_limited",
    "Too many checkout links requested for this shopper.",
    `Wait ${retryAfter}s, then call POST /api/checkout-links again. The link already sent is still valid until it expires.`,
  )
}

export async function POST(request: Request) {
  return handle(request, async () => {
    // 400 when no shopper is named, 401 for a bad agent key — identical to the other
    // shopper-scoped routes, so the agent branches on the same codes it already knows.
    const subject = await requireShopperSubject()

    throttle(`checkout-link:email:${subject.email ?? subject.userId}`, PER_EMAIL)
    throttle(`checkout-link:source:${callerFingerprint(request)}`, PER_SOURCE)

    // Nothing to check out is a dead end for the shopper, not something to discover
    // after they have tapped the link, so it fails here with a concrete next call.
    const cart = await getCartForUser(subject.userId)
    if (!cart || cart.lines.length === 0) {
      throw new ApiFailure(
        400,
        "order_rejected",
        "This shopper's bag is empty, so there is nothing to check out.",
        "Add at least one item first: POST /api/cart/lines with {merchandiseId, quantity} and the same X-Shopper-Email, then call POST /api/checkout-links again.",
      )
    }

    const { token, expiresAt } = await mintGrant(subject.userId)

    // Both names are a contract: a connector extracts them by literal path and breaks
    // silently if either moves.
    return json(
      {
        url: absoluteUrl(`/checkout?t=${encodeURIComponent(token)}`),
        expires_at: expiresAt.toISOString(),
      },
      201,
    )
  })
}
