import { getServerWishlist, removeFromServerWishlist } from "@/app/actions/wishlist"
import { handle as withErrors, json } from "@/lib/api/http"
import { requireSessionSubject } from "@/lib/api/subject"

export async function DELETE(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  return withErrors(request, async () => {
    await requireSessionSubject()
    const { handle } = await params

    await removeFromServerWishlist(handle)
    const handles = (await getServerWishlist()) ?? []
    return json({ count: handles.length, handles })
  })
}
