import { CATEGORIES } from "@/lib/categories"
import { json, requireApiKey } from "@/lib/api/helpers"

export async function GET(req: Request) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  return json({ count: CATEGORIES.length, collections: CATEGORIES })
}
