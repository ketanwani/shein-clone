import { getOrderForUser } from "@/lib/orders/core"
import { apiError, json, requireApiKey, resolveUserId } from "@/lib/api/helpers"

// GET /api/v1/orders/GLW-123456?userId=...|email=...
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const unauthorized = requireApiKey(req)
  if (unauthorized) return unauthorized

  const { orderNumber } = await params
  const { searchParams } = new URL(req.url)
  const userId = await resolveUserId({
    userId: searchParams.get("userId"),
    email: searchParams.get("email"),
  })
  if (!userId) return apiError("Unknown user. Provide a valid 'userId' or 'email'.", 404)

  const order = await getOrderForUser(userId, orderNumber)
  if (!order) return apiError(`Order '${orderNumber}' not found for this user.`, 404)
  return json({ order })
}
