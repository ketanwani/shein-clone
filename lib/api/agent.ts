/**
 * Agent access to the storefront API.
 *
 * The trust boundary sits at the CALLER, not the end user. A Meta Business AI agent
 * driving this API from an Instagram DM makes independent, stateless HTTP calls: there
 * is no cookie jar, and asking the shopper to complete an email OTP would mean leaving
 * the chat. So two headers do two distinct jobs:
 *
 *   X-Agent-Key      proves the caller is the GLOWA agent (one shared secret, static)
 *   X-Customer-Ref   says which shopper the call is for (opaque, per conversation)
 *
 * Per-user scoping does not go away — it moves from the user proving who they are to a
 * trusted caller asserting it. Everything downstream still keys off a real userId.
 */

import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentCustomer, user } from "@/lib/db/schema"
import { ApiFailure } from "@/lib/api/failure"

const AGENT_KEY_HEADER = "x-agent-key"
const CUSTOMER_REF_HEADER = "x-customer-ref"
const CUSTOMER_EMAIL_HEADER = "x-customer-email"

const AGENT_KEY_HINT =
  "Send X-Agent-Key with the shared secret issued by GLOWA, plus X-Customer-Ref identifying the shopper."
const CUSTOMER_REF_HINT =
  "Send X-Customer-Ref with a stable, opaque id for this shopper (e.g. the Instagram-scoped user id). An email address is not accepted as identity."

const IS_PRODUCTION = process.env.NODE_ENV === "production"

/**
 * Well-known key so local development and tests work with no setup. It is deliberately
 * NOT a fallback in production: a fixed credential published in the source would let
 * anyone assert any customer ref against the deployed URL and read every shopper's bag,
 * wishlist and order history — the same hole the removed DEMO_OTP code opened.
 */
export const DEV_AGENT_KEY = "dev-agent-key"

/**
 * Every key the server currently accepts.
 *
 * AGENT_API_KEY takes a comma-separated list so keys can be rotated without downtime:
 * add the new one, move the caller across, then drop the old one. An empty list means
 * the agent path is off.
 */
function configuredKeys(): string[] {
  const configured = (process.env.AGENT_API_KEY ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)

  if (configured.length > 0) return configured
  return IS_PRODUCTION ? [] : [DEV_AGENT_KEY]
}

export function agentApiConfigured() {
  return configuredKeys().length > 0
}

// Say once at boot which way this deployment is configured, rather than leaving it to
// be discovered through a 401.
if (!agentApiConfigured()) {
  console.warn(
    "[agent] AGENT_API_KEY is not set — agent routes are disabled and will return 401. " +
      "Set it to one or more comma-separated secrets to enable them.",
  )
} else if (!process.env.AGENT_API_KEY?.trim()) {
  console.warn(`[agent] Using the development key "${DEV_AGENT_KEY}". Set AGENT_API_KEY for anything shared.`)
}

/**
 * Compares over SHA-256 digests so the comparison is constant time AND independent of
 * the secret's length — timingSafeEqual throws on a length mismatch, which would itself
 * leak how long the key is.
 *
 * Every candidate is checked even after one matches, so the time taken does not reveal
 * which key in a rotation list was the hit.
 */
function secretsMatch(candidate: string, accepted: string[]) {
  const presented = createHash("sha256").update(candidate).digest()
  let matched = false
  for (const key of accepted) {
    if (timingSafeEqual(presented, createHash("sha256").update(key).digest())) matched = true
  }
  return matched
}

export type AgentSubject = {
  /** The provisioned user row this call acts on. */
  userId: string
  /** The opaque ref the agent asserted. Treated as a bare string; never parsed. */
  customerRef: string
  /** Contact address for the order, if the agent supplied one. Never an identity. */
  email: string | null
}

/**
 * Resolves the shopper an agent call is acting for.
 *
 * Returns null when the request carries no agent headers at all — that is a browser
 * request, and the caller should fall back to cookie/bearer session auth. Throws
 * ApiFailure when the request *claims* to be an agent but does not check out, so a bad
 * key can never quietly degrade into an anonymous session.
 */
