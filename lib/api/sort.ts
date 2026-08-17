import { badRequest } from "./http"

export const SORT_OPTIONS = ["featured", "newest", "price-asc", "price-desc", "relevance"] as const

export type SortParam = (typeof SORT_OPTIONS)[number]

const SORT_MAP: Record<SortParam, { sortKey: "BEST_SELLING" | "PRICE" | "CREATED_AT" | "RELEVANCE"; reverse: boolean }> =
  {
    featured: { sortKey: "BEST_SELLING", reverse: false },
    newest: { sortKey: "CREATED_AT", reverse: true },
    "price-asc": { sortKey: "PRICE", reverse: false },
    "price-desc": { sortKey: "PRICE", reverse: true },
    relevance: { sortKey: "RELEVANCE", reverse: false },
  }

/** Maps the public `sort` query value onto Shopify sort keys. Rejects anything unknown. */
export function resolveSort(sort: string | null, fallback: SortParam = "featured") {
  if (!sort) return SORT_MAP[fallback]
  if (!(SORT_OPTIONS as readonly string[]).includes(sort)) {
    throw badRequest(`Unknown sort "${sort}".`, `Use one of: ${SORT_OPTIONS.join(", ")}.`)
  }
  return SORT_MAP[sort as SortParam]
}
