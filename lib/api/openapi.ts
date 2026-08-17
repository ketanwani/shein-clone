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

function security(endpoint: ApiEndpoint) {
  // Checkout needs both at once, so they go in a single requirement object (AND, not OR).
  if (endpoint.auth === "session" && endpoint.usesCart) return [{ bearerAuth: [], cartCookie: [] }]
  if (endpoint.auth === "session") return [{ bearerAuth: [] }]
  if (endpoint.auth === "cart") return [{ cartCookie: [] }]
  return []
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
    ...(endpoint.params?.length
      ? {
          parameters: endpoint.params.map((param) => ({
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
        "REST surface of the GLOWA storefront, intended for AI agent integration. Catalogue reads are public; the bag is keyed by an httpOnly cartId cookie; wishlist and orders require a per-user bearer token obtained through the email OTP flow. Payment is simulated — only the test card 4242424242424242 is accepted.",
    },
    servers: [{ url: baseUrl, description: "Local development" }],
    tags: API_GROUPS.map((group) => ({ name: group.name, description: group.description })),
    paths,
    components: {
      schemas: SCHEMAS,
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Session token from POST /api/auth/sign-in/email-otp, sent as `Authorization: Bearer <token>`. Valid for 7 days.",
        },
        cartCookie: {
          type: "apiKey",
          in: "cookie",
          name: "cartId",
          description: "Set by the first POST /api/cart/lines.",
        },
      },
    },
  }
}
