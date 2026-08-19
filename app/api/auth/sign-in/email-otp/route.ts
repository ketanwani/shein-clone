/**
 * Overrides the Better Auth catch-all so the sign-in body has a documented shape.
 *
 * Better Auth answers `{ token, user }` flat, with no expiry. The integration extracts
 * the token with a literal path string and needs to know when to re-authenticate, so
 * this returns `{ data: { token, expiresAt, user } }` — token at `data.token`.
 *
 * `/api/auth/sign-in/email` is untouched and still handled by `[...all]`: adding a
 * static `sign-in/email-otp` segment only claims that one path.
 */

import { requireAgentKey } from "@/lib/api/agent"
import { assertDatabaseConfigured, handle, json, readJsonBody, readString } from "@/lib/api/http"
import { signInWithOtp } from "@/lib/api/otp"

export async function POST(request: Request) {
  return handle(request, async () => {
    await requireAgentKey()
    assertDatabaseConfigured()

    const body = await readJsonBody(request)
    const email = readString(body, "email").trim().toLowerCase()
    const otp = readString(body, "otp").trim()

    // Throws a uniform 401 invalid_code for a wrong code, an expired one, too many
    // attempts, or an address with no account. No refresh token is issued: the session
    // token is the only credential, and expiresAt says when to run this flow again.
    const data = await signInWithOtp(email, otp)

    return json({ data })
  })
}
