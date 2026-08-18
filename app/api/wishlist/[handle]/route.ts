import { getServerWishlist, removeFromServerWishlist } from "@/app/actions/wishlist"
import { handle as withErrors, json } from "@/lib/api/http"
import { requireSubject } from "@/lib/api/subject"

export async function DELETE(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  return withErrors(request, async () => {
    await requireSubject()
    const { handle } = await params

    await removeFromServerWishlist(handle)
    const handles = (await getServerWishlist()) ?? []
    return json({ count: handles.length, handles })
  })
}
