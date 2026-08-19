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

// Both credentials are required together, so they share one requirement object (AND).
// There is no second entry, because there is no alternative — that is the point.
const SHOPPER_REQUIREMENT = { agentKey: [], bearerAuth: [] }

function security(endpoint: ApiEndpoint) {
  // Better Auth owns these and does not read X-Agent-Key.
  if (endpoint.auth === "bearer") return [{ bearerAuth: [] }]
  // Sign-in: the caller proves itself, and there is no shopper to name yet.
  if (endpoint.auth === "agentKey") return [{ agentKey: [] }]
  // The shared secret AND the shopper's own token. Not alternatives.
  if (endpoint.auth === "shopper") return [SHOPPER_REQUIREMENT]
  // Same for an agent, plus the two browser forms. An agent has no anonymous option:
  // {} and cartCookie are reachable only without X-Agent-Key.
  if (endpoint.auth === "cart") return [SHOPPER_REQUIREMENT, { cartCookie: [] }, {}]
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
        "REST surface of the GLOWA storefront, intended for AI agent integration.\n\n**Two credentials, one each for the two questions.** `X-Agent-Key` proves the *caller* is the GLOWA agent. A bearer token, which the *shopper* obtains themselves through the email-OTP flow, proves who the call is for. They are checked independently: a valid token with no agent key is rejected, and so is an agent key with no token.\n\n**Catalogue reads are public** — products, search, collections and recommendations need no credentials at all.\n\n**Everything else needs both.** The bag, the customer profile and address book, the wishlist and orders are all keyed by the signed-in account, so **the shopper must be signed in before any cart, wishlist, customer or order call — including the first add-to-bag.** Sign them in with POST /api/auth/email-otp/send-verification-otp followed by POST /api/auth/sign-in/email-otp, which returns the token at `data.token` and its expiry at both `data.expiresAt` (ISO 8601) and `data.expiresAtUnix` (epoch seconds). A 401 on any of these routes is routine and recoverable: re-run that flow and retry.\n\n`X-Customer-Ref` has been removed. It was the caller asserting which shopper it was acting for, which meant anything it unlocked was reachable by anyone holding the shared secret. Requests that still send the header are ignored rather than rejected, so a stale integration degrades instead of breaking.\n\nEvery call is independent and no cookie jar is required. Browser clients keep using a session cookie, and an anonymous browser bag still rides on a `cartId` cookie until its shopper signs in. POST /api/orders accepts an Idempotency-Key so retries cannot buy twice. Payment is simulated — only the test card 4242424242424242 is accepted.",

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
            "Shared secret issued by GLOWA to the agent platform, proving the caller is the GLOWA agent. Static across conversations and compared in constant time. It proves the caller and nothing else — on any shopper-scoped route it must be paired with that shopper's bearer token, and neither credential substitutes for the other. The server accepts any key in its AGENT_API_KEY list, so keys can be rotated without downtime. Outside production the well-known key `dev-agent-key` also works; in production there is no fallback and agent routes return 401 until AGENT_API_KEY is set.",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Session token, sent as `Authorization: Bearer <token>`. Valid for 7 days, and no refresh token is issued — re-run sign-in when it expires. An agent gets one for a named shopper from POST /api/auth/sign-in/email-otp, where it is at `data.token` with its expiry given twice: `data.expiresAt` as an ISO 8601 timestamp and `data.expiresAtUnix` as whole seconds since the epoch. The website's own password login at POST /api/auth/sign-in/email also returns one. This is the only way to identify a shopper, and on every shopper-scoped route it is required *in addition to* agentKey.",
        },
        cartCookie: {
          type: "apiKey",
          in: "cookie",
          name: "cartId",
          description:
            "Anonymous browser bag, set by the first POST /api/cart/lines and returned automatically by the browser. Adopted by the account on the first authenticated call. Not usable by an agent, which cannot carry a cookie between calls — an agent signs the shopper in and uses their bearer token instead.",
        },
      },
    },
  }
}
