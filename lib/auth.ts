import { betterAuth } from "better-auth"
import { bearer } from "better-auth/plugins"
import { pool } from "@/lib/db"

/**
 * Two ways in, and email OTP is deliberately not one of them:
 *
 *   Browsers — email and password (the /login and /signup forms).
 *   Agents   — X-Agent-Key plus X-Customer-Ref; see lib/api/agent.ts.
 *
 * The email-OTP plugin used to exist so an API client could get a bearer token with no
 * mail provider, via a fixed DEMO_OTP code. That made every account reachable by anyone
 * who could reach the server, and the agent path replaced the only thing it was for, so
 * both the plugin and DEMO_OTP are gone. Reintroducing passwordless login means wiring
 * a real mail provider, not a fixed code.
 */
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
