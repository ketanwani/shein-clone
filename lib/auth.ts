import { betterAuth } from "better-auth"
import { bearer, emailOTP } from "better-auth/plugins"
import { pool } from "@/lib/db"
import { maskEmails } from "@/lib/api/log"

/**
 * Three ways in:
 *
 *   Browsers — email and password (the /login and /signup forms).
 *   Agents   — X-Agent-Key plus X-Customer-Ref; see lib/api/agent.ts.
 *   Shoppers, through an agent — email OTP exchanged for a bearer token.
 *
 * The OTP path is back, but not for the reason it was removed. It used to be the only
 * way an API client could get a token without a mail provider, and a fixed DEMO_OTP made
 * every account reachable by anyone who could reach the server. What it does now is let
 * the shopper — not the caller — say who they are: the Meta integration captures the
 * token once from the sign-in body, stores it encrypted, and injects it on user-scoped
 * calls, so wishlist and orders need a credential the shopper proved they own rather
 * than a ref the caller asserted.
 *
 * There is still no mail provider, so the code goes nowhere. DEMO_OTP_CODE is the
 * deliberate, off-by-default escape hatch for that; lib/api/otp.ts owns it and documents
 * exactly what it does and does not relax.
 */

/** Kept in one place because the sign-in body reports the expiry the integration plans against. */
export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7

/** How long a code stays usable. Reported to no one, so it lives next to the plugin. */
export const OTP_EXPIRES_IN_SECONDS = 60 * 10

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.V0_DEV_APP_URL ?? process.env.V0_RUNTIME_URL)),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  trustedOrigins: [
    ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    // v0 preview iframe / local dev origins
    "http://localhost:3000",
    ...(process.env.NODE_ENV === "development" ? ["*"] : []),
  ],
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    // Lets API clients send the session token as `Authorization: Bearer <token>`
    // instead of a cookie. The website keeps using cookies.
    //
    // This is the load-bearing plugin for the Meta integration: it has no cookie jar, so
    // a cookie-only session would not work at all.
    bearer(),
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_EXPIRES_IN_SECONDS,
      allowedAttempts: 3,
      // Hashed at rest: a dump of the verification table is then not a list of live
      // codes. Nothing needs to read a code back — the demo bypass in lib/api/otp.ts
      // mints its own rather than peeking at a pending one.
      storeOTP: "hashed",
      // disableSignUp stays false on purpose, and does two jobs at once. It is what
      // defers account creation to verification, so a mistyped address leaves nothing
      // behind, and it is what makes send-verification-otp behave identically for an
      // address that has an account and one that does not.
      disableSignUp: false,
      async sendVerificationOTP({ email, type }) {
        // No transactional email provider is wired up yet, so this is where a real send
        // goes. The code is deliberately not logged, echoed or returned: a code that
        // reaches the server console or a response body is a credential anyone reading
        // either can spend. Until a provider exists, DEMO_OTP_CODE is the only way to
        // complete a sign-in.
        console.log(`[auth] OTP requested for ${maskEmails(email)} (${type}) — no mail provider configured, not sent.`)
      },
    }),
  ],
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
})
