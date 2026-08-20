import {
  API_GROUPS,
  API_TITLE,
  API_VERSION,
  DEFAULT_BASE_URL,
  SCHEMAS,
  type ApiEndpoint,
  type ApiGroup,
  type JsonSchema,
} from "./spec"

function operationId(endpoint: ApiEndpoint) {
  const segments = endpoint.path
    .replace(/^\/api\//, "")
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith("{")
        ? `By${segment.slice(1, -1).replace(/^./, (c) => c.toUpperCase())}`
        : segment.replace(/-./g, (m) => m[1].toUpperCase()).replace(/^./, (c) => c.toUpperCase()),
    )
  return endpoint.method.toLowerCase() + segments.join("")
}

// X-Agent-Key is required in every case; what varies is how the shopper is named.
// Separate objects are alternatives (OR), keys within one are required together (AND).
const BY_TOKEN = { agentKey: [], bearerAuth: [] }
const BY_EMAIL = { agentKey: [], shopperEmail: [] }
const SHOPPER_REQUIREMENT = [BY_TOKEN, BY_EMAIL]

function security(endpoint: ApiEndpoint) {
  // Better Auth owns these and does not read X-Agent-Key.
  if (endpoint.auth === "bearer") return [{ bearerAuth: [] }]
  // Sign-in: the caller proves itself, and there is no shopper to name yet.
  if (endpoint.auth === "agentKey") return [{ agentKey: [] }]
  // A real session, so X-Shopper-Email cannot stand in for it.
  if (endpoint.auth === "agentKeyBearer") return [BY_TOKEN]
  // The shared secret, plus the shopper named by a token or by an email header.
  if (endpoint.auth === "shopper") return SHOPPER_REQUIREMENT
  // Same for an agent, plus the two browser forms. An agent has no anonymous option:
  // {} and cartCookie are reachable only without X-Agent-Key.
  if (endpoint.auth === "cart") return [...SHOPPER_REQUIREMENT, { cartCookie: [] }, {}]
  return []
}

// Headers that back a security scheme must not also appear as parameters — OpenAPI
// treats that as a duplicate declaration. They stay in spec.ts so the human-readable
// docs can show them inline.
const SECURITY_HEADERS = new Set(["x-agent-key", "x-customer-ref", "authorization"])

function documentedParams(endpoint: ApiEndpoint) {
  return (endpoint.params ?? []).filter((param) => !SECURITY_HEADERS.has(param.name.toLowerCase()))
}

function requestBody(endpoint: ApiEndpoint) {
  if (!endpoint.body) return undefined

  const properties = Object.fromEntries(
    endpoint.body.map((field) => [
      field.name,
      { type: field.type === "integer" ? "integer" : "string", description: field.description, example: field.example },
    ]),
  )
  const required = endpoint.body.filter((f) => f.required).map((f) => f.name)

  return {
    required: required.length > 0,
    content: {
      "application/json": {
        schema: { type: "object", properties, ...(required.length > 0 ? { required } : {}) },
        example: Object.fromEntries(endpoint.body.map((f) => [f.name, f.example])),
      },
    },
  }
}

/**
 * OpenAPI allows exactly one entry per status code, but an endpoint can genuinely fail
 * two ways with the same one — a missing body field and a missing header are both 400.
 * Merging keeps both descriptions; building the object naively would silently drop all
 * but the last, which is worse than a crowded description.
 */
function responses(endpoint: ApiEndpoint) {
  const byStatus = new Map<string, { description: string[]; examples: unknown[]; schema?: JsonSchema }>()

  for (const response of endpoint.responses) {
    const status = String(response.status)
    const entry = byStatus.get(status) ?? { description: [], examples: [] }
    entry.description.push(response.description)
    if (response.example !== undefined) entry.examples.push(response.example)
    entry.schema ??= response.schema
    byStatus.set(status, entry)
  }

  return Object.fromEntries(
    [...byStatus].map(([status, entry]) => {
      // One example is `example`; several become `examples`, which is how OpenAPI 3.1
      // expresses alternatives.
      const content =
        entry.schema || entry.examples.length > 0
          ? {
              content: {
                "application/json": {
                  ...(entry.schema ? { schema: entry.schema } : {}),
                  ...(entry.examples.length === 1 ? { example: entry.examples[0] } : {}),
                  ...(entry.examples.length > 1
                    ? {
                        examples: Object.fromEntries(
                          entry.examples.map((value, index) => [`case${index + 1}`, { value }]),
                        ),
                      }
                    : {}),
                },
              },
            }
          : {}

      return [status, { description: entry.description.join(" — or — "), ...content }]
    }),
  )
}

function operation(group: ApiGroup, endpoint: ApiEndpoint) {
  const description = [endpoint.description, ...(endpoint.notes ?? []).map((note) => `Note: ${note}`)].join("\n\n")

  return {
    tags: [group.name],
    operationId: operationId(endpoint),
    summary: endpoint.summary,
    description,
    ...(documentedParams(endpoint).length
      ? {
          parameters: documentedParams(endpoint).map((param) => ({
            name: param.name,
            in: param.in,
            required: param.in === "path" ? true : Boolean(param.required),
            description: param.description,
            schema: {
              type: param.type,
              ...(param.enum ? { enum: param.enum } : {}),
              ...(param.default !== undefined ? { default: param.default } : {}),
            },
            example: param.example,
          })),
        }
      : {}),
    ...(requestBody(endpoint) ? { requestBody: requestBody(endpoint) } : {}),
    responses: responses(endpoint),
    security: security(endpoint),
  }
}

