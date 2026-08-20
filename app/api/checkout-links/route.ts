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
import { countLiveGrants, mintGrant } from "@/lib/checkout/grant"

/**
 * How many unspent links one shopper may be holding at once.
 *
 * The budget is on outstanding links rather than on mints per window, because every
 * order needs its own single-use link: a shopper working through a few items one at a
 * time is the *best* case for this endpoint, and a per-window cap would cut them off
 * mid-conversation. Completing a purchase spends the link and frees the slot, so buying
 * one thing after another never runs out.
 *
 * It still bounds spraying, and more tightly than 5-per-10-minutes did — an unused link
 * occupies its slot for the full ten minutes, so nobody can be sent more than three
 * links they did not act on.
 *
 * Locally the guard is only ever in the way, so it is lifted rather than tuned.
 */
const MAX_LIVE_LINKS = process.env.NODE_ENV === "production" ? 3 : 100

/** Coarse backstop only; shared egress means this counts traffic, not misbehaviour. */
const PER_SOURCE = { max: 600, windowMs: 10 * 60 * 1000 }

function throttle(key: string, rule: { max: number; windowMs: number }) {
  const retryAfter = consume(key, rule)
  if (retryAfter === null) return
  throw new ApiFailure(
    429,
    "rate_limited",
    "This integration is minting checkout links faster than the endpoint allows.",
    `Wait ${retryAfter}s, then call POST /api/checkout-links again. Any link already sent is still valid until it expires.`,
  )
}

export async function POST(request: Request) {
  return handle(request, async () => {
    // 400 when no shopper is named, 401 for a bad agent key — identical to the other
    // shopper-scoped routes, so the agent branches on the same codes it already knows.
    const subject = await requireShopperSubject()

    throttle(`checkout-link:source:${callerFingerprint(request)}`, PER_SOURCE)

    // Reads "you already sent them links they have not used", which is a different
    // instruction from "wait": the agent should point at the last link, not retry.
    if ((await countLiveGrants(subject.userId)) >= MAX_LIVE_LINKS) {
      throw new ApiFailure(
        429,
        "rate_limited",
        "This shopper already has the maximum number of unused checkout links open.",
        "Point them at the link you already sent — it stays valid for 10 minutes and is still good. A link frees up as soon as it is used or expires, so once they finish this order you can mint the next one straight away.",
      )
    }

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
