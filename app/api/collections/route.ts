import { CATEGORIES } from "@/lib/categories"
import { handlePublic, json } from "@/lib/api/http"
import { absoluteUrl } from "@/lib/api/url"
import { collectionPath } from "@/lib/routes"

export async function GET(request: Request) {
  return handlePublic(request, async () =>
    json({
      count: CATEGORIES.length,
      collections: CATEGORIES.map((c) => ({
        slug: c.slug,
        name: c.name,
        filter: c.productType ? { productType: c.productType } : { tag: c.tag },
        // Was a relative path. A caller that copies URLs verbatim cannot resolve one.
        url: absoluteUrl(collectionPath(c.slug)),
      })),
    }),
  )
}
