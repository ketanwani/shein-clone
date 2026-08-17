"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

/**
 * Copies `text`, or the body of `fetchUrl` when the content is too large to be
 * worth shipping in the server-rendered payload.
 */
export function CopyButton({
  text,
  fetchUrl,
  label = "Copy",
  className = "",
}: {
  text?: string
  fetchUrl?: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      const value = text ?? (fetchUrl ? await fetch(fetchUrl).then((res) => res.text()) : "")
      if (!value) return
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold transition hover:bg-muted ${className}`}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  )
}
