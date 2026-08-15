import "server-only"
import { createHash, randomBytes } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { apiKey } from "@/lib/db/schema"

export const API_KEY_PREFIX = "glowa_sk_"

export type ApiPrincipal = {
  userId: string
  keyId: number
}

/** Generates a new raw API key plus the values we persist for it. */
export function generateApiKey() {
  const raw = API_KEY_PREFIX + randomBytes(24).toString("base64url")
  const keyHash = hashApiKey(raw)
  // Display hint like "glowa_sk_abcd…wxyz" — never enough to reconstruct the key.
  const body = raw.slice(API_KEY_PREFIX.length)
  const keyPrefix = `${API_KEY_PREFIX}${body.slice(0, 4)}…${body.slice(-4)}`
  return { raw, keyHash, keyPrefix }
}

export function hashApiKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex")
}

/** Extracts a bearer token from the Authorization header (or x-api-key). */
export function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim()
  }
  const headerKey = req.headers.get("x-api-key")
  return headerKey?.trim() || null
}

/**
 * Authenticates a request by its API key. Returns the owning principal, or null
 * when the key is missing/invalid. Updates lastUsedAt on success (best-effort).
 */
export async function authenticateApiRequest(req: Request): Promise<ApiPrincipal | null> {
  const raw = extractApiKey(req)
  if (!raw || !raw.startsWith(API_KEY_PREFIX)) return null

  const keyHash = hashApiKey(raw)
  const [row] = await db
    .select({ id: apiKey.id, userId: apiKey.userId })
    .from(apiKey)
    .where(eq(apiKey.keyHash, keyHash))
    .limit(1)

  if (!row) return null

  // Best-effort usage timestamp; don't block the request if it fails.
  db.update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, row.id))
    .catch(() => {})

  return { userId: row.userId, keyId: row.id }
}
