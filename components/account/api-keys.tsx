"use client"

import { useState, useTransition } from "react"
import { Key, Copy, Check, Trash2, Plus, TriangleAlert } from "lucide-react"
import {
  createApiKeyAction,
  revokeApiKeyAction,
  type ApiKeySummary,
} from "@/app/actions/api-keys"

export function ApiKeys({ initialKeys }: { initialKeys: ApiKeySummary[] }) {
  const [keys, setKeys] = useState<ApiKeySummary[]>(initialKeys)
  const [label, setLabel] = useState("")
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const created = await createApiKeyAction(label)
        setNewKey(created.rawKey)
        setCopied(false)
        setLabel("")
        setKeys((prev) => [
          {
            id: created.id,
            label: created.label,
            keyPrefix: `${created.rawKey.slice(0, 13)}…${created.rawKey.slice(-4)}`,
            lastUsedAt: null,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ])
      } catch {
        setError("Could not create key. Please try again.")
      }
    })
  }

  function revoke(id: number) {
    startTransition(async () => {
      await revokeApiKeyAction(id)
      setKeys((prev) => prev.filter((k) => k.id !== id))
    })
  }

  async function copyKey() {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="mt-10">
      <div className="flex items-center gap-2">
        <Key className="h-5 w-5 text-accent" />
        <h2 className="text-xl font-bold">API Keys</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Authenticate external apps and agents against the GLOWA REST API. Keys act on your account only.
      </p>

      {newKey && (
        <div className="mt-4 rounded-lg border border-accent/40 bg-accent/5 p-4">
          <div className="flex items-start gap-2 text-sm font-semibold text-accent">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Copy your key now — you won&apos;t be able to see it again.</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-border bg-background px-3 py-2 font-mono text-sm">
              {newKey}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="flex items-center gap-1 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="mt-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Done
          </button>
        </div>
      )}

      <form onSubmit={create} className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Key name (e.g. Shopping Agent)"
          className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-foreground"
          maxLength={60}
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Create key
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {keys.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-border rounded-lg border border-border">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{k.label}</p>
                <p className="font-mono text-xs text-muted-foreground">{k.keyPrefix}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created {new Date(k.createdAt).toLocaleDateString()} ·{" "}
                  {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(k.id)}
                disabled={isPending}
                className="flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm font-semibold text-destructive transition hover:border-destructive disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
