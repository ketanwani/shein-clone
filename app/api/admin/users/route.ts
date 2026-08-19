/**
 * Deletes a test shopper by email. Demo deployments only.
 *
 * Three gates, all required:
 *
 *   1. ALLOW_USER_DELETE is set, and DEMO_OTP_CODE is set. Either one missing and this
 *      answers 404 — the same thing a route that does not exist answers, so nothing
 *      advertises the capability.
 *   2. A valid X-Agent-Key.
 *   3. X-Admin-Otp matching DEMO_OTP_CODE.
 *
 * Be clear-eyed about what that is worth. Gate 3 is the same short code the sign-in
 * flow accepts, so anyone able to sign a shopper in already knows it — it guards
 * against a careless call, not against someone who has the agent key. And tying
 * availability to DEMO_OTP_CODE is the real limit: a deployment with a working mail
 * provider and no fixed code has no delete endpoint at all.
 *
 * It is also an email-existence oracle by design — `deleted: false` means no account —
 * which the rest of this API goes to some length to avoid. That is the trade for a
 * usable testing tool, and another reason it must stay off outside a demo.
 */

import { createHash, timingSafeEqual } from "node:crypto"
import { headers } from "next/headers"
import { requireAgentKey } from "@/lib/api/agent"
import { deleteUserByEmail } from "@/lib/api/delete-user"
import { ApiFailure } from "@/lib/api/failure"
import { assertDatabaseConfigured, badRequest, handle, json, notFound } from "@/lib/api/http"
import { demoOtpCode } from "@/lib/api/otp"

const ADMIN_OTP_HEADER = "x-admin-otp"

/** Off unless both are set. A missing DEMO_OTP_CODE leaves gate 3 with nothing to check. */
function enabled() {
  return Boolean(process.env.ALLOW_USER_DELETE?.trim()) && demoOtpCode() !== null
}

/** Constant time, and over digests so the comparison does not leak the length either. */
function matches(presented: string, expected: string) {
  return timingSafeEqual(
    createHash("sha256").update(presented).digest(),
    createHash("sha256").update(expected).digest(),
  )
}

async function assertAdminOtp() {
  const expected = demoOtpCode()
  const presented = (await headers()).get(ADMIN_OTP_HEADER)?.trim()

  if (!expected || !presented || !matches(presented, expected)) {
    throw new ApiFailure(
      401,
      "unauthorized",
      "Invalid or missing X-Admin-Otp.",
      "Send X-Admin-Otp with the value of DEMO_OTP_CODE on this deployment.",
    )
  }
}

export async function DELETE(request: Request) {
  return handle(request, async () => {
    // First, and before the credential check, so an unauthenticated probe cannot tell a
    // disabled endpoint from a wrong key.
    if (!enabled()) throw notFound("No such endpoint.")

    await requireAgentKey()
    await assertAdminOtp()
    assertDatabaseConfigured()

    const url = new URL(request.url)
    const email = url.searchParams.get("email")?.trim()
    if (!email) {
      throw badRequest("The \"email\" query parameter is required.", "Example: DELETE /api/admin/users?email=ada@example.com")
    }

    // Opt in to seeing what would go before it goes.
    const dryRun = url.searchParams.get("dry_run") === "true"

    const result = await deleteUserByEmail(email, dryRun)
    return json(result)
  })
}
