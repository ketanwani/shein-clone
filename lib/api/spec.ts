/**
 * Single source of truth for the public REST API.
 *
 * The rendered docs page (/docs/api), the raw markdown (/docs/api/raw) and the
 * OpenAPI document (/api/openapi.json) are all generated from this file, so they
 * cannot drift apart. When you add or change a route handler under app/api/,
 * update the matching entry here.
 */

/**
 * "cart"     — agent headers, a bearer token, or the anonymous cartId cookie.
 * "session"  — agent headers or a bearer token; there is no anonymous form.
 * "bearer"   — a bearer token only. Better Auth owns these routes and knows nothing
 *              about the agent headers, so advertising the agent path there would lie.
 * "agent"    — agent headers only. The customer surface has no browser equivalent; the
 *              website manages the same data through the account pages.
 * "agentKey" — X-Agent-Key alone. The sign-in endpoints: the caller must be the
 *              integration, but there is no shopper to name yet — naming one is what
 *              the flow is for.
 * "shopper"  — X-Agent-Key AND a bearer token, checked independently. Neither one
 *              substitutes for the other, and X-Customer-Ref is not accepted: on a
 *              shopper's saved items and order history, a ref would let anyone holding
 *              the shared secret read a named shopper without that shopper signing in.
 */
export type ApiAuth = "public" | "cart" | "session" | "bearer" | "agent" | "agentKey" | "shopper"

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
  agent: "Agent headers — X-Agent-Key and X-Customer-Ref",
  agentKey: "X-Agent-Key only — no shopper named yet",
  shopper: "X-Agent-Key and the shopper's bearer token — both required",
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

export const BEARER_PARAM: ApiParam = {
  name: "Authorization",
  in: "header",
  type: "string",
  required: true,
  description:
    "`Bearer <token>`, using the token from POST /api/auth/sign-in/email-otp (found at `data.token`). Identifies the shopper, where X-Agent-Key identifies the caller — both are required and neither substitutes for the other. Cookies are not required and not used: every call is independent.",
  example: "Bearer $TOKEN",
}

const AGENT_HEADERS: ApiParam[] = [AGENT_KEY_PARAM, CUSTOMER_REF_PARAM]

/** Endpoints where the shopper themselves must have signed in. */
const SHOPPER_HEADERS: ApiParam[] = [AGENT_KEY_PARAM, BEARER_PARAM]

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
    url: str("Absolute https URL, safe to embed directly."),
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
    url: str(
      "Absolute https link to this product's page. Copy it verbatim — do not build one from the handle. Present on every product, in list responses as well as detail, and identical between the two.",
    ),
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
    addressId: nullable(str("The address book entry this shipped to, whether picked with address_id or saved from an inline address.")),
    createdAt: str("ISO 8601 timestamp"),
    items: arrayOf(ref("OrderItem")),
  }),
  Address: obj(
    {
      id: str("Stable, opaque. Quote this back as address_id at checkout."),
      label: str("Free text in the shopper's own words. Absent when they did not give one."),
      line1: str(),
      city: str(),
      zip: str(),
      country: str(),
      is_default: bool(),
    },
    ["id", "line1", "city", "zip", "country", "is_default"],
  ),
  Customer: obj(
    {
      status: { type: "string", enum: ["new", "known"], description: '"new" means nothing is on file yet.' },
      email: str("Contact data only. Absent until the shopper gives one."),
      name: str("Absent until the shopper gives one."),
      missing: {
        type: "array",
        items: { type: "string", enum: ["email", "name", "shipping_address"] },
        description:
          "Field names the agent still needs to collect before checkout. Machine-readable on purpose — compose your own question from these, do not expect prose.",
      },
      addresses: arrayOf(ref("Address")),
    },
    ["status", "missing", "addresses"],
  ),
  User: obj(
    {
      id: str("Stable account id. This is what the wishlist and orders are keyed on."),
      email: str(),
      name: str("Empty for an account created by OTP, which asks for nothing but an address."),
      emailVerified: bool("True after a correct code, which is the only way an OTP account is created."),
      image: nullable(str()),
      createdAt: str("ISO 8601, UTC."),
      updatedAt: str("ISO 8601, UTC."),
    },
    ["id", "email", "name", "emailVerified", "createdAt", "updatedAt"],
  ),
  Session: obj(
    {
      id: str(),
      token: str("The same value the sign-in response returned at data.token."),
      expiresAt: str("ISO 8601, UTC."),
      createdAt: str("ISO 8601, UTC."),
      updatedAt: str("ISO 8601, UTC."),
      userId: str(),
      ipAddress: nullable(str()),
      userAgent: nullable(str()),
    },
    ["id", "token", "expiresAt", "userId"],
  ),
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
  url: "https://shein-clone-ruby.vercel.app/products/ribbed-knit-mini-dress",
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
  url: "https://shein-clone-ruby.vercel.app/products/ribbed-knit-mini-dress",
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
  addressId: "addr_9f2c41a8b7e04d13",
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

