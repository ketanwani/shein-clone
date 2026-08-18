import { DEFAULT_BASE_URL, type ApiEndpoint } from "./spec"

/** Substitutes example values into path params and appends example query params. */
export function examplePath(endpoint: ApiEndpoint) {
  let path = endpoint.path
  for (const param of endpoint.params ?? []) {
    if (param.in === "path") {
      path = path.replace(`{${param.name}}`, encodeURIComponent(String(param.example)))
    }
  }

  const query = (endpoint.params ?? []).filter((p) => p.in === "query")
  if (query.length > 0) {
    path += `?${query.map((p) => `${p.name}=${encodeURIComponent(String(p.example))}`).join("&")}`
  }
  return path
}

export function exampleBody(endpoint: ApiEndpoint): Record<string, string | number> | null {
  if (!endpoint.body) return null
  return Object.fromEntries(endpoint.body.map((field) => [field.name, field.example]))
}

/** A copy-pasteable curl command that exercises the endpoint with its documented examples. */
export function curlFor(endpoint: ApiEndpoint, baseUrl = DEFAULT_BASE_URL) {
  const parts: string[] = ["curl -s"]

  if (endpoint.method !== "GET") parts.push(`-X ${endpoint.method}`)

  // These docs are agent-facing, so show the stateless header path. An agent has no
  // cookie jar and cannot complete an OTP flow, which rules out both browser options.
  if (endpoint.auth === "session" || endpoint.auth === "cart") {
    parts.push(`-H "X-Agent-Key: $AGENT_KEY"`)
    parts.push(`-H "X-Customer-Ref: $CUSTOMER_REF"`)
  }

  // Better Auth routes only understand the session token.
  if (endpoint.auth === "bearer") parts.push(`-H "Authorization: Bearer $TOKEN"`)

  parts.push(`'${baseUrl}${examplePath(endpoint)}'`)

  const body = exampleBody(endpoint)
  if (body) {
    parts.push("-H 'Content-Type: application/json'")
    parts.push(`-d '${JSON.stringify(body)}'`)
  } else if (endpoint.method === "POST" || endpoint.method === "PATCH") {
    // Better Auth rejects bodyless POSTs with 415 unless the JSON content type is set.
    parts.push("-H 'Content-Type: application/json'")
    parts.push("-d '{}'")
  }

  // Wrap onto continuation lines so long commands stay readable.
  const lines: string[] = []
  let current = ""
  for (const part of parts) {
    if (current && `${current} ${part}`.length > 76) {
      lines.push(current)
      current = `  ${part}`
    } else {
      current = current ? `${current} ${part}` : part
    }
  }
  lines.push(current)
  return lines.join(" \\\n")
}
