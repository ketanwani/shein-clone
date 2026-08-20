/**
 * Product imagery for the categories the upstream demo store has no photographs for.
 *
 * mock.shop's 29 images are all apparel — there is no dress, cosmetic, jewellery or
 * homeware shot anywhere in it. Reusing a hoodie photograph for a lipstick does not read
 * as a placeholder, it reads as the wrong image, so those listings get a card naming the
 * product instead. Apparel and footwear keep the real photography.
 *
 * Generated per request rather than committed: 51 files of build output in the repo buys
 * nothing when satori renders one in a few milliseconds and the response is immutable.
 */

import { ImageResponse } from "next/og"
import { productByHandle } from "@/lib/catalogue"

export const runtime = "nodejs"

/** Portrait, matching the aspect ratio the product grid lays out for. */
const WIDTH = 900
const HEIGHT = 1200

/**
 * A muted wash per category, so a grid of them reads as a considered set rather than a
 * page of identical grey boxes. Picked to sit alongside the brand pink without competing.
 */
const TINTS: Record<string, { bg: string; ink: string; rule: string }> = {
  Dresses: { bg: "#f6eef1", ink: "#5c2a3c", rule: "#d9b9c6" },
  Beauty: { bg: "#fdf0ee", ink: "#7a3325", rule: "#e8c2b8" },
  Jewelry: { bg: "#f8f3e8", ink: "#6b5426", rule: "#ddcba4" },
  Home: { bg: "#eef2ee", ink: "#33513c", rule: "#bcd0c1" },
}

const FALLBACK = { bg: "#f2f2f2", ink: "#3d3d3d", rule: "#cfcfcf" }

export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const product = productByHandle(handle)

  if (!product) {
    return new Response("Not found", { status: 404 })
  }

  const tint = TINTS[product.productType] ?? FALLBACK

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: tint.bg,
          padding: 72,
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 10, color: tint.ink, opacity: 0.65 }}>
          GLOWA
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 132, height: 5, background: tint.rule, marginBottom: 40 }} />
          <div style={{ display: "flex", fontSize: 68, lineHeight: 1.12, color: tint.ink, fontWeight: 700 }}>
            {product.title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 30,
            color: tint.ink,
            opacity: 0.7,
          }}
        >
          <div style={{ display: "flex", letterSpacing: 4, textTransform: "uppercase" }}>
            {product.productType}
          </div>
          <div style={{ display: "flex" }}>
            {product.priceRange.minVariantPrice.currencyCode}{" "}
            {product.priceRange.minVariantPrice.amount}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // The catalogue is static and the handle is in the path, so this can be cached
        // hard. A regenerated catalogue changes the price on the card, which is cosmetic.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  )
}
