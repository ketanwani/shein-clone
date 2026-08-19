/**
 * Overrides the Better Auth catch-all so an absent session is an error, not a 200.
 *
 * Better Auth answers 200 with a `null` body when nothing is signed in. The agent
 * branches on the status to decide whether to re-run sign-in, and a 200 with an empty
 * body reads as success — so this answers 401 `unauthorized` instead. The success body
 * keeps Better Auth's `{ session, user }` shape, which is already documented and
 * integrated.
 */

import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { requireAgentKey } from "@/lib/api/agent"
import { assertDatabaseConfigured, handle, json } from "@/lib/api/http"
import { ApiFailure } from "@/lib/api/failure"

export async function GET(request: Request) {
  return handle(request, async () => {
    await requireAgentKey()
    assertDatabaseConfigured()

    const result = await auth.api.getSession({ headers: await headers() })
    if (!result?.user) {
      throw new ApiFailure(
        401,
        "unauthorized",
        "No active session for this token.",
        'This is expected and recoverable — do not hand off to a human. The token is missing, malformed or expired. Sign the shopper in again: POST /api/auth/email-otp/send-verification-otp with {email, type:"sign-in"}, ask them for the 6-digit code, then POST /api/auth/sign-in/email-otp with {email, otp} and use the new data.token.',
      )
    }

    return json(result)
  })
}
