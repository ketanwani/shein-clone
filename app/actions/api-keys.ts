"use server"

import { headers } from "next/headers"
import { desc, eq, and } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiKey } from "@/lib/db/schema"
import { generateApiKey } from "@/lib/api/auth"

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

export type ApiKeySummary = {
  id: number
  label: string
  keyPrefix: string
  lastUsedAt: string | null
  createdAt: string
}

export async function listApiKeysAction(): Promise<ApiKeySummary[]> {
  const userId = await requireUserId()
  const rows = await db
    .select()
    .from(apiKey)
    .where(eq(apiKey.userId, userId))
    .orderBy(desc(apiKey.createdAt))
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    keyPrefix: r.keyPrefix,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Creates a key and returns the RAW value exactly once — it is never retrievable again. */
export async function createApiKeyAction(label: string): Promise<{ id: number; label: string; rawKey: string }> {
  const userId = await requireUserId()
  const trimmed = label.trim() || "Untitled key"
  const { raw, keyHash, keyPrefix } = generateApiKey()
  const [created] = await db
    .insert(apiKey)
    .values({ userId, label: trimmed, keyPrefix, keyHash })
    .returning({ id: apiKey.id })
  return { id: created.id, label: trimmed, rawKey: raw }
}

export async function revokeApiKeyAction(id: number): Promise<void> {
  const userId = await requireUserId()
  await db.delete(apiKey).where(and(eq(apiKey.id, id), eq(apiKey.userId, userId)))
}
