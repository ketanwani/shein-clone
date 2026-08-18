import { buildOpenApiDocument } from "@/lib/api/openapi"
import { handlePublic, json } from "@/lib/api/http"

/** Machine-readable spec, generated from lib/api/spec.ts. */
export async function GET(request: Request) {
  return handlePublic(request, async () => json(buildOpenApiDocument(new URL(request.url).origin)))
}
