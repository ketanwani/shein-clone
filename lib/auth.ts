import { betterAuth } from "better-auth"
import { bearer, emailOTP } from "better-auth/plugins"
import { pool } from "@/lib/db"

/**
 * Demo shortcut: every OTP request accepts this one fixed code, so an agent can sign
 * in headlessly with no mail provider. Active in production too — this deployment is
 * a demo, not a real store.
 *
 * This means anyone who can reach the server can sign in as any email address, and
 * therefore read and write that account's wishlist and orders. Do not put real user
 * data behind it. Set DEMO_OTP=off to fall back to random codes, which then go
 * nowhere until sendVerificationOTP below is pointed at a mail provider.
 */
const configuredOTP = process.env.DEMO_OTP ?? "000000"
export const DEMO_OTP = configuredOTP === "off" ? null : configuredOTP

if (DEMO_OTP && process.env.NODE_ENV === "production") {
  console.warn(`[auth] DEMO MODE — every OTP is "${DEMO_OTP}". Anyone can sign in as any email address.`)
}

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
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    // Lets API clients send the session token as `Authorization: Bearer <token>`
    // instead of a cookie. The website keeps using cookies.
    bearer(),
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      // A first-time email signs up and signs in at once — no separate registration.
      ...(DEMO_OTP ? { generateOTP: () => DEMO_OTP } : {}),
      async sendVerificationOTP({ email, otp, type }) {
        // No mail provider is configured. Swap this body for a real send when there is one.
        console.log(`[auth] OTP for ${email} (${type}): ${otp}`)
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