/** Builds the OpenAPI 3.1 document from the endpoint registry in lib/api/spec.ts. */
export function buildOpenApiDocument(baseUrl = DEFAULT_BASE_URL) {
  const paths: Record<string, Record<string, unknown>> = {}

  for (const group of API_GROUPS) {
    for (const endpoint of group.endpoints) {
      paths[endpoint.path] ??= {}
      paths[endpoint.path][endpoint.method.toLowerCase()] = operation(group, endpoint)
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: API_TITLE,
      version: API_VERSION,
      description:
        "REST surface of the GLOWA storefront, intended for AI agent integration.\n\n**Two credentials, one each for the two questions.** `X-Agent-Key` proves the *caller* is the GLOWA agent. Naming the *shopper* is separate, and there are two ways to do it: `Authorization: Bearer <token>` from the email-OTP flow, or `X-Shopper-Email` carrying the shopper's address. If both arrive the token wins. The agent key never substitutes for naming a shopper, and naming one never substitutes for the agent key.\n\n**Catalogue reads are public** — products, search, collections and recommendations need no credentials at all.\n\n**Everything else needs both.** The bag, the customer profile and address book, the wishlist and orders are all keyed by the resulting account, so every one of those calls — including the first add-to-bag — must name a shopper. A call that names nobody is a 400 listing both options; a call with a missing or wrong agent key is a 401.\n\nAn address seen for the first time provisions that shopper. Addresses are trimmed and lowercased, so `Ada@Example.com` and `ada@example.com` are one person.\n\n⚠️ **SECURITY: `X-Shopper-Email` is asserted by the caller and proves nothing.** Anyone holding `X-Agent-Key` can read or modify ANY shopper's bag, wishlist, profile and order history simply by naming their email address. This is the same weakness `X-Customer-Ref` was removed for, knowingly reintroduced. The email-OTP bearer token is the correct mechanism and remains fully implemented — the only reason this mode exists is that the Instagram agent runtime cannot yet carry a token between calls. It is off unless the server sets `ALLOW_SHOPPER_EMAIL_HEADER`, and it is acceptable only on this demo deployment, which holds mock products, simulated payments and no real shopper data. Do not enable it anywhere that does.\n\nEvery call is independent and no cookie jar is required. Browser clients keep using a session cookie, and an anonymous browser bag still rides on a `cartId` cookie until its shopper signs in. POST /api/orders accepts an Idempotency-Key so retries cannot buy twice. Payment is simulated — only the test card 4242424242424242 is accepted.",

    },
    servers: [{ url: baseUrl, description: "Local development" }],
    tags: API_GROUPS.map((group) => ({ name: group.name, description: group.description })),
    paths,
    components: {
      schemas: SCHEMAS,
      securitySchemes: {
        agentKey: {
          type: "apiKey",
          in: "header",
          name: "X-Agent-Key",
          description:
            "Shared secret issued by GLOWA to the agent platform, proving the caller is the GLOWA agent. Static across conversations and compared in constant time. It proves the caller and nothing else — on any shopper-scoped route it must be paired with something that names the shopper, either bearerAuth or shopperEmail, and neither substitutes for the other. The server accepts any key in its AGENT_API_KEY list, so keys can be rotated without downtime. Outside production the well-known key `dev-agent-key` also works; in production there is no fallback and agent routes return 401 until AGENT_API_KEY is set.",
        },
        shopperEmail: {
          type: "apiKey",
          in: "header",
          name: "X-Shopper-Email",
          description:
            "The shopper's email address, naming who a call is for. Trimmed and lowercased, so Ada@Example.com and ada@example.com are one shopper; an address seen for the first time provisions that shopper. Used only when no bearer token is sent — the token always wins.\n\nWARNING: this is asserted by the caller and proves nothing. Anyone holding agentKey can read or modify any shopper's bag, wishlist, profile and order history by naming their address, which is the same weakness X-Customer-Ref was removed for. It exists only because the agent runtime cannot currently carry a bearer token between calls; the email-OTP token is the correct mechanism and is still implemented. Off unless the server sets ALLOW_SHOPPER_EMAIL_HEADER, and acceptable only on a demo deployment with mock products and simulated payments.",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Session token, sent as `Authorization: Bearer <token>`. Valid for 7 days, and no refresh token is issued — re-run sign-in when it expires. An agent gets one for a named shopper from POST /api/auth/sign-in/email-otp, where it is at `data.token` with its expiry given twice: `data.expiresAt` as an ISO 8601 timestamp and `data.expiresAtUnix` as whole seconds since the epoch. The website's own password login at POST /api/auth/sign-in/email also returns one. It is the stronger of the two ways to name a shopper and always wins over shopperEmail, and on every shopper-scoped route it is sent *in addition to* agentKey, never instead of it.",
        },
        cartCookie: {
          type: "apiKey",
          in: "cookie",
          name: "cartId",
          description:
            "Anonymous browser bag, set by the first POST /api/cart/lines and returned automatically by the browser. Adopted by the account on the first authenticated call. Not usable by an agent, which cannot carry a cookie between calls — an agent names the shopper with X-Shopper-Email or a bearer token instead.",
        },
      },
    },
  }
}
