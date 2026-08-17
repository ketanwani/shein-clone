import { buildOpenApiDocument } from "@/lib/api/openapi"
import { handle, json } from "@/lib/api/http"

/** Machine-readable spec, generated from lib/api/spec.ts. */
export async function GET(request: Request) {
  return handle(async () => json(buildOpenApiDocument(new URL(request.url).origin)))
}
