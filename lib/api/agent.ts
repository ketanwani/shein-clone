/**
 * Agent access to the storefront API.
 *
 * One header, one job. X-Agent-Key proves the caller is the GLOWA agent, and that is all
 * it proves. It says nothing about which shopper a call is for.
 *
 * There used to be a second header, X-Customer-Ref: an opaque per-conversation id the
 * agent asserted, which provisioned a shopper on first sight and keyed their bag and
 * profile. It is gone. A ref is the caller claiming who it is acting for, so everything
 * it unlocked was reachable by anyone holding the shared secret — the reason the
 * wishlist and orders already refused it. That rule now applies everywhere, so the only
 * way to name a shopper is a bearer token they obtained themselves through the email-OTP
 * flow. See lib/api/subject.ts.
 *
 * A request that still sends X-Customer-Ref is not rejected. The header is simply not
 * read, so a stale integration degrades to "no shopper identified" and gets the same
 * recoverable 401 as one that never sent it.
 */

import { createHash, timingSafeEqual } from "node:crypto"
import { headers } from "next/headers"
import { ApiFailure } from "@/lib/api/failure"

const AGENT_KEY_HEADER = "x-agent-key"

const AGENT_KEY_HINT = "Send X-Agent-Key with the shared secret issued by GLOWA."

const IS_PRODUCTION = process.env.NODE_ENV === "production"

/**
 * Well-known key so local development and tests work with no setup. It is deliberately
 * NOT a fallback in production: a fixed credential published in the source would let
 * anyone reach every agent route on the deployed URL.
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

/** Whether this request claims to be an agent at all. Says nothing about validity. */
export async function agentKeyPresented(): Promise<boolean> {
  return (await headers()).get(AGENT_KEY_HEADER) !== null
}

/**
 * Validates an agent key if one is presented, and lets a request with none through.
 *
 * Called by handle() for every API request, so a bad key is rejected before a handler
 * parses a body or touches Shopify. A request with no key at all is a browser request
 * and passes straight through — the storefront shares most of these routes.
 */
export async function assertAgentKey(): Promise<void> {
  if (!(await agentKeyPresented())) return
  await requireAgentKey()
}

/**
 * Demands a valid X-Agent-Key, rather than only checking one that happens to be present.
 *
 * Used by the routes that exist for the integration. The caller credential and the
 * shopper credential are independent, so a request with a perfectly good bearer token
 * and no agent key is still rejected, and vice versa.
 */
export async function requireAgentKey(): Promise<void> {
  const presentedKey = (await headers()).get(AGENT_KEY_HEADER)

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
}
