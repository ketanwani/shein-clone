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

// The agent presents both headers together, so they share one requirement object (AND).
// Separate objects in the array are alternatives (OR).
const AGENT_REQUIREMENT = { agentKey: [], customerRef: [] }

// Both credentials are required together, so they share one requirement object (AND).
// There is no second entry, because there is no alternative — that is the point.
const SHOPPER_REQUIREMENT = { agentKey: [], bearerAuth: [] }

function security(endpoint: ApiEndpoint) {
  // Better Auth owns these and does not read the agent headers.
  if (endpoint.auth === "bearer") return [{ bearerAuth: [] }]
  // Agent-only: no browser equivalent, so no session alternative.
  if (endpoint.auth === "agent") return [AGENT_REQUIREMENT]
  // Sign-in: the caller proves itself, and there is no shopper to name yet.
  if (endpoint.auth === "agentKey") return [{ agentKey: [] }]
  // The shared secret AND the shopper's own token. Not alternatives.
  if (endpoint.auth === "shopper") return [SHOPPER_REQUIREMENT]
  // Agent headers or a signed-in session.
  if (endpoint.auth === "session") return [AGENT_REQUIREMENT, { bearerAuth: [] }]
  // Same, plus the anonymous browser case — {} means "no credentials also works".
  if (endpoint.auth === "cart") return [AGENT_REQUIREMENT, { bearerAuth: [] }, { cartCookie: [] }, {}]
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
        "REST surface of the GLOWA storefront, intended for AI agent integration. Catalogue reads are public.\n\nEverything else needs X-Agent-Key, the shared secret proving the caller is the GLOWA agent. What identifies the *shopper* depends on how much is being asked. For the bag and the customer profile it is X-Customer-Ref, an opaque per-conversation id the agent asserts. For the wishlist and the order history — including POST /api/orders — it is a bearer token the shopper obtained themselves, by receiving a code at their address and returning it: POST /api/auth/email-otp/send-verification-otp, then POST /api/auth/sign-in/email-otp, which returns the token at `data.token` with its expiry at both `data.expiresAt` (ISO 8601) and `data.expiresAtUnix` (epoch seconds). A ref is not accepted in the token's place on those routes; without a token they answer 401.\n\nSend all three credentials on every call. The two are checked independently — a valid token with no agent key is rejected, and so is an agent key with no token — and the token decides identity. X-Customer-Ref is reconciled against it rather than competing with it: the first call carrying both hands that ref's shopper, bag, addresses and history over to the account, and a ref already belonging to a different account is 409 customer_ref_mismatch rather than a silent choice. This handover is what lets an agent fill a bag before the shopper signs in and still check out with it.\n\nEvery call is independent and no cookie jar is required. Browser clients keep using a session cookie. POST /api/orders accepts an Idempotency-Key so retries cannot buy twice. Payment is simulated — only the test card 4242424242424242 is accepted.",

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
            "Shared secret issued by GLOWA to the agent platform, proving the caller is the GLOWA agent. Static across conversations, compared in constant time, and always paired with X-Customer-Ref on user-scoped routes. The server accepts any key in its AGENT_API_KEY list, so keys can be rotated without downtime. Outside production the well-known key `dev-agent-key` also works; in production there is no fallback and agent routes return 401 until AGENT_API_KEY is set.",
        },
        customerRef: {
          type: "apiKey",
          in: "header",
          name: "X-Customer-Ref",
          description:
            "Opaque, stable id for the shopper the agent is acting for, e.g. an Instagram-scoped user id. Set per conversation by the agent, and treated as a bare string — never parsed and never an email address. First use provisions the shopper automatically; thereafter it scopes the bag, wishlist and orders. Sending it without a valid X-Agent-Key is rejected with 401.",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Session token, sent as `Authorization: Bearer <token>`. Valid for 7 days, and no refresh token is issued — re-run sign-in when it expires. An agent gets one for a named shopper from POST /api/auth/sign-in/email-otp, where it is at `data.token` with its expiry at `data.expiresAt`; the website's own password login at POST /api/auth/sign-in/email also returns one. On the wishlist and orders this is required *in addition to* agentKey, and X-Customer-Ref is not accepted in its place.",
        },
        cartCookie: {
          type: "apiKey",
          in: "cookie",
          name: "cartId",
          description:
            "Anonymous browser bag, set by the first POST /api/cart/lines. Not usable by an agent, which cannot carry a cookie between calls — use X-Customer-Ref instead.",
        },
      },
    },
  }
}
