import { getServerWishlist, removeFromServerWishlist } from "@/app/actions/wishlist"
import { handle as withErrors, json, requireUser } from "@/lib/api/http"

export async function DELETE(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  return withErrors(request, async () => {
    await requireUser()
    const { handle } = await params

    await removeFromServerWishlist(handle)
    const handles = (await getServerWishlist()) ?? []
    return json({ count: handles.length, handles })
  })
}
