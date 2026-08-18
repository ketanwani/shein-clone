import { API_GROUPS, API_TITLE, API_VERSION, DEFAULT_BASE_URL, SCHEMAS, type ApiEndpoint, type ApiGroup } from "./spec"

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

function security(endpoint: ApiEndpoint) {
  // Better Auth owns these and does not read the agent headers.
  if (endpoint.auth === "bearer") return [{ bearerAuth: [] }]
  // Agent headers or a signed-in session.
  if (endpoint.auth === "session") return [AGENT_REQUIREMENT, { bearerAuth: [] }]
  // Same, plus the anonymous browser case — {} means "no credentials also works".
  if (endpoint.auth === "cart") return [AGENT_REQUIREMENT, { bearerAuth: [] }, { cartCookie: [] }, {}]
  return []
}

// Headers that back a security scheme must not also appear as parameters — OpenAPI
// treats that as a duplicate declaration. They stay in spec.ts so the human-readable
// docs can show them inline.
const SECURITY_HEADERS = new Set(["x-agent-key", "x-customer-ref"])

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

function responses(endpoint: ApiEndpoint) {
  return Object.fromEntries(
    endpoint.responses.map((response) => [
      String(response.status),
      {
        description: response.description,
        ...(response.schema || response.example !== undefined
          ? {
              content: {
                "application/json": {
                  ...(response.schema ? { schema: response.schema } : {}),
                  ...(response.example !== undefined ? { example: response.example } : {}),
                },
              },
            }
          : {}),
      },
    ]),
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
        "REST surface of the GLOWA storefront, intended for AI agent integration. Catalogue reads are public. For everything user-scoped — bag, wishlist, orders — a trusted agent sends X-Agent-Key (its shared secret) and X-Customer-Ref (an opaque, stable id for the shopper it is acting for); every call is independent, so no cookie jar and no shopper sign-in are needed. Browser clients keep using a session cookie or bearer token instead. POST /api/orders accepts an Idempotency-Key so retries cannot buy twice. Payment is simulated — only the test card 4242424242424242 is accepted.",
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
            "Shared secret issued by GLOWA to the agent platform, proving the caller is the GLOWA agent. Static across conversations, compared in constant time, and always paired with X-Customer-Ref on user-scoped routes. Agent routes are disabled and return 401 when the server has no AGENT_API_KEY configured.",
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
            "Session token from POST /api/auth/sign-in/email, sent as `Authorization: Bearer <token>`. Valid for 7 days. Browser clients only — agents use agentKey with customerRef and need no token.",
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
