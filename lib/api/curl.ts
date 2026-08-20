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

  // Sign-in: the caller proves itself, and there is no shopper to name yet.
  if (endpoint.auth === "agentKey") parts.push(`-H "X-Agent-Key: $AGENT_KEY"`)

  // Agent-facing docs, so these show the header the agent actually sends: the caller
  // credential plus the shopper's address. A browser reaches the same routes with a
  // cookie, which a curl example cannot usefully illustrate.
  if (endpoint.auth === "shopper" || endpoint.auth === "cart") {
    parts.push(`-H "X-Agent-Key: $AGENT_KEY"`)
    parts.push(`-H "X-Shopper-Email: $SHOPPER_EMAIL"`)
  }

  // get-session inspects a live session, so it is the one shopper-scoped route an
  // address cannot stand in for.
  if (endpoint.auth === "agentKeyBearer") {
    parts.push(`-H "X-Agent-Key: $AGENT_KEY"`)
    parts.push(`-H "Authorization: Bearer $TOKEN"`)
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