const ADDRESS_EXAMPLE = {
  id: "addr_9f2c41a8b7e04d13",
  label: "Home",
  line1: "12 Analytical Way",
  city: "London",
  zip: "EC1A 1AA",
  country: "GB",
  is_default: true,
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

const AGENT_UNAUTHORIZED = errorResponse(401, "Missing or wrong X-Agent-Key, or agent access is switched off on this deployment.", {
  error: {
    code: "unauthorized",
    message: "Invalid or missing X-Agent-Key.",
    hint: "Send X-Agent-Key with the shared secret issued by GLOWA, plus X-Customer-Ref identifying the shopper.",
  },
})

/**
 * The two ways a shopper-scoped call is turned away. Both are 401 with a machine-readable
 * code, never a redirect and never a 200 with an empty body, because the agent branches
 * on this to decide whether to re-run sign-in.
 */
const NO_SHOPPER_TOKEN = errorResponse(401, "The bearer token is missing, malformed or expired.", {
  error: {
    code: "unauthorized",
    message: "This endpoint requires a signed-in shopper.",
    hint: "Send `Authorization: Bearer <token>` using the token from POST /api/auth/sign-in/email-otp (found at `data.token`), together with X-Agent-Key. The two are checked independently and neither substitutes for the other.",
  },
})

/** Listed alongside NO_SHOPPER_TOKEN so the docs show that one credential is not enough. */
const NO_AGENT_KEY = errorResponse(401, "X-Agent-Key is missing or wrong, whatever the bearer token says.", {
  error: {
    code: "unauthorized",
    message: "Invalid or missing X-Agent-Key.",
    hint: "Send X-Agent-Key with the shared secret issued by GLOWA, plus X-Customer-Ref identifying the shopper.",
  },
})

const SHOPPER_UNAUTHORIZED: ApiResponse[] = [NO_SHOPPER_TOKEN, NO_AGENT_KEY]

const CUSTOMER_REF_REQUIRED = errorResponse(400, "The agent key checked out but no shopper was named.", {
  error: {
    code: "bad_request",
    message: "X-Customer-Ref is required on this endpoint.",
    hint: "Send X-Customer-Ref with a stable, opaque id for this shopper (e.g. the Instagram-scoped user id). An email address is not accepted as identity.",
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
      "Two ways in, for two different callers.\n\n**Email OTP, for an agent acting for one shopper.** `send-verification-otp` mails a 6-digit code; `sign-in/email-otp` exchanges it for a session token at `data.token`, valid 7 days. Send that token as `Authorization: Bearer <token>` on the Wishlist and Orders calls, alongside `X-Agent-Key`. No cookie is involved at any point, and the account is created when a correct code arrives — never when one is requested — so a mistyped address leaves nothing behind. No refresh token is issued: re-run this flow when `data.expiresAt` passes.\n\n**Email and password, for the website's own login forms.** Unchanged, and still owned by Better Auth, so those two routes return flat `{message, code}` errors rather than the storefront's nested `{error: {...}}` shape.\n\nThe agent's other credential, `X-Customer-Ref`, still identifies the shopper on the Cart and Customer calls, where the agent is filling in details before there is an account. It is **not** accepted on the wishlist or the order history: there, only a token the shopper themselves obtained will do.",
    endpoints: [
      {
        method: "POST",
        path: "/api/auth/email-otp/send-verification-otp",
        summary: "Send a sign-in code",
        description:
          "Emails a 6-digit code, valid for 10 minutes and single-use.\n\nThe response is identical whether or not the address has an account, and no account is created here. Both are deliberate: this endpoint is reachable from an Instagram DM, so an answer that differed would let anyone submit a list of addresses and learn which ones shop at GLOWA, and provisioning on request would hand an account to whoever owns a mistyped address.",
        auth: "agentKey",
        params: [AGENT_KEY_PARAM],
        body: [
          { name: "email", type: "string", required: true, description: "Where to send the code.", example: "ada@example.com" },
          { name: "type", type: "string", required: true, description: 'Must be "sign-in".', example: "sign-in" },
        ],
        responses: [
          {
            status: 200,
            description: "Accepted. Says nothing about whether the address has an account, and never contains the code.",
            schema: obj({ success: bool() }, ["success"]),
            example: { success: true },
          },
          errorResponse(400, "Missing email, or a type other than sign-in.", {
            error: { code: "bad_request", message: '"email" is required and must be a non-empty string.' },
          }),
          errorResponse(429, "Too many codes for this address, or from this source.", {
            error: {
              code: "rate_limited",
              message: "Too many verification codes requested.",
              hint: "Wait 240s before requesting another code.",
            },
          }),
          NO_AGENT_KEY,
          DATABASE_UNAVAILABLE,
        ],
        notes: [
          "The code is never returned in the body. An agent holding it could sign the shopper in without them, which is exactly the confirmation step this flow exists to get.",
          "Limited to 3 codes per address per 10 minutes. A separate, much looser per-source limit is only a backstop — every shopper the integration signs in shares the same egress addresses.",
          "No transactional email provider is configured on this deployment, so nothing is actually delivered. Set DEMO_OTP_CODE to make sign-in accept one fixed code instead; see the sign-in endpoint.",
        ],
      },
      {
        method: "POST",
        path: "/api/auth/sign-in/email-otp",
        summary: "Exchange a code for a session token",
        description:
          "Verifies the code and returns a session token at **`data.token`**, with its expiry at **`data.expiresAt`** (ISO 8601, UTC). Sessions last 7 days.\n\nA first-time address is registered here, so there is no separate signup step. No refresh token is issued — when `data.expiresAt` passes, run this flow again.\n\nEvery failure is the same 401 `invalid_code`: a wrong code, an expired code, one attempted too many times, and an address with no account are indistinguishable by design.",
        auth: "agentKey",
        params: [AGENT_KEY_PARAM],
        body: [
          { name: "email", type: "string", required: true, description: "The address the code was sent to.", example: "ada@example.com" },
          { name: "otp", type: "string", required: true, description: "The 6-digit code.", example: "000000" },
        ],
        responses: [
          {
            status: 200,
            description: "Signed in. The token goes in the Authorization header on subsequent shopper-scoped calls.",
            schema: obj(
              {
                data: obj(
                  { token: str("Session token. Send as `Authorization: Bearer <token>`."), expiresAt: str("ISO 8601, UTC."), user: ref("User") },
                  ["token", "expiresAt", "user"],
                ),
              },
              ["data"],
            ),
            example: {
              data: {
                token: "V1DSf3g8PL2rp9CNtFc6KFaZSypGM82Y",
                expiresAt: "2026-08-26T09:41:12.104Z",
                user: {
                  id: "ST6bZD9LrjCz9p43z45Exn7xyOA1Fx12",
                  email: "ada@example.com",
                  name: "",
                  emailVerified: true,
                  image: null,
                  createdAt: "2026-08-19T09:41:12.100Z",
                  updatedAt: "2026-08-19T09:41:12.100Z",
                },
              },
            },
          },
          errorResponse(401, "Wrong code, expired code, too many attempts, or an address with no account — one answer for all four.", {
            error: {
              code: "invalid_code",
              message: "That code is not valid.",
              hint: "Request a new code with POST /api/auth/email-otp/send-verification-otp, then send it within 10 minutes. Codes are single-use.",
            },
          }),
          NO_AGENT_KEY,
          DATABASE_UNAVAILABLE,
        ],
        notes: [
          "The token lives at `data.token` and the expiry at `data.expiresAt`. Both paths are part of the contract — an integration extracts the token by path, and silently stops capturing it if the shape moves.",
          "`data.expiresAt` is read back from the session the server will actually enforce, not computed from the configured window.",
          "When DEMO_OTP_CODE is set on the server, that one fixed value is accepted in addition to a genuine code. It changes nothing else: the account is still created here, the response shape is identical, and failures are still uniform. Unset, the fixed value is not special-cased anywhere.",
        ],
      },
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
          "Returns the account behind the bearer token. Use it to check a stored token is still good before a write, rather than discovering it is not partway through a checkout.\n\nAn absent or expired session is a **401**, not Better Auth's 200 with a `null` body: the agent branches on the status to decide whether to re-run sign-in, and a 200 reads as success. A cookie works too, for the website.",
        auth: "shopper",
        params: SHOPPER_HEADERS,
        responses: [
          {
            status: 200,
            description: "The live session and the account it belongs to.",
            schema: obj({ session: ref("Session"), user: ref("User") }, ["session", "user"]),
            example: {
              session: {
                id: "ns3JPmGwcZDUQpBZTwym8dW4ew93nIrN",
                token: "V1DSf3g8PL2rp9CNtFc6KFaZSypGM82Y",
                expiresAt: "2026-08-26T09:41:12.104Z",
                createdAt: "2026-08-19T09:41:12.104Z",
                updatedAt: "2026-08-19T09:41:12.104Z",
                userId: "ST6bZD9LrjCz9p43z45Exn7xyOA1Fx12",
                ipAddress: "",
                userAgent: "",
              },
              user: {
                id: "ST6bZD9LrjCz9p43z45Exn7xyOA1Fx12",
                email: "ada@example.com",
                name: "",
                emailVerified: true,
                image: null,
                createdAt: "2026-08-19T09:41:12.100Z",
                updatedAt: "2026-08-19T09:41:12.100Z",
              },
            },
          },
          errorResponse(401, "No live session for this token.", {
            error: {
              code: "unauthorized",
              message: "No active session for this token.",
              hint: "The token is missing, malformed or expired. Run POST /api/auth/sign-in/email-otp again.",
            },
          }),
          NO_AGENT_KEY,
          DATABASE_UNAVAILABLE,
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
              collections: arrayOf(
                obj({
                  slug: str(),
                  name: str(),
                  filter: obj({ tag: str(), productType: str() }),
                  url: str("Absolute https link to the collection's page. Copy it verbatim."),
                }),
              ),
            }),
            example: {
              count: 12,
              collections: [
                { slug: "new-in", name: "New In", filter: { tag: "New In" }, url: "https://shein-clone-ruby.vercel.app/collections/new-in" },
                { slug: "dresses", name: "Dresses", filter: { productType: "Dresses" }, url: "https://shein-clone-ruby.vercel.app/collections/dresses" },
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
            schema: listResponse({
              collection: obj({
                slug: str(),
                name: str(),
                url: str("Absolute https link to the collection's page. Copy it verbatim."),
              }),
            }),
            example: { collection: { slug: "dresses", name: "Dresses", url: "https://shein-clone-ruby.vercel.app/collections/dresses" }, count: 1, products: [PRODUCT_BRIEF] },
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
    name: "Customer",
    slug: "customer",
    description:
      "The shopper's contact details and address book, so the agent can find out what it still needs to ask for before checkout — and, on a return visit, ask for nothing at all. Everything here is keyed by `X-Customer-Ref`. **Email is never a lookup key**: it is contact data written onto the profile and the order, and two refs that give the same address stay two separate shoppers with separate address books. Do not front-load any of this — browsing, search and adding to the bag need no profile data, so ask only at checkout.",
    endpoints: [
      {
        method: "GET",
        path: "/api/customer",
        summary: "What do we still need to ask for?",
        description:
          "The shopper's profile and saved addresses. **Always 200**, including for a customer ref that has never been seen — an unknown shopper is a normal state on the happy path, not an error, so there is no 404 to handle. Read `missing` to decide what to ask; read `addresses` to offer a choice.",
        auth: "agent",
        params: AGENT_HEADERS,
        responses: [
          {
            status: 200,
            description: "The shopper, known or not.",
            schema: obj({ customer: ref("Customer") }),
            example: { customer: { status: "new", missing: ["email", "name", "shipping_address"], addresses: [] } },
            exampleNote:
              "A known shopper instead returns status \"known\", their email and name, an empty missing array, and their saved addresses.",
          },
          AGENT_UNAUTHORIZED,
          CUSTOMER_REF_REQUIRED,
          DATABASE_UNAVAILABLE,
        ],
        notes: [
          "`missing` is an array of field names, never prose — compose the question yourself rather than relaying a sentence.",
          "Every address carries a stable `id`. When the shopper says \"send it to work\", send that id back as `address_id` on POST /api/orders.",
          "`label` is free text and is omitted rather than invented, so do not rely on it being present.",
        ],
      },
      {
        method: "PATCH",
        path: "/api/customer",
        summary: "Record contact details",
        description:
          "Stores an email or name the shopper has given. Both are optional; send whichever you just learned. Writing an email that matches another customer changes nothing about who this customer is — refs never merge.",
        auth: "agent",
        params: AGENT_HEADERS,
        body: [
          { name: "email", type: "string", description: "Contact address for orders.", example: "ada@example.com" },
          { name: "name", type: "string", description: "Shipping recipient.", example: "Ada Lovelace" },
        ],
        responses: [
          {
            status: 200,
            description: "The updated customer, same shape as GET.",
            schema: obj({ customer: ref("Customer") }),
            example: {
              customer: { status: "known", email: "ada@example.com", name: "Ada Lovelace", missing: ["shipping_address"], addresses: [] },
            },
          },
          AGENT_UNAUTHORIZED,
          CUSTOMER_REF_REQUIRED,
          DATABASE_UNAVAILABLE,
        ],
      },
      {
        method: "GET",
        path: "/api/customer/addresses",
        summary: "List saved addresses",
        description: "The shopper's address book. The same array GET /api/customer returns, on its own.",
        auth: "agent",
        params: AGENT_HEADERS,
        responses: [
          {
            status: 200,
            description: "Saved addresses, oldest first.",
            schema: obj({ count: int(), addresses: arrayOf(ref("Address")) }),
            example: { count: 1, addresses: [ADDRESS_EXAMPLE] },
          },
          AGENT_UNAUTHORIZED,
          CUSTOMER_REF_REQUIRED,
          DATABASE_UNAVAILABLE,
        ],
      },
      {
        method: "POST",
        path: "/api/customer/addresses",
        summary: "Save an address",
        description:
          "Adds an address to the book and returns it with the id to quote at checkout. The shopper's first address becomes their default automatically. Checkout also saves an inline address for you, so this is only needed when the shopper wants one stored ahead of time.",
        auth: "agent",
        params: AGENT_HEADERS,
        body: [
          { name: "line1", type: "string", required: true, description: "Street address.", example: "12 Analytical Way" },
          { name: "city", type: "string", required: true, description: "City.", example: "London" },
          { name: "zip", type: "string", required: true, description: "Postal code.", example: "EC1A 1AA" },
          { name: "country", type: "string", required: true, description: "Country.", example: "GB" },
          { name: "label", type: "string", description: "The shopper's own words, e.g. \"Home\". Omit rather than inventing one.", example: "Home" },
          { name: "is_default", type: "string", description: "Boolean. Makes this the default, demoting any previous one.", example: "true" },
        ],
        responses: [
          { status: 201, description: "Saved.", schema: obj({ address: ref("Address") }), example: { address: ADDRESS_EXAMPLE } },
          errorResponse(400, "Missing a required address field.", {
            error: { code: "bad_request", message: '"line1" is required and must be a non-empty string.' },
          }),
          AGENT_UNAUTHORIZED,
          CUSTOMER_REF_REQUIRED,
          DATABASE_UNAVAILABLE,
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
        auth: "shopper",
        params: [
          ...SHOPPER_HEADERS,
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
          ...SHOPPER_UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
      },
      {
        method: "POST",
        path: "/api/wishlist",
        summary: "Save a product",
        description: "Adds a product handle to the wishlist. Adding one that is already saved is a no-op, so this is safe to retry.",
        auth: "shopper",
        params: SHOPPER_HEADERS,
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
          ...SHOPPER_UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
        notes: ["The handle is not verified against Shopify, so a typo is stored as-is and simply returns no product when expanded."],
      },
      {
        method: "DELETE",
        path: "/api/wishlist/{handle}",
        summary: "Remove a saved product",
        description: "Removes one handle. Removing something that was never saved still returns 200.",
        auth: "shopper",
        params: [
          ...SHOPPER_HEADERS,
          { name: "handle", in: "path", type: "string", required: true, description: "Product handle to remove.", example: "ribbed-knit-mini-dress" },
        ],
        responses: [
          { status: 200, description: "Remaining handles.", schema: obj({ count: int(), handles: arrayOf(str()) }), example: { count: 1, handles: ["cargo-parachute-pants"] } },
          ...SHOPPER_UNAUTHORIZED,
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
          "Converts the shopper's current bag into an order and empties the bag. The credential identifies both the buyer and the bag, so no cookie is required.\n\nShip it two ways: send `address_id` from the shopper's address book, or send a full inline address, which is saved to the book for next time and whose id comes back on the order. If both are sent, `address_id` wins. `email` and `name` fall back to the stored profile, so a returning shopper checks out with nothing but an address id and a card.\n\nTotals are recomputed server-side from Shopify prices — subtotal, plus 3.99 shipping under a 29 subtotal, plus 8% tax — so no amounts are accepted from the client.",
        auth: "shopper",
        params: [
          ...SHOPPER_HEADERS,
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
          {
            name: "address_id",
            type: "string",
            description:
              "An id from this shopper's own address book (GET /api/customer). Wins over an inline address. An id belonging to anyone else returns 404 — it never ships to them.",
            example: "addr_9f2c41a8b7e04d13",
          },
          { name: "email", type: "string", description: "Contact email. Optional once the profile holds one.", example: "ada@example.com" },
          { name: "name", type: "string", description: "Shipping recipient. Optional once the profile holds one.", example: "Ada Lovelace" },
          { name: "address", type: "string", description: "Inline street address. Required unless address_id is sent.", example: "12 Analytical Way" },
          { name: "city", type: "string", description: "Required unless address_id is sent.", example: "London" },
          { name: "zip", type: "string", description: "Required unless address_id is sent.", example: "EC1A 1AA" },
          { name: "country", type: "string", description: "Required unless address_id is sent.", example: "GB" },
          { name: "cardNumber", type: "string", required: true, description: "Test card only: 4242424242424242.", example: "4242424242424242" },
          { name: "expiry", type: "string", required: true, description: "MM/YY.", example: "12/29" },
          { name: "cvc", type: "string", required: true, description: "3 or 4 digits.", example: "123" },
        ],
        responses: [
          { status: 200, description: "Idempotent replay — the order this key already created. No second order was placed.", schema: obj({ order: ref("Order") }), example: { order: ORDER_EXAMPLE } },
          { status: 201, description: "Order placed and the bag emptied.", schema: obj({ order: ref("Order") }), example: { order: ORDER_EXAMPLE } },
          errorResponse(400, "Empty bag, declined card, or details still missing.", {
            error: { code: "order_rejected", message: "Still needed before checkout: email, shipping_address." },
          }),
          errorResponse(404, "address_id does not belong to this shopper.", {
            error: {
              code: "not_found",
              message: 'No address "addr_9f2c41a8b7e04d13" for this customer.',
              hint: "Use an id from GET /api/customer, or send a full inline address instead.",
            },
          }),
          ...SHOPPER_UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
        notes: [
          "The order is built from the server-side bag, not from the request body — fill the bag first with POST /api/cart/lines using the same credential.",
          "Call GET /api/customer first: its `missing` array tells you exactly which of email, name and shipping_address you still need to ask for.",
          "Send an Idempotency-Key and retries are safe: the same key returns the first order with 200 instead of buying the bag twice.",
          "A rejected card or an empty bag does not consume the key, so the agent can fix the input and retry with it.",
        ],
      },
      {
        method: "GET",
        path: "/api/orders",
        summary: "List orders",
        description: "The shopper's orders, newest first, each with its line items.",
        auth: "shopper",
        params: SHOPPER_HEADERS,
        responses: [
          { status: 200, description: "Order history.", schema: obj({ count: int(), orders: arrayOf(ref("Order")) }), example: { count: 1, orders: [ORDER_EXAMPLE] } },
          ...SHOPPER_UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
      },
      {
        method: "GET",
        path: "/api/orders/{orderNumber}",
        summary: "Get one order",
        description: "A single order by its order number. Scoped to the shopper, so another shopper's order returns 404 even with a valid agent key.",
        auth: "shopper",
        params: [
          ...SHOPPER_HEADERS,
          { name: "orderNumber", in: "path", type: "string", required: true, description: "Order number, e.g. GLW-12345678.", example: "GLW-12345678" },
        ],
        responses: [
          { status: 200, description: "The order.", schema: obj({ order: ref("Order") }), example: { order: ORDER_EXAMPLE } },
          errorResponse(404, "No such order for this user.", { error: { code: "not_found", message: 'No order "GLW-000" for the signed-in user.' } }),
          ...SHOPPER_UNAUTHORIZED,
          DATABASE_UNAVAILABLE,
        ],
      },
    ],
  },
]

export const ALL_ENDPOINTS: ApiEndpoint[] = API_GROUPS.flatMap((g) => g.endpoints)
