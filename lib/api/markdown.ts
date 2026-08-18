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
      "| `X-Customer-Ref` | Which shopper is this for? | the agent, per conversation | every request |",
      "",
      "Send both on any Cart, Wishlist or Orders call. The bag, wishlist and order history are keyed by the customer ref, so each request stands alone — no cookie jar, no session token, and no sign-in step for the shopper. An unseen ref is provisioned automatically on first use.",
      "",
      "```bash",
      "export AGENT_KEY='...'                    # the secret GLOWA issued you",
      "export CUSTOMER_REF='ig_17841400000000000' # opaque, stable, one per shopper",
      "",
      `curl -s -H "X-Agent-Key: $AGENT_KEY" -H "X-Customer-Ref: $CUSTOMER_REF" \\`,
      `  '${baseUrl}/api/wishlist'`,
      "```",
      "",
      "Rules worth knowing:",
      "",
      "- `X-Customer-Ref` is opaque. Do not send an email address as the ref, and do not expect the server to parse it.",
      "- **Email is never a lookup key.** It is write-only contact data on the profile and the order. No endpoint takes an email and returns a customer, an address book or an order history, so a shopper who claims someone else's address gets their own empty profile.",
      "- Address ids are scoped to their owner. Passing one that belongs to another customer ref returns 404, never that person's address.",
      "- Sending `X-Customer-Ref` without a valid `X-Agent-Key` is a 401, never an anonymous fallback.",
      "- In production, a server with no `AGENT_API_KEY` configured has the agent path disabled and returns 401 for every one of these calls. It fails closed, never open. Outside production the well-known key `dev-agent-key` works so local testing needs no setup.",
      "- `AGENT_API_KEY` accepts a comma-separated list, so the operator can rotate keys without ever leaving you on a rejected one.",
      "",
      "**Browser clients** use one of the other two levels instead: catalogue reads are public and need nothing, while a signed-in browser sends a session cookie or a bearer token from `POST /api/auth/sign-in/email`. An anonymous browser bag rides on an httpOnly `cartId` cookie the browser returns by itself. There is no passwordless sign-in — a demo one that accepted a fixed code would let anyone sign in as any address.",
    ].join("\n"),
  )

  sections.push("## Agent quickstart")
  sections.push(
    [
      "A complete buy flow. Send `X-Agent-Key` and `X-Customer-Ref` on steps 4 onwards; there is no sign-in step.",
      "",
      "1. `GET /api/collections` — discover valid category slugs.",
      "2. `GET /api/collections/dresses?limit=5` or `GET /api/search?q=summer%20dress` — find candidate products.",
      "3. `GET /api/products/{handle}` — read `variants[].id` for the size or colour you want. That GID is the `merchandiseId`.",
      "4. `POST /api/cart/lines` with `{merchandiseId, quantity}` — fills the bag for this customer ref. No profile data needed to get this far.",
      "5. `GET /api/cart` — confirm lines and totals. Adjust with `PATCH /api/cart/lines` (quantity `0` removes a line).",
      "6. `GET /api/customer` — **only now**. Read `missing` to see which of `email`, `name` and `shipping_address` you still need to ask for, and `addresses` to offer a saved one.",
      "7. `POST /api/orders` with the test card `4242424242424242`, plus either `address_id` from step 6 or a full inline address. Converts the bag into an order and empties it. Add an `Idempotency-Key` header so a retry cannot buy twice.",
      "8. `GET /api/orders` — verify the order was recorded.",
      "",
      "On a return visit step 6 comes back with `missing: []`, so step 7 is an `address_id` and a card and nothing else. Do not ask for profile details before step 6 — browsing and adding to the bag need none of it.",
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
