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
  const headerParams = (endpoint.params ?? []).filter((p) => p.in === "header")

  if (headerParams.length > 0) {
    out.push("Headers:")
    out.push(
      [
        "| name | required | description |",
        "| --- | --- | --- |",
        ...headerParams.map((p) => `| \`${p.name}\` | ${p.required ? "yes" : "no"} | ${paramDescription(p)} |`),
      ].join("\n"),
    )
  }

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
      "| 401 | Missing or wrong `X-Agent-Key`, or no valid session. Fix the credential — retrying as-is will not help. |",
      "| 404 | No such product, collection, or order. |",
      "| 503 | Server is missing Shopify or Postgres configuration. Retrying will not help until it is set up. |",
    ].join("\n"),
  )

  sections.push("## Authentication")
  sections.push(
    [
      "**Agents: two headers, and nothing to carry between calls.**",
      "",
      "| header | answers | set by | changes |",
      "| --- | --- | --- | --- |",
      "| `X-Agent-Key` | Is this really the GLOWA agent? | GLOWA issues one shared secret; the agent platform injects it | static |",
      "| `Authorization` | Which shopper, and did they agree? | the shopper, by returning a code sent to their address | per sign-in, ~7 days |",
      "",
      "`X-Agent-Key` goes on every call. It proves the caller and nothing else.",
      "",
      "**A bearer token is the only way to name a shopper.** The bag, the profile and address book, the wishlist and the order history are all keyed by the signed-in account, so the shopper has to sign in before the *first add-to-bag* — not merely before checkout. There is no anonymous agent bag.",
      "",
      "`X-Customer-Ref` used to be a second answer: an opaque, per-conversation id the agent asserted. It has been removed. A ref is the caller claiming who it is acting for, so everything it unlocked was reachable by anyone holding the shared secret. Requests that still send the header are **ignored, not rejected**, so a stale integration degrades to a recoverable 401 rather than breaking.",
      "",
      "```bash",
      "export AGENT_KEY='...'   # the secret GLOWA issued you",
      "",
      "# 1. Sign the shopper in. The code goes to them, never to you.",
      `curl -s -X POST -H "X-Agent-Key: $AGENT_KEY" -H 'Content-Type: application/json' \\`,
      `  -d '{"email":"ada@example.com","type":"sign-in"}' \\`,
      `  '${baseUrl}/api/auth/email-otp/send-verification-otp'`,
      "",
      `curl -s -X POST -H "X-Agent-Key: $AGENT_KEY" -H 'Content-Type: application/json' \\`,
      `  -d '{"email":"ada@example.com","otp":"123456"}' \\`,
      `  '${baseUrl}/api/auth/sign-in/email-otp'`,
      "# -> {\"data\":{\"token\":\"...\",\"expiresAt\":\"...\",\"expiresAtUnix\":1787739561,\"user\":{...}}}",
      "",
      "export TOKEN='...'   # data.token from the response above",
      "",
      "# 2. Everything shopper-scoped: agent key + the shopper's token.",
      `curl -s -H "X-Agent-Key: $AGENT_KEY" -H "Authorization: Bearer $TOKEN" \\`,
      `  '${baseUrl}/api/cart'`,
      "```",
      "",
      "Rules worth knowing:",
      "",
      "- **Email is never a lookup key.** It is write-only contact data on the profile and the order. No endpoint takes an email and returns a customer, an address book or an order history, so a shopper who claims someone else's address gets their own empty profile.",
      "- Address ids are scoped to their owner. Passing one that belongs to another shopper returns 404, never that person's address.",
      "- **Sign-in never reveals whether an address has an account.** `send-verification-otp` returns the same 200 either way, and every verification failure — wrong code, expired code, too many attempts, address with no account — is the same 401 `invalid_code`. Do not report \"no account found\" to a shopper; you were not told that.",
      "- The account is created when a correct code arrives, not when one is requested, so a mistyped address leaves nothing behind.",
      "- **No refresh token is issued.** Store the expiry and re-run the OTP flow when it passes. It is published twice — `data.expiresAt` (ISO 8601) and `data.expiresAtUnix` (seconds since the epoch, not milliseconds) — so use whichever your platform can read.",
      "- A 401 on a shopper-scoped call is **routine and recoverable**. Re-run the OTP flow and retry; it does not mean the shopper needs a human.",
      "- Never put the OTP in the model's context. It is not in any response body for exactly that reason — an agent holding it could sign the shopper in without them.",
      "- In production, a server with no `AGENT_API_KEY` configured has the agent path disabled and returns 401 for every one of these calls. It fails closed, never open. Outside production the well-known key `dev-agent-key` works so local testing needs no setup.",
      "- `AGENT_API_KEY` accepts a comma-separated list, so the operator can rotate keys without ever leaving you on a rejected one.",
      "",
      "**Browser clients** use one of the other levels instead: catalogue reads are public and need nothing, while a signed-in browser sends a session cookie or a bearer token from `POST /api/auth/sign-in/email`. An anonymous browser bag rides on an httpOnly `cartId` cookie the browser returns by itself, and is adopted by the account on the first authenticated call.",
    ].join("\n"),
  )

  sections.push("## Agent quickstart")
  sections.push(
    [
      "A complete buy flow. Send `X-Agent-Key` on every call, and `Authorization: Bearer <token>` from step 4 onwards.",
      "",
      "1. `GET /api/collections` — discover valid category slugs.",
      "2. `GET /api/collections/dresses?limit=5` or `GET /api/search?q=summer%20dress` — find candidate products.",
      "3. `GET /api/products/{handle}` — read `variants[].id` for the size or colour you want. That GID is the `merchandiseId`. Steps 1-3 are public and need no token.",
      "4. **Sign the shopper in** — `POST /api/auth/email-otp/send-verification-otp`, then `POST /api/auth/sign-in/email-otp` with the code they read back to you. Keep `data.token`. This has to happen before the bag, not before checkout: there is no anonymous agent bag.",
      "5. `POST /api/cart/lines` with `{merchandiseId, quantity}` — fills the bag for the signed-in shopper.",
      "6. `GET /api/cart` — confirm lines and totals. Adjust with `PATCH /api/cart/lines` (quantity `0` removes a line).",
      "7. `GET /api/customer` — read `missing` to see which of `email`, `name` and `shipping_address` you still need to ask for, and `addresses` to offer a saved one.",
      "8. `POST /api/orders` with the test card `4242424242424242`, plus either `address_id` from step 7 or a full inline address. Converts the bag into an order and empties it. Add an `Idempotency-Key` header so a retry cannot buy twice.",
      "9. `GET /api/orders` — verify the order was recorded.",
      "",
      "On a return visit step 7 comes back with `missing: []`, so step 8 is an `address_id` and a card and nothing else. If a stored token is still inside its expiry, skip step 4 as well and go straight to the bag.",
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
      "- No pagination is implemented. The only rate limits are on `send-verification-otp`: **3 codes per email address per 10 minutes**, and **600 requests per source IP per 10 minutes** as a runaway backstop. The per-address limit is the meaningful one; the per-IP ceiling sits far above what shared egress produces, since every shopper the integration signs in comes from the same few addresses. Both counters are in-process, so they are per server instance.",
      "- Sessions last 7 days and there is no refresh token. `data.expiresAt` says when to sign the shopper in again.",
      "- Wishlist handles are stored without validating them against the catalogue.",
    ].join("\n"),
  )

  return `${sections.join("\n\n")}\n`
}
