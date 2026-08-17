import { curlFor } from "./curl"
import { renderSchema } from "./schema-render"
import {
  API_GROUPS,
  API_TITLE,
  API_VERSION,
  AUTH_LABELS,
  DEFAULT_BASE_URL,
  SCHEMAS,
  type ApiEndpoint,
  type ApiParam,
} from "./spec"

const json = (value: unknown) => "```json\n" + JSON.stringify(value, null, 2) + "\n```"

function paramDescription(param: ApiParam) {
  const extras: string[] = []
  if (param.enum) extras.push(`One of: ${param.enum.join(", ")}.`)
  if (param.default !== undefined) extras.push(`Defaults to \`${param.default}\`.`)
  return [param.description, ...extras].join(" ")
}

function endpointSection(endpoint: ApiEndpoint, baseUrl: string) {
  const out: string[] = []

  out.push(`### ${endpoint.method} ${endpoint.path}`)
  out.push(`**${endpoint.summary}** — auth: ${AUTH_LABELS[endpoint.auth]}`)
  out.push(endpoint.description)

  const pathParams = (endpoint.params ?? []).filter((p) => p.in === "path")
  const queryParams = (endpoint.params ?? []).filter((p) => p.in === "query")

  // Header and rows must stay in one block — a blank line between them breaks the table.
  if (pathParams.length > 0) {
    out.push("Path parameters:")
    out.push(
      [
        "| name | type | description |",
        "| --- | --- | --- |",
        ...pathParams.map((p) => `| \`${p.name}\` | ${p.type} | ${paramDescription(p)} |`),
      ].join("\n"),
    )
  }

  if (queryParams.length > 0) {
    out.push("Query parameters:")
    out.push(
      [
        "| name | type | required | description |",
        "| --- | --- | --- | --- |",
        ...queryParams.map(
          (p) => `| \`${p.name}\` | ${p.type} | ${p.required ? "yes" : "no"} | ${paramDescription(p)} |`,
        ),
      ].join("\n"),
    )
  }

  if (endpoint.body) {
    out.push("Request body (`application/json`):")
    out.push(
      [
        "| field | type | required | description |",
        "| --- | --- | --- | --- |",
        ...endpoint.body.map(
          (f) => `| \`${f.name}\` | ${f.type} | ${f.required ? "yes" : "no"} | ${f.description} |`,
        ),
      ].join("\n"),
    )
  }

  out.push("Example request:")
  out.push("```bash\n" + curlFor(endpoint, baseUrl) + "\n```")

  out.push("Responses:")
  for (const response of endpoint.responses) {
    out.push(`\`${response.status}\` — ${response.description}`)
    if (response.example !== undefined) out.push(json(response.example))
    if (response.exampleNote) out.push(`_${response.exampleNote}_`)
  }

  if (endpoint.notes?.length) {
    out.push(endpoint.notes.map((note) => `> ${note}`).join("\n>\n"))
  }

  return out.join("\n\n")
}

