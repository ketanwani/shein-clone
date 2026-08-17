import { buildMarkdown } from "@/lib/api/markdown"

/** The same reference as /docs/api, as plain markdown to paste into an agent's context. */
export async function GET(request: Request) {
  return new Response(buildMarkdown(new URL(request.url).origin), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  })
}
