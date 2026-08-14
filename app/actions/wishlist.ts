"use server"

import { getProduct } from "@/lib/shopify/products"
import type { Product } from "@/lib/shopify/types"

export async function getWishlistProducts(handles: string[]): Promise<Product[]> {
  if (handles.length === 0) return []
  const results = await Promise.all(handles.map((h) => getProduct(h)))
  return results.filter((p): p is Product => p !== null)
}
