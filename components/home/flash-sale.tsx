"use client"

import { useEffect, useState } from "react"
import { Zap } from "lucide-react"
import type { Product } from "@/lib/shopify/types"
import { ProductCard } from "@/components/product/product-card"

function useCountdown() {
  const [time, setTime] = useState({ h: 0, m: 0, s: 0 })

  useEffect(() => {
    function tick() {
      const now = new Date()
      const end = new Date(now)
      end.setHours(24, 0, 0, 0) // midnight tonight
      const diff = Math.max(0, end.getTime() - now.getTime())
      setTime({
        h: Math.floor(diff / 3_600_000),
        m: Math.floor((diff % 3_600_000) / 60_000),
        s: Math.floor((diff % 60_000) / 1000),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return time
}

function Unit({ value }: { value: number }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded bg-foreground text-sm font-bold tabular-nums text-background">
      {String(value).padStart(2, "0")}
    </span>
  )
}

export function FlashSale({ products }: { products: Product[] }) {
  const { h, m, s } = useCountdown()

  return (
    <section className="bg-sale/5">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="flex items-center gap-2 font-serif text-2xl font-extrabold text-sale md:text-3xl">
            <Zap className="h-6 w-6 fill-sale" />
            Flash Sale
          </h2>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-sm font-medium text-muted-foreground">Ends in</span>
            <Unit value={h} />
            <span className="font-bold">:</span>
            <Unit value={m} />
            <span className="font-bold">:</span>
            <Unit value={s} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  )
}