/** The whole API reference as markdown — the artifact to paste into an agent's context. */
export function buildMarkdown(baseUrl = DEFAULT_BASE_URL) {
  const sections: string[] = []

  sections.push(`# ${API_TITLE} v${API_VERSION}`)
  sections.push(
    [
      "REST API for the GLOWA storefront, written for AI agent integration. Every endpoint returns JSON.",
      `Base URL: \`${baseUrl}\`. Machine-readable spec: \`GET ${baseUrl}/api/openapi.json\`.`,
    ].join(" "),
  )

  sections.push("## Conventions")
  sections.push(
    [
      "- Request and response bodies are JSON; send `Content-Type: application/json` on writes.",
      "- Product identifiers are Shopify `handle` slugs. Cart and variant identifiers are Shopify GIDs (`gid://shopify/...`) and must be passed back exactly as received.",
      "- Money is always a decimal **string** plus a currency code, never a float.",
      "- List endpoints return `count` alongside the array. There is no pagination; `limit` caps at 50.",
      "- Errors share one shape, so an agent can branch on `error.code` and surface `error.message`:",
    ].join("\n"),
  )
  sections.push(
    json({ error: { code: "not_found", message: 'No product with handle "nope".', hint: "Present when there is a concrete next step." } }),
  )
  sections.push(
    [
      "| status | meaning |",
      "| --- | --- |",
      "| 400 | Malformed input — fix the request before retrying. |",
      "| 401 | No valid session cookie. Sign in, then retry. |",
      "| 404 | No such product, collection, or order. |",
      "| 503 | Server is missing Shopify or Postgres configuration. Retrying will not help until it is set up. |",
    ].join("\n"),
  )

  sections.push("## Authentication")
  sections.push(
    [
      "Three access levels:",
      "",
      "1. **Public** — catalogue reads (products, collections, search). No credentials.",
      "2. **Cart cookie** — the bag is keyed by an httpOnly `cartId` cookie created on the first add. Use one cookie jar (`-c cookies.txt -b cookies.txt`) for the whole session, or every call sees an empty bag.",
      "3. **Bearer token** — wishlist and orders need a per-user token. Get one with the two-step OTP flow below and send it as `Authorization: Bearer <token>`. Tokens last 7 days.",
      "",
      "```bash",
      `curl -s -X POST '${baseUrl}/api/auth/email-otp/send-verification-otp' \\`,
      "  -H 'Content-Type: application/json' \\",
      `  -d '{"email":"agent@example.com","type":"sign-in"}'`,
      "",
      `TOKEN=$(curl -s -X POST '${baseUrl}/api/auth/sign-in/email-otp' \\`,
      "  -H 'Content-Type: application/json' \\",
      `  -d '{"email":"agent@example.com","otp":"000000"}' | jq -r .token)`,
      "",
      `curl -s -H "Authorization: Bearer $TOKEN" '${baseUrl}/api/wishlist'`,
      "```",
      "",
      "**Demo deployment:** the code is always `000000` (override with `DEMO_OTP`), no email is sent, and an unknown address is registered on first sign-in — so an agent can bootstrap itself from nothing. This holds in every environment, production included, which also means anyone who can reach this server can sign in as any email address. There is no real user data here. `DEMO_OTP=off` switches to random codes, which then need a mail provider in `sendVerificationOTP` in `lib/auth.ts`.",
      "",
      "Checkout needs both credentials at once: the token identifies the user, the cookie jar carries the bag.",
    ].join("\n"),
  )

  sections.push("## Agent quickstart")
  sections.push(
    [
      "A complete buy flow, in order:",
      "",
      "1. `GET /api/collections` — discover valid category slugs.",
      "2. `GET /api/collections/dresses?limit=5` or `GET /api/search?q=summer%20dress` — find candidate products.",
      "3. `GET /api/products/{handle}` — read `variants[].id` for the size or colour you want. That GID is the `merchandiseId`.",
      "4. `POST /api/cart/lines` with `{merchandiseId, quantity}` — creates the bag and its cookie.",
      "5. `GET /api/cart` — confirm lines and totals. Adjust with `PATCH /api/cart/lines` (quantity `0` removes a line).",
      "6. `POST /api/auth/email-otp/send-verification-otp` then `POST /api/auth/sign-in/email-otp` — obtain a bearer token.",
      "7. `POST /api/orders` with the token, the cookie jar, shipping details and the test card `4242424242424242` — converts the bag into an order and empties it.",
      "8. `GET /api/orders` — verify the order was recorded.",
    ].join("\n"),
  )

  for (const group of API_GROUPS) {
    sections.push(`## ${group.name}`)
    sections.push(group.description)
    for (const endpoint of group.endpoints) {
      sections.push(endpointSection(endpoint, baseUrl))
    }
  }

  sections.push("## Schemas")
  sections.push("Shapes referenced by the responses above.")
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    sections.push("```ts\n" + renderSchema(name, schema) + "\n```")
  }

  sections.push("## Limits and gotchas")
  sections.push(
    [
      "- `POST /api/orders` is **not idempotent** — calling it twice with a non-empty bag creates two orders.",
      "- Payment is simulated. Only `4242424242424242` is accepted; any other card returns `order_rejected`.",
      "- Order totals are recomputed server-side (subtotal + 3.99 shipping under a 29 subtotal + 8% tax). Amounts sent by a client are ignored.",
      "- The bag lives in Shopify, so cart endpoints fail with `shopify_unavailable` if the storefront credentials are missing.",
      "- Wishlist and orders need Postgres; without `DATABASE_URL` they return `database_unavailable`.",
      "- No rate limiting and no pagination are implemented.",
      "- Wishlist handles are stored without validating them against the catalogue.",
    ].join("\n"),
  )

  return `${sections.join("\n\n")}\n`
}
