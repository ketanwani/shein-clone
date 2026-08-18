import { CATEGORIES } from "@/lib/categories"
import { handle, json } from "@/lib/api/http"

export async function GET(request: Request) {
  return handle(request, async () =>
    json({
      count: CATEGORIES.length,
      collections: CATEGORIES.map((c) => ({
        slug: c.slug,
        name: c.name,
        filter: c.productType ? { productType: c.productType } : { tag: c.tag },
        url: `/collections/${c.slug}`,
      })),
    }),
  )
}
