import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// GET /api/v1/openapi — machine-readable OpenAPI 3.1 spec for the GLOWA REST API.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "GLOWA Storefront API",
      version: "1.0.0",
      description:
        "REST API for browsing products, managing a cart, placing (simulated) orders, and managing a wishlist. " +
        "All endpoints require a per-user API key generated from the account page.",
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Send your API key as 'Authorization: Bearer glowa_sk_...'.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
        Money: { type: "string", description: "Decimal amount as a string, e.g. '19.99'." },
        Product: {
          type: "object",
          properties: {
            id: { type: "string" },
            handle: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            productType: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            availableForSale: { type: "boolean" },
            featuredImage: { type: ["string", "null"] },
            images: { type: "array", items: { type: "string" } },
            price: {
              type: "object",
              properties: { min: { $ref: "#/components/schemas/Money" }, max: { $ref: "#/components/schemas/Money" }, currency: { type: "string" } },
            },
            variants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "variantId — pass this to /cart/lines." },
                  title: { type: "string" },
                  availableForSale: { type: "boolean" },
                  price: { $ref: "#/components/schemas/Money" },
                  options: { type: "array", items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } } } },
                },
              },
            },
          },
        },
        Cart: {
          type: "object",
          properties: {
            id: { type: ["string", "null"] },
            totalQuantity: { type: "integer" },
            cost: { type: ["object", "null"], properties: { subtotal: { $ref: "#/components/schemas/Money" }, total: { $ref: "#/components/schemas/Money" }, currency: { type: "string" } } },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  lineId: { type: "string", description: "Use to update/remove this line." },
                  variantId: { type: "string" },
                  productHandle: { type: "string" },
                  title: { type: "string" },
                  variantTitle: { type: "string" },
                  quantity: { type: "integer" },
                  lineTotal: { $ref: "#/components/schemas/Money" },
                },
              },
            },
          },
        },
        Order: {
          type: "object",
          properties: {
            orderNumber: { type: "string" },
            status: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            email: { type: "string" },
            totals: { type: "object", properties: { subtotal: { $ref: "#/components/schemas/Money" }, shipping: { $ref: "#/components/schemas/Money" }, tax: { $ref: "#/components/schemas/Money" }, total: { $ref: "#/components/schemas/Money" }, currency: { type: "string" } } },
            items: { type: "array", items: { type: "object", properties: { title: { type: "string" }, variantTitle: { type: ["string", "null"] }, quantity: { type: "integer" }, price: { $ref: "#/components/schemas/Money" }, productHandle: { type: ["string", "null"] } } } },
          },
        },
      },
    },
    paths: {
      "/products": {
        get: {
          summary: "List / search products",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Search query." },
            { name: "sort", in: "query", schema: { type: "string", enum: ["best_selling", "newest", "price_asc", "price_desc", "relevance"] } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
          ],
          responses: {
            "200": { description: "Matching products", content: { "application/json": { schema: { type: "object", properties: { products: { type: "array", items: { $ref: "#/components/schemas/Product" } }, count: { type: "integer" } } } } } },
            "401": { description: "Missing/invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/products/{handle}": {
        get: {
          summary: "Get a single product",
          parameters: [{ name: "handle", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "The product", content: { "application/json": { schema: { type: "object", properties: { product: { $ref: "#/components/schemas/Product" } } } } } },
            "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/cart": {
        get: { summary: "Get the current cart", responses: { "200": { description: "The cart", content: { "application/json": { schema: { type: "object", properties: { cart: { $ref: "#/components/schemas/Cart" } } } } } } } },
        delete: { summary: "Empty the cart", responses: { "200": { description: "Emptied cart", content: { "application/json": { schema: { type: "object", properties: { cart: { $ref: "#/components/schemas/Cart" } } } } } } } },
      },
      "/cart/lines": {
        post: {
          summary: "Add an item to the cart",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["variantId"], properties: { variantId: { type: "string" }, quantity: { type: "integer", default: 1 } } } } } },
          responses: { "201": { description: "Updated cart", content: { "application/json": { schema: { type: "object", properties: { cart: { $ref: "#/components/schemas/Cart" } } } } } } },
        },
        patch: {
          summary: "Set a line's quantity (0 removes it)",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["lineId", "quantity"], properties: { lineId: { type: "string" }, quantity: { type: "integer" } } } } } },
          responses: { "200": { description: "Updated cart", content: { "application/json": { schema: { type: "object", properties: { cart: { $ref: "#/components/schemas/Cart" } } } } } } },
        },
        delete: {
          summary: "Remove a line",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["lineId"], properties: { lineId: { type: "string" } } } } } },
          responses: { "200": { description: "Updated cart", content: { "application/json": { schema: { type: "object", properties: { cart: { $ref: "#/components/schemas/Cart" } } } } } } },
        },
      },
      "/checkout": {
        post: {
          summary: "Place a simulated order from the cart",
          description: "Recomputes totals server-side. Use test card 4242 4242 4242 4242 to succeed; any other number is declined with HTTP 400.",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "name", "address", "city", "zip", "country", "cardNumber", "expiry", "cvc"], properties: { email: { type: "string" }, name: { type: "string" }, address: { type: "string" }, city: { type: "string" }, zip: { type: "string" }, country: { type: "string" }, cardNumber: { type: "string", example: "4242424242424242" }, expiry: { type: "string", example: "12/28" }, cvc: { type: "string", example: "123" } } } } } },
          responses: {
            "201": { description: "Order placed", content: { "application/json": { schema: { type: "object", properties: { order: { $ref: "#/components/schemas/Order" } } } } } },
            "400": { description: "Declined card, empty cart, or validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/orders": {
        get: { summary: "List the user's orders", responses: { "200": { description: "Orders", content: { "application/json": { schema: { type: "object", properties: { orders: { type: "array", items: { $ref: "#/components/schemas/Order" } }, count: { type: "integer" } } } } } } } },
      },
      "/orders/{orderNumber}": {
        get: {
          summary: "Get one order",
          parameters: [{ name: "orderNumber", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "The order", content: { "application/json": { schema: { type: "object", properties: { order: { $ref: "#/components/schemas/Order" } } } } } },
            "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/wishlist": {
        get: { summary: "Get wishlist handles and products", responses: { "200": { description: "Wishlist", content: { "application/json": { schema: { type: "object", properties: { handles: { type: "array", items: { type: "string" } }, products: { type: "array", items: { $ref: "#/components/schemas/Product" } } } } } } } } },
        post: {
          summary: "Add a product to the wishlist",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["productHandle"], properties: { productHandle: { type: "string" } } } } } },
          responses: { "201": { description: "Updated handles", content: { "application/json": { schema: { type: "object", properties: { handles: { type: "array", items: { type: "string" } } } } } } } },
        },
        delete: {
          summary: "Remove a product from the wishlist",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["productHandle"], properties: { productHandle: { type: "string" } } } } } },
          responses: { "200": { description: "Updated handles", content: { "application/json": { schema: { type: "object", properties: { handles: { type: "array", items: { type: "string" } } } } } } } },
        },
      },
    },
  }

  return NextResponse.json(spec)
}
