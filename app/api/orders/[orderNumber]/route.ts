import { getOrderByNumberAction } from "@/app/actions/orders"
import { handle, json, notFound, requireUser } from "@/lib/api/http"

export async function GET(_request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  return handle(async () => {
    await requireUser()
    const { orderNumber } = await params

    const order = await getOrderByNumberAction(orderNumber)
    if (!order) throw notFound(`No order "${orderNumber}" for the signed-in user.`)
    return json({ order })
  })
}
