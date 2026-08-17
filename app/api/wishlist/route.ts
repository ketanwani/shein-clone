import { addToServerWishlist, getServerWishlist, getWishlistProducts } from "@/app/actions/wishlist"
import { handle, json, readJsonBody, readString, requireUser } from "@/lib/api/http"

export async function GET(request: Request) {
  return handle(async () => {
    await requireUser()
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
  return handle(async () => {
    await requireUser()
    const body = await readJsonBody(request)
    const productHandle = readString(body, "handle")

    await addToServerWishlist(productHandle)
    const handles = (await getServerWishlist()) ?? []
    return json({ count: handles.length, handles }, 201)
  })
}
