import type { JsonSchema } from "./spec"

const PRIMITIVES: Record<string, string> = {
  string: "string",
  integer: "number",
  number: "number",
  boolean: "boolean",
  null: "null",
}

function refName(schema: JsonSchema) {
  const ref = schema.$ref
  return typeof ref === "string" ? ref.replace("#/components/schemas/", "") : null
}

/** Renders a JSON Schema as a compact TypeScript-style type, for docs only. */
function renderType(schema: JsonSchema): string {
  const named = refName(schema)
  if (named) return named

  if (Array.isArray(schema.oneOf)) {
    return (schema.oneOf as JsonSchema[]).map(renderType).join(" | ")
  }

  if (schema.type === "array") {
    const inner = renderType((schema.items ?? {}) as JsonSchema)
    return inner.includes(" ") ? `Array<${inner}>` : `${inner}[]`
  }

  if (schema.type === "object") {
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
    const entries = Object.entries(properties).map(([key, value]) => `${key}: ${renderType(value)}`)
    return entries.length > 0 ? `{ ${entries.join("; ")} }` : "object"
  }

  return PRIMITIVES[String(schema.type)] ?? "unknown"
}

/** Top-level renderer: one field per line, with descriptions as trailing comments. */
export function renderSchema(name: string, schema: JsonSchema): string {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
  const required = new Set((schema.required as string[] | undefined) ?? [])

  const lines = Object.entries(properties).map(([key, value]) => {
    const optional = required.size > 0 && !required.has(key) ? "?" : ""
    const description = typeof value.description === "string" ? `  // ${value.description}` : ""
    return `  ${key}${optional}: ${renderType(value)}${description}`
  })

  return `type ${name} = {\n${lines.join("\n")}\n}`
}

export { renderType }
