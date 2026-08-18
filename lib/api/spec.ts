/**
 * Single source of truth for the public REST API.
 *
 * The rendered docs page (/docs/api), the raw markdown (/docs/api/raw) and the
 * OpenAPI document (/api/openapi.json) are all generated from this file, so they
 * cannot drift apart. When you add or change a route handler under app/api/,
 * update the matching entry here.
 */

/**
 * "cart"    — agent headers, a bearer token, or the anonymous cartId cookie.
 * "session" — agent headers or a bearer token; there is no anonymous form.
 * "bearer"  — a bearer token only. Better Auth owns these routes and knows nothing
 *             about the agent headers, so advertising the agent path there would lie.
 */
export type ApiAuth = "public" | "cart" | "session" | "bearer"

export type JsonSchema = Record<string, unknown>

export type ApiParam = {
  name: string
  in: "path" | "query" | "header"
  type: "string" | "integer"
  required?: boolean
  description: string
  /** Used verbatim when generating curl examples. */
  example: string | number
  enum?: string[]
  default?: string | number
}

export type ApiBodyField = {
  name: string
  type: "string" | "integer"
  required?: boolean
  description: string
  example: string | number
}

export type ApiResponse = {
  status: number
  description: string
  schema?: JsonSchema
  example?: unknown
  /** Rendered under the example when it is abbreviated for length. */
  exampleNote?: string
}

export type ApiEndpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE"
  path: string
  summary: string
  description: string
  auth: ApiAuth
  params?: ApiParam[]
  body?: ApiBodyField[]
  responses: ApiResponse[]
  notes?: string[]
}

export type ApiGroup = {
  name: string
  slug: string
  description: string
  endpoints: ApiEndpoint[]
}

export const API_TITLE = "GLOWA Storefront API"
export const API_VERSION = "1.0.0"
export const DEFAULT_BASE_URL = "http://localhost:3000"

export const AUTH_LABELS: Record<ApiAuth, string> = {
  public: "Public — no credentials",
  cart: "Agent headers, a bearer token, or the anonymous cart cookie",
  session: "Agent headers, or a bearer token",
  bearer: "Bearer token or session cookie — no agent path",
}

/** Documented on every endpoint an agent can call, so the two headers are never implicit. */
export const AGENT_KEY_PARAM: ApiParam = {
  name: "X-Agent-Key",
  in: "header",
  type: "string",
  required: true,
  description:
    "Shared secret issued by GLOWA, proving the caller is the agent. Compared in constant time against the server's AGENT_API_KEY list, so keys can be rotated without downtime. Outside production the well-known key `dev-agent-key` also works.",
  example: "$AGENT_KEY",
}

export const CUSTOMER_REF_PARAM: ApiParam = {
  name: "X-Customer-Ref",
  in: "header",
  type: "string",
  required: true,
  description:
    "Opaque, stable id for the shopper this call is for (e.g. an Instagram-scoped user id). Treated as a bare string — never parsed, and never an email address.",
  example: "ig_17841400000000000",
}

const AGENT_HEADERS: ApiParam[] = [AGENT_KEY_PARAM, CUSTOMER_REF_PARAM]

// --- JSON Schema components ------------------------------------------------

