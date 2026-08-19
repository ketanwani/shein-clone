import Image from "next/image"
import Link from "next/link"
import { getProducts } from "@/lib/shopify/products"
import { ProductGrid } from "@/components/product/product-grid"
import { FlashSale } from "@/components/home/flash-sale"
import { collectionPath } from "@/lib/routes"

const CATEGORY_TILES = [
  { slug: "women", name: "Women", image: "/hero/cat-women.png" },
  { slug: "men", name: "Men", image: "/hero/cat-men.png" },
  { slug: "shoes", name: "Shoes", image: "/hero/cat-shoes.png" },
  { slug: "beauty", name: "Beauty", image: "/hero/cat-beauty.png" },
]

export default async function HomePage() {
  const [newIn, saleItems] = await Promise.all([
    getProducts({ sortKey: "CREATED_AT", reverse: true, first: 10 }),
    getProducts({ query: "tag:'Sale'", first: 8 }),
  ])

  return (
    <div>
      {/* Hero */}
      <section className="relative">
        <div className="relative aspect-[16/9] w-full overflow-hidden md:aspect-[21/9]">
          <Image
            src="/hero/hero-main.png"
            alt="Two women in trendy summer outfits"
            fill
            priority
            sizes="100vw"
            className="object-cover object-top"
          />
          <div className="absolute inset-0 flex items-center bg-gradient-to-r from-background/70 via-background/20 to-transparent">
            <div className="mx-auto flex w-full max-w-7xl px-4">
              <div className="max-w-md">
                <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                  Summer Drop
                </p>
                <h1 className="mt-2 font-serif text-4xl font-extrabold leading-none text-balance md:text-6xl">
                  Up to 70% Off
                </h1>
                <p className="mt-3 text-base text-foreground/80 md:text-lg">
                  Thousands of new styles. Tiny prices. Fresh looks every single day.
                </p>
                <Link
                  href={collectionPath("new-in")}
                  className="mt-6 inline-block rounded-full bg-accent px-8 py-3 text-sm font-bold text-accent-foreground transition hover:opacity-90"
                >
                  Shop New In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category tiles */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CATEGORY_TILES.map((tile) => (
            <Link
              key={tile.slug}
              href={collectionPath(tile.slug)}
              className="group relative aspect-square overflow-hidden rounded-lg bg-muted"
            >
              <Image
                src={tile.image || "/placeholder.svg"}
                alt={tile.name}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/60 to-transparent p-4">
                <span className="font-serif text-xl font-bold text-background">{tile.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Flash sale */}
      {saleItems.length > 0 && <FlashSale products={saleItems} />}

      {/* New In */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-serif text-2xl font-extrabold md:text-3xl">New In</h2>
            <p className="text-sm text-muted-foreground">Fresh arrivals, just for you</p>
          </div>
          <Link href={collectionPath("new-in")} className="text-sm font-semibold text-accent hover:underline">
            View all
          </Link>
        </div>
        <ProductGrid products={newIn} />
      </section>
    </div>
  )
}
