"use server"

/**
 * Forgot-password, for the website only.
 *
 * Deliberately server actions rather than route handlers: this is a browser flow, and
 * the REST surface is a documented contract for the agent integration. Adding a
 * password-reset endpoint there would be a new way in that nothing needs.
 *
 * There is no mail provider, so the code is not mailed — DEMO_OTP_CODE is accepted
 * instead, the same fixed value the demo sign-in takes. With it unset the whole flow is
 * unavailable, and both actions below refuse.
 *
 * ─── What this costs ────────────────────────────────────────────────────────────────
 *
 * While DEMO_OTP_CODE is set, anyone who can reach the site and knows that value can
 * take over any account by resetting its password. That is the same exposure the demo
 * sign-in already carries — a fixed code is a shared password — but a reset is louder,
 * because it locks the real owner out rather than quietly signing in beside them. Demo
 * deployments only.
 */

import { auth } from "@/lib/auth"
import { demoOtpCode } from "@/lib/api/otp"
import { MIN_PASSWORD_LENGTH } from "@/lib/password"

type ResetResult = { ok: true } | { ok: false; error: string }

/** Whether the flow is available at all on this deployment. */
export async function passwordResetAvailable(): Promise<boolean> {
  return demoOtpCode() !== null
}

/**
 * Constant-time-ish check of the submitted code.
 *
 * The value is not a secret — it is a documented demo constant — so this is about
 * correctness rather than resisting timing analysis.
 */
function codeMatches(presented: string): boolean {
  const expected = demoOtpCode()
  return expected !== null && presented.trim() === expected
}

/**
 * Gates the "enter a new password" step.
 *
 * Says nothing about whether the address has an account. The reset itself re-checks the
 * code, so a caller that skips this step gains nothing.
 */
export async function verifyResetCodeAction(code: string): Promise<ResetResult> {
  if (!(await passwordResetAvailable())) {
    return { ok: false, error: "Password reset is not available on this deployment." }
  }
  if (!codeMatches(code)) return { ok: false, error: "That code is not correct." }
  return { ok: true }
}

/**
 * Sets a new password once the code checks out.
 *
 * The work is done by Better Auth's own reset route rather than by hashing here. That
 * matters for more than tidiness: it creates the `credential` record when an account has
 * none, which is exactly the state an account provisioned by X-Shopper-Email is in —
 * a real user row that has never had a password and so could neither sign in nor sign
 * up. This flow is how such an account gets unstuck.
 *
 * The genuine one-time code is minted and redeemed in the same breath, the same way the
 * demo sign-in does it, so the fixed code changes only which value the *user* types and
 * nothing about how the reset itself is performed.
 */
export async function resetPasswordAction(
  email: string,
  code: string,
  newPassword: string,
): Promise<ResetResult> {
  if (!(await passwordResetAvailable())) {
    return { ok: false, error: "Password reset is not available on this deployment." }
  }

  const address = email.trim().toLowerCase()
  if (!address) return { ok: false, error: "Enter your email address." }

  // Re-checked here, not trusted from the previous step.
  if (!codeMatches(code)) return { ok: false, error: "That code is not correct." }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  try {
    const otp = await auth.api.createVerificationOTP({
      body: { email: address, type: "forget-password" },
    })
    await auth.api.resetPasswordEmailOTP({ body: { email: address, otp, password: newPassword } })
    return { ok: true }
  } catch {
    // Most often USER_NOT_FOUND. Kept vague on purpose: this form is public, and a
    // precise answer would turn it into a way to test which addresses have accounts.
    return { ok: false, error: "Could not reset that password. Check the address and try again." }
  }
}
