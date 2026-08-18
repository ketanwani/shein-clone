/**
 * Who a request acts for, whichever credential it arrived with.
 *
 * Two paths reach the same place — a userId that the bag, wishlist and orders key off:
 *
 *   agent    X-Agent-Key + X-Customer-Ref  (stateless; see lib/api/agent.ts)
 *   browser  session cookie or bearer token (unchanged)
 *
 * The agent path is tried first and is authoritative: if a request presents agent
 * headers they must check out, and it never silently degrades to an anonymous session.
 */

import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { resolveAgentSubject } from "@/lib/api/agent"
import { ApiFailure, assertDatabaseConfigured } from "@/lib/api/http"

const SIGN_IN_HINT =
  "Agents: send X-Agent-Key and X-Customer-Ref. Browsers: sign in, or POST /api/auth/sign-in/email with {email, password} and send the returned token as `Authorization: Bearer <token>`."

export type Subject = {
  userId: string
  /** True when the caller is a trusted agent acting for a shopper. */
  viaAgent: boolean
  /** Contact address supplied by the agent, if any. Never an identity. */
  email: string | null
}

/**
 * Resolves the subject, or null when nobody is identified.
 *
 * Throws for a malformed agent request (bad key, missing ref), but stays quiet for an
 * absent or broken session — the root layout resolves the bag on every page render, and
 * a database that is down should not take the storefront with it.
 */
export async function resolveSubject(): Promise<Subject | null> {
  const agent = await resolveAgentSubject()
  if (agent) return { userId: agent.userId, viaAgent: true, email: agent.email }

  if (!process.env.DATABASE_URL) return null
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user ? { userId: session.user.id, viaAgent: false, email: session.user.email } : null
  } catch {
    return null
  }
}

/** The subject for a route that requires one. 401s when the caller is anonymous. */
export async function requireSubject(): Promise<Subject> {
  assertDatabaseConfigured()
  const subject = await resolveSubject()
  if (!subject) {
    throw new ApiFailure(401, "unauthorized", "This endpoint requires a signed-in user or an agent key.", SIGN_IN_HINT)
  }
  return subject
}
