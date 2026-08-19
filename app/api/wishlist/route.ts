import { addToServerWishlist, getServerWishlist, getWishlistProducts } from "@/app/actions/wishlist"
import { handle, json, readJsonBody, readString } from "@/lib/api/http"
import { requireShopperSubject } from "@/lib/api/subject"

export async function GET(request: Request) {
  return handle(request, async () => {
    await requireShopperSubject()
    const handles = (await getServerWishlist()) ?? []
    const expand = new URL(request.url).searchParams.get("expand") === "products"

    return json({
      count: handles.length,
      handles,
      ...(expand ? { products: await getWishlistProducts(handles) } : {}),
    })
  })
}

export async function POST(request: Request) {
  return handle(request, async () => {
    await requireShopperSubject()
    const body = await readJsonBody(request)
    const productHandle = readString(body, "handle")

    await addToServerWishlist(productHandle)
    const handles = (await getServerWishlist()) ?? []
    return json({ count: handles.length, handles }, 201)
  })
}