const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` })
const arrayOf = (schema: JsonSchema): JsonSchema => ({ type: "array", items: schema })
const str = (description?: string): JsonSchema => ({ type: "string", ...(description ? { description } : {}) })
const int = (description?: string): JsonSchema => ({ type: "integer", ...(description ? { description } : {}) })
const bool = (description?: string): JsonSchema => ({ type: "boolean", ...(description ? { description } : {}) })
const nullable = (schema: JsonSchema): JsonSchema => ({ oneOf: [schema, { type: "null" }] })

const obj = (properties: Record<string, JsonSchema>, required?: string[]): JsonSchema => ({
  type: "object",
  properties,
  ...(required ? { required } : {}),
})

export const SCHEMAS: Record<string, JsonSchema> = {
  Money: obj({ amount: str("Decimal string, e.g. \"12.99\""), currencyCode: str("ISO 4217, e.g. \"USD\"") }, [
    "amount",
    "currencyCode",
  ]),
  ProductImage: obj({
    url: str(),
    altText: nullable(str()),
    width: nullable(int()),
    height: nullable(int()),
  }),
  ProductOption: obj({ id: str(), name: str("e.g. \"Size\""), values: arrayOf(str()) }),
  ProductVariant: obj({
    id: str("Shopify variant GID. This is the merchandiseId used when adding to the bag."),
    title: str(),
    availableForSale: bool(),
    selectedOptions: arrayOf(obj({ name: str(), value: str() })),
    price: ref("Money"),
    compareAtPrice: nullable(ref("Money")),
  }),
  Product: obj({
    id: str("Shopify product GID"),
    handle: str("URL-safe slug; the identifier used by these endpoints"),
    title: str(),
    description: str("Plain text"),
    descriptionHtml: str(),
    productType: str(),
    tags: arrayOf(str()),
    availableForSale: bool(),
    featuredImage: nullable(ref("ProductImage")),
    images: arrayOf(ref("ProductImage")),
    options: arrayOf(ref("ProductOption")),
    variants: arrayOf(ref("ProductVariant")),
    priceRange: obj({ minVariantPrice: ref("Money"), maxVariantPrice: ref("Money") }),
    compareAtPriceRange: obj({ minVariantPrice: ref("Money"), maxVariantPrice: ref("Money") }),
  }),
  CartLine: obj({
    id: str("Cart line GID. Pass this as lineId when updating or removing."),
    quantity: int(),
    cost: obj({ totalAmount: ref("Money") }),
    merchandise: obj({
      id: str("Variant GID"),
      title: str(),
      selectedOptions: arrayOf(obj({ name: str(), value: str() })),
      image: nullable(ref("ProductImage")),
      product: obj({ handle: str(), title: str() }),
    }),
  }),
  Cart: obj({
    id: str(),
    checkoutUrl: str("Shopify-hosted checkout. This API's own checkout is POST /api/orders."),
    totalQuantity: int(),
    cost: obj({ subtotalAmount: ref("Money"), totalAmount: ref("Money") }),
    lines: arrayOf(ref("CartLine")),
  }),
  OrderItem: obj({
    id: int(),
    orderId: int(),
    title: str(),
    variantTitle: nullable(str()),
    quantity: int(),
    price: str("Unit price as a decimal string"),
    imageUrl: nullable(str()),
    productHandle: nullable(str()),
  }),
  Order: obj({
    id: int(),
    userId: str(),
    orderNumber: str("Human-facing identifier, e.g. \"GLW-12345678\""),
    email: str(),
    shippingName: str(),
    shippingAddress: str(),
    shippingCity: str(),
    shippingZip: str(),
    shippingCountry: str(),
    subtotal: str(),
    shipping: str("0 when the subtotal is at least 29"),
    tax: str("8% of the subtotal"),
    total: str(),
    currency: str(),
    cardLast4: nullable(str()),
    status: str("\"paid\""),
    createdAt: str("ISO 8601 timestamp"),
    items: arrayOf(ref("OrderItem")),
  }),
  Error: obj(
    {
      error: obj(
        {
          code: str("Stable machine-readable code, e.g. \"not_found\""),
          message: str("Human-readable explanation"),
          hint: str("Present when there is a concrete next step"),
        },
        ["code", "message"],
      ),
    },
    ["error"],
  ),
}

// --- Examples --------------------------------------------------------------

export const PRODUCT_EXAMPLE = {
  id: "gid://shopify/Product/8123456789",
  handle: "ribbed-knit-mini-dress",
  title: "Ribbed Knit Mini Dress",
  description: "Bodycon mini dress in soft ribbed knit with a square neckline.",
  descriptionHtml: "<p>Bodycon mini dress in soft ribbed knit with a square neckline.</p>",
  productType: "Dresses",
  tags: ["Women", "New In", "Sale"],
  availableForSale: true,
  featuredImage: {
    url: "https://cdn.shopify.com/s/files/1/0000/dress-front.jpg",
    altText: "Ribbed knit mini dress",
    width: 1200,
    height: 1600,
  },
  images: [
    {
      url: "https://cdn.shopify.com/s/files/1/0000/dress-front.jpg",
      altText: "Ribbed knit mini dress",
      width: 1200,
      height: 1600,
    },
  ],
  options: [{ id: "gid://shopify/ProductOption/1001", name: "Size", values: ["S", "M", "L"] }],
  variants: [
    {
      id: "gid://shopify/ProductVariant/44123456789",
      title: "M",
      availableForSale: true,
      selectedOptions: [{ name: "Size", value: "M" }],
      price: { amount: "12.99", currencyCode: "USD" },
      compareAtPrice: { amount: "29.99", currencyCode: "USD" },
    },
  ],
  priceRange: {
    minVariantPrice: { amount: "12.99", currencyCode: "USD" },
    maxVariantPrice: { amount: "12.99", currencyCode: "USD" },
  },
  compareAtPriceRange: {
    minVariantPrice: { amount: "29.99", currencyCode: "USD" },
    maxVariantPrice: { amount: "29.99", currencyCode: "USD" },
  },
}

const PRODUCT_BRIEF = {
  id: "gid://shopify/Product/8123456789",
  handle: "ribbed-knit-mini-dress",
  title: "Ribbed Knit Mini Dress",
  productType: "Dresses",
  availableForSale: true,
  priceRange: { minVariantPrice: { amount: "12.99", currencyCode: "USD" } },
  variants: [{ id: "gid://shopify/ProductVariant/44123456789", title: "M", availableForSale: true }],
}

const ABBREVIATED = "Product objects are abbreviated here. Every field in the Product schema is returned."

export const CART_EXAMPLE = {
  id: "gid://shopify/Cart/c1-abc123",
  checkoutUrl: "https://your-store.myshopify.com/cart/c/c1-abc123",
  totalQuantity: 2,
  cost: {
    subtotalAmount: { amount: "25.98", currencyCode: "USD" },
    totalAmount: { amount: "25.98", currencyCode: "USD" },
  },
  lines: [
    {
      id: "gid://shopify/CartLine/line-1",
      quantity: 2,
      cost: { totalAmount: { amount: "25.98", currencyCode: "USD" } },
      merchandise: {
        id: "gid://shopify/ProductVariant/44123456789",
        title: "M",
        selectedOptions: [{ name: "Size", value: "M" }],
        image: { url: "https://cdn.shopify.com/s/files/1/0000/dress-front.jpg", altText: null, width: 1200, height: 1600 },
        product: { handle: "ribbed-knit-mini-dress", title: "Ribbed Knit Mini Dress" },
      },
    },
  ],
}

const ORDER_EXAMPLE = {
  id: 1,
  userId: "user_2abc123",
  orderNumber: "GLW-12345678",
  email: "agent@example.com",
  shippingName: "Ada Lovelace",
  shippingAddress: "12 Analytical Way",
  shippingCity: "London",
  shippingZip: "EC1A 1AA",
  shippingCountry: "GB",
  subtotal: "25.98",
  shipping: "3.99",
  tax: "2.08",
  total: "32.05",
  currency: "USD",
  cardLast4: "4242",
  status: "paid",
  createdAt: "2026-08-17T12:04:11.512Z",
  items: [
    {
      id: 1,
      orderId: 1,
      title: "Ribbed Knit Mini Dress",
      variantTitle: "M",
      quantity: 2,
      price: "12.99",
      imageUrl: "https://cdn.shopify.com/s/files/1/0000/dress-front.jpg",
      productHandle: "ribbed-knit-mini-dress",
    },
  ],
}

const listResponse = (extra?: Record<string, JsonSchema>): JsonSchema =>
  obj({ count: int(), ...(extra ?? {}), products: arrayOf(ref("Product")) })

const errorResponse = (status: number, description: string, example: unknown): ApiResponse => ({
  status,
  description,
  schema: ref("Error"),
  example,
})

const UNAUTHORIZED = errorResponse(401, "No valid session cookie was sent.", {
  error: {
    code: "unauthorized",
    message: "This endpoint requires a signed-in session.",
    hint: "POST /api/auth/sign-in/email with {email, password} and send the returned cookie on this request.",
  },
})

const SHOPIFY_UNAVAILABLE = errorResponse(503, "Shopify credentials are not configured on the server.", {
  error: {
    code: "shopify_unavailable",
    message: "Missing Shopify environment variables. Ensure SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN are set.",
    hint: "Set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN in .env.local, then restart the dev server.",
  },
})

/** Better Auth error bodies are flat — `{message, code}` — not the storefront's nested shape. */
const authError = (status: number, description: string, code: string, message: string): ApiResponse => ({
  status,
  description,
  schema: obj({ message: str(), code: str() }, ["message", "code"]),
  example: { message, code },
})

// Better Auth handles its own routes, so a dead database surfaces as its 500, not the storefront 503.
const AUTH_DATABASE_DOWN: ApiResponse = {
  status: 500,
  description: "Postgres is unreachable. Better Auth returns an empty body here rather than the storefront error shape.",
}

const DATABASE_UNAVAILABLE = errorResponse(503, "Postgres is not configured or not reachable.", {
  error: {
    code: "database_unavailable",
    message: "DATABASE_URL is not set, so this endpoint cannot read or write data.",
    hint: "Set DATABASE_URL in .env.local and create the tables from lib/db/schema.ts, then restart the dev server.",
  },
})

// --- Endpoints -------------------------------------------------------------

export const API_GROUPS: ApiGroup[] = [
  {
    name: "Auth",
    slug: "auth",
    description:
      "**Agents do not use these routes.** An agent authenticates itself with `X-Agent-Key` and names the shopper with `X-Customer-Ref` on the Cart, Wishlist and Orders calls directly — no sign-in step, no token to store, and nothing for the shopper to fetch from an inbox. See those tags for the headers. What remains here is the website's own email-and-password login, kept for browser users; there is no passwordless flow, because a demo one that accepted a fixed code would let anyone sign in as any address. Better Auth owns these four routes, so their errors are flat `{message, code}` objects rather than the storefront's nested `{error: {...}}` shape.",
    endpoints: [
      {
        method: "POST",
        path: "/api/auth/sign-up/email",
        summary: "Create an account with a password",
        description:
          "The website's signup form. Registers a user and signs them in immediately (autoSignIn is enabled). Agents do not need this — an unseen X-Customer-Ref is provisioned automatically on first use.",
        auth: "public",
        body: [
          { name: "name", type: "string", required: true, description: "Display name.", example: "Ada Lovelace" },
          { name: "email", type: "string", required: true, description: "Must be unique.", example: "agent@example.com" },
          { name: "password", type: "string", required: true, description: "At least 8 characters.", example: "hunter2hunter2" },
        ],
        responses: [
          {
            status: 200,
            description: "Account created. Read the Set-Cookie header for the session.",
            example: { token: "sess_...", user: { id: "user_2abc123", email: "agent@example.com", name: "Ada Lovelace" } },
          },
          authError(
            422,
            "Email already registered or password too short.",
            "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
            "User already exists. Use another email.",
          ),
          AUTH_DATABASE_DOWN,
        ],
        notes: [
          "Better Auth owns this route, so its error bodies differ from the storefront error shape and it returns 500 — not 503 — when Postgres is unreachable.",
        ],
      },
      {
        method: "POST",
        path: "/api/auth/sign-in/email",
        summary: "Sign in with a password",
        description:
          "The website's login form. The returned `token` also works as a bearer token, which is how a non-browser client with a real account's password authenticates. An agent has no password and does not need one — use X-Agent-Key with X-Customer-Ref instead.",
        auth: "public",
        body: [
          { name: "email", type: "string", required: true, description: "Registered email.", example: "agent@example.com" },
          { name: "password", type: "string", required: true, description: "Account password.", example: "hunter2hunter2" },
        ],
        responses: [
          {
            status: 200,
            description: "Signed in.",
            example: { redirect: false, token: "sess_...", user: { id: "user_2abc123", email: "agent@example.com" } },
          },
          authError(401, "Wrong email or password.", "INVALID_EMAIL_OR_PASSWORD", "Invalid email or password"),
          AUTH_DATABASE_DOWN,
        ],
      },
      {
        method: "GET",
        path: "/api/auth/get-session",
        summary: "Inspect the current session",
        description:
          "Returns the signed-in user, or null when the credential is missing or expired. Accepts either a bearer token or a cookie. Use it to check whether a stored token is still valid before a write. Agents have no session to inspect — this route does not understand the agent headers.",
        auth: "bearer",
        responses: [
          {
            status: 200,
            description: "Session, or null when not signed in.",
            example: { session: { id: "sess_2xyz", expiresAt: "2026-08-24T12:00:00.000Z" }, user: { id: "user_2abc123", email: "agent@example.com" } },
          },
        ],
      },
      {
        method: "POST",
        path: "/api/auth/sign-out",
        summary: "Sign out",
        description:
          "Revokes the current session, invalidating the bearer token and clearing the cookie. Send `Content-Type: application/json` even though there is no body. Agents have no session to revoke — this route does not understand the agent headers.",
        auth: "bearer",
        responses: [
          { status: 200, description: "Signed out.", example: { success: true } },
          authError(
            415,
            "Sent without a JSON content type.",
            "CONTENT_TYPE_REQUIRED",
            "Content-Type is required. Allowed types: application/json",
          ),
        ],
      },
    ],
  },
  {
    name: "Products",
    slug: "products",
    description: "Read-only catalogue data, served from the Shopify Storefront API. No authentication.",
    endpoints: [
      {
        method: "GET",
        path: "/api/products",
        summary: "List products",
        description: "Returns products with optional full-text filtering and sorting. This is the broadest catalogue read.",
        auth: "public",
        params: [
          {
            name: "q",
            in: "query",
            type: "string",
            description: "Shopify search syntax. Plain words match titles and descriptions; `tag:'Sale'` and `product_type:'Dresses'` also work.",
            example: "dress",
          },
          {
            name: "sort",
            in: "query",
            type: "string",
            description: "Sort order. Defaults to relevance when `q` is present, otherwise featured.",
            enum: ["featured", "newest", "price-asc", "price-desc", "relevance"],
            example: "price-asc",
          },
          { name: "limit", in: "query", type: "integer", description: "1–50.", default: 20, example: 5 },
        ],
        responses: [
          {
            status: 200,
            description: "Matching products.",
            schema: listResponse(),
            example: { count: 1, products: [PRODUCT_BRIEF] },
            exampleNote: ABBREVIATED,
          },
          errorResponse(400, "Invalid sort or limit.", {
            error: { code: "bad_request", message: 'Unknown sort "cheapest".', hint: "Use one of: featured, newest, price-asc, price-desc, relevance." },
          }),
          SHOPIFY_UNAVAILABLE,
        ],
      },
      {
        method: "GET",
        path: "/api/products/{handle}",
        summary: "Get one product",
        description: "Full detail for a single product, including every variant. Read `variants[].id` here to add the item to a bag.",
        auth: "public",
        params: [
          {
            name: "handle",
            in: "path",
            type: "string",
            required: true,
            description: "Product slug from any list response.",
            example: "ribbed-knit-mini-dress",
          },
        ],
        responses: [
          { status: 200, description: "The product.", schema: obj({ product: ref("Product") }), example: { product: PRODUCT_EXAMPLE } },
          errorResponse(404, "No product with that handle.", {
            error: { code: "not_found", message: 'No product with handle "nope".' },
          }),
          SHOPIFY_UNAVAILABLE,
        ],
      },
      {
        method: "GET",
        path: "/api/products/{handle}/recommendations",
        summary: "Related products",
        description: "Shopify's recommendations for a product — useful for cross-sell suggestions.",
        auth: "public",
        params: [
          { name: "handle", in: "path", type: "string", required: true, description: "Product slug.", example: "ribbed-knit-mini-dress" },
          { name: "limit", in: "query", type: "integer", description: "1–20.", default: 10, example: 4 },
        ],
        responses: [
          { status: 200, description: "Recommended products.", schema: listResponse(), example: { count: 1, products: [PRODUCT_BRIEF] }, exampleNote: ABBREVIATED },
          errorResponse(404, "No product with that handle.", { error: { code: "not_found", message: 'No product with handle "nope".' } }),
          SHOPIFY_UNAVAILABLE,
        ],
      },
    ],
  },
  {
    name: "Collections",
    slug: "collections",
    description: "The twelve merchandised categories in the site navigation, defined in lib/categories.ts.",
    endpoints: [
      {
        method: "GET",
        path: "/api/collections",
        summary: "List collections",
        description: "Every category slug with the Shopify filter it maps to. Call this first to discover valid slugs.",
        auth: "public",
        responses: [
          {
            status: 200,
            description: "All collections.",
            schema: obj({
              count: int(),
              collections: arrayOf(obj({ slug: str(), name: str(), filter: obj({ tag: str(), productType: str() }), url: str() })),
            }),
            example: {
              count: 12,
              collections: [
                { slug: "new-in", name: "New In", filter: { tag: "New In" }, url: "/collections/new-in" },
                { slug: "dresses", name: "Dresses", filter: { productType: "Dresses" }, url: "/collections/dresses" },
              ],
            },
            exampleNote: "Truncated to two of the twelve collections.",
          },
        ],
      },
      {
        method: "GET",
        path: "/api/collections/{slug}",
        summary: "Products in a collection",
        description: "Products for one category, using the same filter and sort options as the website's collection pages.",
        auth: "public",
        params: [
          { name: "slug", in: "path", type: "string", required: true, description: "Collection slug.", example: "dresses" },
          {
            name: "sort",
            in: "query",
            type: "string",
            description: "Sort order.",
            enum: ["featured", "newest", "price-asc", "price-desc", "relevance"],
            default: "featured",
            example: "newest",
          },
          { name: "limit", in: "query", type: "integer", description: "1–50.", default: 20, example: 5 },
        ],
        responses: [
          {
            status: 200,
            description: "Products in the collection.",
            schema: listResponse({ collection: obj({ slug: str(), name: str() }) }),
            example: { collection: { slug: "dresses", name: "Dresses" }, count: 1, products: [PRODUCT_BRIEF] },
            exampleNote: ABBREVIATED,
          },
          errorResponse(404, "Unknown slug.", {
            error: { code: "not_found", message: 'No collection with slug "hats". List them with GET /api/collections.' },
          }),
          SHOPIFY_UNAVAILABLE,
        ],
      },
    ],
  },
  {
    name: "Search",
    slug: "search",
    description: "Full-text product search. Equivalent to /api/products with a required query, sorted by relevance.",
    endpoints: [
      {
        method: "GET",
        path: "/api/search",
        summary: "Search products",
        description: "Searches titles, descriptions, tags and product types.",
        auth: "public",
        params: [
          { name: "q", in: "query", type: "string", required: true, description: "Search text.", example: "summer dress" },
          {
            name: "sort",
            in: "query",
            type: "string",
            description: "Sort order.",
            enum: ["featured", "newest", "price-asc", "price-desc", "relevance"],
            default: "relevance",
            example: "relevance",
          },
          { name: "limit", in: "query", type: "integer", description: "1–50.", default: 20, example: 5 },
        ],
        responses: [
          {
            status: 200,
            description: "Search results.",
            schema: listResponse({ query: str() }),
            example: { query: "summer dress", count: 1, products: [PRODUCT_BRIEF] },
            exampleNote: ABBREVIATED,
          },
          errorResponse(400, "Missing q.", {
            error: { code: "bad_request", message: 'The "q" query parameter is required.', hint: "Example: /api/search?q=summer%20dress" },
          }),
          SHOPIFY_UNAVAILABLE,
        ],
      },
    ],
  },
  {
    name: "Cart",
    slug: "cart",
    description:
      "Three ways to identify the bag, all backed by the same server-side store. **Agents** send `X-Agent-Key` and `X-Customer-Ref`: the bag is keyed by the customer ref, so no cookie is involved and every call is independent — this is the path to use from a chat integration. **Signed-in browsers** send a bearer token or session cookie and the bag is keyed by the account. **Anonymous browsers** get an httpOnly `cartId` cookie on the first add, which the browser returns automatically. An anonymous bag is adopted by the account on the first authenticated call, so signing in mid-shop loses nothing.",
    endpoints: [
      {
        method: "GET",
        path: "/api/cart",
        summary: "Get the current bag",
        description:
          "Returns the caller's bag, or null when no bag exists yet. The bag is found by customer ref for an agent, by account for a signed-in caller, and by cartId cookie otherwise.",
        auth: "cart",
        params: AGENT_HEADERS,
        responses: [
          {
            status: 200,
            description: "The bag, or null.",
            schema: obj({ cart: nullable(ref("Cart")) }),
            example: { cart: CART_EXAMPLE },
          },
        ],
      },
      {
        method: "POST",
        path: "/api/cart/lines",
        summary: "Add an item",
        description:
          "Adds a variant to the bag, creating the bag on the first call. Adding the same variant twice increases the quantity of the existing line.",
        auth: "cart",
        params: AGENT_HEADERS,
        body: [
          {
            name: "merchandiseId",
            type: "string",
            required: true,
            description: "Variant GID from a product's variants[].id — not the product id.",
            example: "gid://shopify/ProductVariant/44123456789",
          },
          { name: "quantity", type: "integer", description: "1–20. Defaults to 1.", example: 2 },
        ],
        responses: [
          { status: 201, description: "Item added; the whole bag is returned.", schema: obj({ cart: ref("Cart") }), example: { cart: CART_EXAMPLE } },
          errorResponse(400, "Missing or invalid merchandiseId/quantity.", {
            error: { code: "bad_request", message: '"merchandiseId" is required and must be a non-empty string.' },
          }),
          SHOPIFY_UNAVAILABLE,
        ],
        notes: [
          "Agents: nothing to persist between calls. Send the same X-Customer-Ref and the bag is already there.",
          "Anonymous browsers only: save the response's Set-Cookie header, or the next call starts an empty bag.",
        ],
      },
      {
        method: "PATCH",
        path: "/api/cart/lines",
        summary: "Change or remove a line",
        description: "Sets the absolute quantity of an existing line. A quantity of 0 removes the line — there is no separate delete route.",
        auth: "cart",
        params: AGENT_HEADERS,
        body: [
          {
            name: "lineId",
            type: "string",
            required: true,
            description: "Cart line GID from cart.lines[].id.",
            example: "gid://shopify/CartLine/line-1",
          },
          { name: "quantity", type: "integer", required: true, description: "0–20. Use 0 to remove.", example: 1 },
        ],
        responses: [
          { status: 200, description: "Updated bag.", schema: obj({ cart: ref("Cart") }), example: { cart: CART_EXAMPLE } },
          errorResponse(400, "Missing or invalid lineId/quantity.", {
            error: { code: "bad_request", message: '"quantity" must be an integer between 0 and 20.' },
          }),
        ],
      },
      {
        method: "DELETE",
        path: "/api/cart",
        summary: "Empty the bag",
        description:
          "Abandons the bag — the stored reference for an agent's customer ref or a signed-in account, and the cartId cookie for an anonymous browser. The next add starts a fresh one.",
        auth: "cart",
        params: AGENT_HEADERS,
        responses: [{ status: 200, description: "Bag cleared.", schema: obj({ cart: nullable(ref("Cart")) }), example: { cart: null } }],
      },
    ],
  },
  {
    name: "Wishlist",
    slug: "wishlist",
    description:
      "Saved product handles for one shopper, stored in Postgres. Identified either by the agent's `X-Customer-Ref` or by a signed-in session — two customer refs never see each other's list.",
    endpoints: [
      {
        method: "GET",
        path: "/api/wishlist",
        summary: "List saved products",
        description: "Returns the shopper's saved product handles, optionally expanded into full product objects.",
        auth: "session",
        params: [
          ...AGENT_HEADERS,
          {
            name: "expand",
            in: "query",
            type: "string",
            description: "Set to `products` to include full Product objects (one Shopify lookup per handle).",
            enum: ["products"],
            example: "products",
          },
        ],
        responses: [
          {
            status: 200,
            description: "Saved handles, plus products when expanded.",
            schema: obj({ count: int(), handles: arrayOf(str()), products: arrayOf(ref("Product")) }),
            example: { count: 2, handles: ["ribbed-knit-mini-dress", "cargo-parachute-pants"], products: [PRODUCT_BRIEF] },
            exampleNote: `${ABBREVIATED} The products key is present only with expand=products.`,
          },
          UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
      },
      {
        method: "POST",
        path: "/api/wishlist",
        summary: "Save a product",
        description: "Adds a product handle to the wishlist. Adding one that is already saved is a no-op, so this is safe to retry.",
        auth: "session",
        params: AGENT_HEADERS,
        body: [
          { name: "handle", type: "string", required: true, description: "Product handle to save.", example: "ribbed-knit-mini-dress" },
        ],
        responses: [
          {
            status: 201,
            description: "Saved; the full list is returned.",
            schema: obj({ count: int(), handles: arrayOf(str()) }),
            example: { count: 2, handles: ["ribbed-knit-mini-dress", "cargo-parachute-pants"] },
          },
          errorResponse(400, "Missing handle.", { error: { code: "bad_request", message: '"handle" is required and must be a non-empty string.' } }),
          UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
        notes: ["The handle is not verified against Shopify, so a typo is stored as-is and simply returns no product when expanded."],
      },
      {
        method: "DELETE",
        path: "/api/wishlist/{handle}",
        summary: "Remove a saved product",
        description: "Removes one handle. Removing something that was never saved still returns 200.",
        auth: "session",
        params: [
          ...AGENT_HEADERS,
          { name: "handle", in: "path", type: "string", required: true, description: "Product handle to remove.", example: "ribbed-knit-mini-dress" },
        ],
        responses: [
          { status: 200, description: "Remaining handles.", schema: obj({ count: int(), handles: arrayOf(str()) }), example: { count: 1, handles: ["cargo-parachute-pants"] } },
          UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
      },
    ],
  },
  {
    name: "Orders",
    slug: "orders",
    description:
      "Checkout and order history for one shopper, identified either by the agent's `X-Customer-Ref` or by a signed-in session. Payment is simulated: only the test card 4242 4242 4242 4242 is accepted, and no real charge is made.",
    endpoints: [
      {
        method: "POST",
        path: "/api/orders",
        summary: "Place an order",
        description:
          "Converts the shopper's current bag into an order and empties the bag. The credential identifies both the buyer and the bag, so no cookie is required. Totals are recomputed server-side from Shopify prices — subtotal, plus 3.99 shipping under a 29 subtotal, plus 8% tax — so no amounts are accepted from the client.",
        auth: "session",
        params: [
          ...AGENT_HEADERS,
          {
            name: "Idempotency-Key",
            in: "header",
            type: "string",
            description:
              "Optional. Repeating a request with the same key returns the order the first call created instead of placing a second one, and responds 200 rather than 201. Use one key per checkout attempt.",
            example: "checkout-01HQ8-ab12",
          },
          {
            name: "X-Customer-Email",
            in: "header",
            type: "string",
            description:
              "Optional contact address recorded against the shopper. Contact data only — it never identifies anyone and cannot be used to look up another shopper's data. The order's own email comes from the body.",
            example: "shopper@example.com",
          },
        ],
        body: [
          { name: "email", type: "string", required: true, description: "Contact email for the order.", example: "agent@example.com" },
          { name: "name", type: "string", required: true, description: "Shipping recipient.", example: "Ada Lovelace" },
          { name: "address", type: "string", required: true, description: "Street address.", example: "12 Analytical Way" },
          { name: "city", type: "string", required: true, description: "City.", example: "London" },
          { name: "zip", type: "string", required: true, description: "Postal code.", example: "EC1A 1AA" },
          { name: "country", type: "string", required: true, description: "Country.", example: "GB" },
          { name: "cardNumber", type: "string", required: true, description: "Test card only: 4242424242424242.", example: "4242424242424242" },
          { name: "expiry", type: "string", required: true, description: "MM/YY.", example: "12/29" },
          { name: "cvc", type: "string", required: true, description: "3 or 4 digits.", example: "123" },
        ],
        responses: [
          { status: 200, description: "Idempotent replay — the order this key already created. No second order was placed.", schema: obj({ order: ref("Order") }), example: { order: ORDER_EXAMPLE } },
          { status: 201, description: "Order placed and the bag emptied.", schema: obj({ order: ref("Order") }), example: { order: ORDER_EXAMPLE } },
          errorResponse(400, "Empty bag, declined card, or a missing shipping field.", {
            error: { code: "order_rejected", message: "Card declined. Use test card 4242 4242 4242 4242." },
          }),
          UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
        notes: [
          "The order is built from the server-side bag, not from the request body — fill the bag first with POST /api/cart/lines using the same credential.",
          "Send an Idempotency-Key and retries are safe: the same key returns the first order with 200 instead of buying the bag twice.",
          "A rejected card or an empty bag does not consume the key, so the agent can fix the input and retry with it.",
        ],
      },
      {
        method: "GET",
        path: "/api/orders",
        summary: "List orders",
        description: "The shopper's orders, newest first, each with its line items.",
        auth: "session",
        params: AGENT_HEADERS,
        responses: [
          { status: 200, description: "Order history.", schema: obj({ count: int(), orders: arrayOf(ref("Order")) }), example: { count: 1, orders: [ORDER_EXAMPLE] } },
          UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
      },
      {
        method: "GET",
        path: "/api/orders/{orderNumber}",
        summary: "Get one order",
        description: "A single order by its order number. Scoped to the shopper, so another shopper's order returns 404 even with a valid agent key.",
        auth: "session",
        params: [
          ...AGENT_HEADERS,
          { name: "orderNumber", in: "path", type: "string", required: true, description: "Order number, e.g. GLW-12345678.", example: "GLW-12345678" },
        ],
        responses: [
          { status: 200, description: "The order.", schema: obj({ order: ref("Order") }), example: { order: ORDER_EXAMPLE } },
          errorResponse(404, "No such order for this user.", { error: { code: "not_found", message: 'No order "GLW-000" for the signed-in user.' } }),
          UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
      },
    ],
  },
]

export const ALL_ENDPOINTS: ApiEndpoint[] = API_GROUPS.flatMap((g) => g.endpoints)