/**
 * Validates the agent credential envelope without resolving a shopper.
 *
 * Called by handle() for every API request, so a bad key is rejected before a handler
 * parses a body or touches Shopify. A request with no agent headers at all is a browser
 * request and passes straight through.
 *
 * Returns the presented ref (if any) purely so resolveAgentSubject can reuse the work.
 */
export async function assertAgentKey(): Promise<{ customerRef: string | null } | null> {
  const store = await headers()
  const presentedKey = store.get(AGENT_KEY_HEADER)
  const customerRef = store.get(CUSTOMER_REF_HEADER)?.trim() || null

  // X-Customer-Ref without a key is an unauthenticated identity claim, not a browser
  // request — reject it rather than falling through to the anonymous cart.
  if (presentedKey === null && !customerRef) return null

  const accepted = configuredKeys()
  if (accepted.length === 0) {
    throw new ApiFailure(
      401,
      "unauthorized",
      "Agent access is not enabled on this deployment.",
      "AGENT_API_KEY is unset on the server, so agent routes are disabled.",
    )
  }

  if (presentedKey === null || !secretsMatch(presentedKey, accepted)) {
    throw new ApiFailure(401, "unauthorized", "Invalid or missing X-Agent-Key.", AGENT_KEY_HINT)
  }

  return { customerRef }
}

export async function resolveAgentSubject(): Promise<AgentSubject | null> {
  const envelope = await assertAgentKey()
  if (!envelope) return null

  const { customerRef } = envelope
  if (!customerRef) {
    throw new ApiFailure(400, "bad_request", "X-Customer-Ref is required on this endpoint.", CUSTOMER_REF_HINT)
  }

  const email = (await headers()).get(CUSTOMER_EMAIL_HEADER)?.trim() || null
  const userId = await provisionCustomer(customerRef, email)
  return { userId, customerRef, email }
}

/** Like resolveAgentSubject, but for routes that must not be reached without agent auth. */
export async function requireAgentSubject(): Promise<AgentSubject> {
  const subject = await resolveAgentSubject()
  if (!subject) {
    throw new ApiFailure(401, "unauthorized", "Invalid or missing X-Agent-Key.", AGENT_KEY_HINT)
  }
  return subject
}

/**
 * Finds or creates the user row behind a customer ref.
 *
 * The ref is the key. The supplied email is stored as contact data only — user.email
 * gets a synthetic per-ref address instead, so two refs sharing a real address stay two
 * separate shoppers and nobody can read an order history by guessing an email.
 */
async function provisionCustomer(customerRef: string, email: string | null): Promise<string> {
  const [existing] = await db
    .select({ userId: agentCustomer.userId, email: agentCustomer.email })
    .from(agentCustomer)
    .where(eq(agentCustomer.customerRef, customerRef))
    .limit(1)

  if (existing) {
    if (email && email !== existing.email) {
      await db
        .update(agentCustomer)
        .set({ email, updatedAt: new Date() })
        .where(eq(agentCustomer.customerRef, customerRef))
    }
    return existing.userId
  }

  const userId = `agent_${randomUUID()}`
  await db
    .insert(user)
    .values({
      id: userId,
      name: "Agent shopper",
      email: syntheticEmail(customerRef),
      emailVerified: false,
    })
    .onConflictDoNothing()

  await db
    .insert(agentCustomer)
    .values({ customerRef, userId, email })
    .onConflictDoNothing({ target: agentCustomer.customerRef })

  // Two first calls for the same ref can race; whichever insert landed is the winner.
  const [settled] = await db
    .select({ userId: agentCustomer.userId })
    .from(agentCustomer)
    .where(eq(agentCustomer.customerRef, customerRef))
    .limit(1)

  return settled?.userId ?? userId
}

/**
 * user.email is NOT NULL and UNIQUE, and it must not carry the shopper's real address
 * — that column is reachable through the session APIs. A ref-derived placeholder keeps
 * the constraint satisfied without making the real address an identity.
 */
function syntheticEmail(customerRef: string) {
  const digest = createHash("sha256").update(customerRef).digest("hex").slice(0, 32)
  return `agent+${digest}@customers.glowa.invalid`
}
