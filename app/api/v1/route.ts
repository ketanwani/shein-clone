import { json } from "@/lib/api/helpers"

// Public discovery endpoint (no auth) describing the REST surface.
export async function GET() {
  return json({
    name: "Glowa Storefront REST API",
    version: "v1",
    auth: "Send 'Authorization: Bearer <GLOWA_API_KEY>' on every endpoint below.",
    endpoints: {
      products: {
        list: "GET /api/v1/products?query=&sortKey=&reverse=&first=",
        get: "GET /api/v1/products/{handle}",
      },
      collections: {
        list: "GET /api/v1/collections",
        get: "GET /api/v1/collections/{slug}?first=",
      },
      cart: {
        create: "POST /api/v1/cart",
        get: "GET /api/v1/cart?cartId=",
        addLine: "POST /api/v1/cart/lines  { cartId?, merchandiseId, quantity? }",
        updateLine: "PATCH /api/v1/cart/lines  { cartId, lineId, quantity }",
        removeLine: "DELETE /api/v1/cart/lines  { cartId, lineId }",
      },
      wishlist: {
        list: "GET /api/v1/wishlist?userId=|email=&expand=products",
        add: "POST /api/v1/wishlist  { userId|email, handle }",
        remove: "DELETE /api/v1/wishlist  { userId|email, handle }",
      },
      orders: {
        list: "GET /api/v1/orders?userId=|email=",
        get: "GET /api/v1/orders/{orderNumber}?userId=|email=",
        place:
          "POST /api/v1/orders  { userId|email, cartId, email, name, address, city, zip, country, cardNumber, expiry, cvc }",
      },
    },
    notes: [
      "merchandiseId is a Shopify variant GID from a product's variants[].id.",
      "Cart is stateless: create a cart, then pass its id back on every cart call.",
      "Checkout uses the Stripe-style test card 4242 4242 4242 4242.",
      "Order/wishlist users are identified by userId or email (no browser session).",
    ],
  })
}
