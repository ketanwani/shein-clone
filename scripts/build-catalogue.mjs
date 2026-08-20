/**
 * Generates the storefront catalogue.
 *
 *   node scripts/build-catalogue.mjs [--mock <dump>] [--dummy <dump>] [--out <path>]
 *
 * mock.shop serves 29 products with no productType and no usable tags, so every one of
 * the twelve category pages rendered the same 29 items and category filtering had never
 * actually worked. This writes a real catalogue over the top of it.
 *
 * ─── Why the products are local but the variants are not ────────────────────────────
 *
 * The bag is Shopify's: cart lines are created against a real merchandise id, and the
 * cost, the line ids and the merge behaviour all come from their API. A purely invented
 * product could not be added to it.
 *
 * So each of our variants carries a *backing* mock.shop variant — the thing Shopify
 * actually holds — while the line's identity travels in cart line attributes, which
 * mock.shop stores and returns verbatim. lib/shopify/cart.ts reads those attributes back
 * and restores our title, image and price, so nothing downstream sees the substitution.
 * Backing variants are therefore free to repeat; the attribute is what makes a line
 * unambiguous.
 *
 * ─── Where the photographs come from ────────────────────────────────────────────────
 *
 * Two sources, because neither covers the catalogue alone.
 *
 * dummyjson.com is a public API published for exactly this purpose and its categories
 * line up with ours almost exactly — womens-dresses, womens-jewellery, beauty,
 * home-decoration and the rest — with three or four cutout shots per product. It carries
 * everything except trousers and skirts.
 *
 * mock.shop fills that hole: Sweatpants, Leggings and Shorts between them have 25
 * images, which is more than the twelve Bottoms need.
 *
 * Every product therefore gets its own photograph and no image is used twice. Both are
 * hotlinked, as the Shopify CDN images already were — nothing is copied into the repo.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args[i + 1]
}
const MOCK_FILE = arg("--mock", null)
const DUMMY_FILE = arg("--dummy", null)
const OUT = arg("--out", "lib/catalogue/data.json")

const MOCK_ENDPOINT = "https://mock.shop/api"
const DUMMY_ENDPOINT = "https://dummyjson.com/products?limit=200&select=id,title,category,images"

/** Both the purchasable variants and every image, which Bottoms draws on. */
const SOURCE_QUERY = /* GraphQL */ `
  {
    products(first: 100) {
      edges {
        node {
          title
          featuredImage { url altText width height }
          images(first: 10) { edges { node { url altText width height } } }
          variants(first: 100) { edges { node { id availableForSale } } }
        }
      }
    }
  }
`

async function loadMock() {
  if (MOCK_FILE) return JSON.parse(readFileSync(MOCK_FILE, "utf8"))
  const res = await fetch(MOCK_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: SOURCE_QUERY }),
  })
  if (!res.ok) throw new Error(`mock.shop returned ${res.status}`)
  return res.json()
}

async function loadDummy() {
  if (DUMMY_FILE) return JSON.parse(readFileSync(DUMMY_FILE, "utf8"))
  const res = await fetch(DUMMY_ENDPOINT)
  if (!res.ok) throw new Error(`dummyjson returned ${res.status}`)
  return res.json()
}

// ─── Sizing ──────────────────────────────────────────────────────────────────────────

const APPAREL = ["XS", "S", "M", "L", "XL"]
const SHOE_W = ["5", "6", "7", "8", "9", "10"]
const SHOE_M = ["7", "8", "9", "10", "11", "12"]
const ONE = ["One Size"]

/**
 * Where each of our categories draws its photography from.
 *
 * `dummy` names dummyjson categories; `mock` names mock.shop product titles whose image
 * lists are used. Tops and Shoes split by gender so a men's shirt does not get a
 * women's photograph — `w` and `m` are consulted per item.
 */
const PHOTO_SOURCES = {
  Dresses: { dummy: ["womens-dresses"] },
  Tops: { dummyW: ["tops"], dummyM: ["mens-shirts"] },
  Shoes: { dummyW: ["womens-shoes"], dummyM: ["mens-shoes"] },
  Bags: { dummy: ["womens-bags"] },
  Jewelry: { dummy: ["womens-jewellery", "womens-watches"] },
  Beauty: { dummy: ["beauty", "skin-care", "fragrances"] },
  Home: { dummy: ["home-decoration", "furniture", "kitchen-accessories"] },
  // dummyjson has no trousers or skirts, so Bottoms comes from the one place that does.
  Bottoms: { mock: ["Sweatpants", "Leggings", "Shorts"] },
}

const PALETTES = {
  Dresses: ["Black", "Wine", "Sage", "Ivory"],
  Tops: ["Black", "White", "Butter", "Sage"],
  Bottoms: ["Black", "Charcoal", "Khaki", "Ecru"],
  Shoes: ["Black", "White", "Taupe"],
  Beauty: ["Shade 01", "Shade 02", "Shade 03"],
  Jewelry: ["Gold", "Silver"],
  Bags: ["Black", "Cocoa", "Cream"],
  Home: ["Ivory", "Sage", "Terracotta"],
}

/**
 * `w` and `m` drive both the Women/Men tag and the shoe size run. `new` and `was` drive
 * the New In and Sale collections, which are tag-based and would otherwise be empty.
 */
const SPEC = {
  Dresses: { sizes: APPAREL, items: [
    { t: "Ruched Mesh Bodycon Midi Dress", p: 18.99, was: 32.0, w: 1, new: 1 },
    { t: "Floral Print Tiered Chiffon Maxi Dress", p: 26.5, w: 1, new: 1 },
    { t: "Square Neck Puff Sleeve Mini Dress", p: 15.99, was: 24.0, w: 1 },
    { t: "Satin Cowl Neck Slip Dress", p: 21.0, w: 1, new: 1 },
    { t: "Ribbed Knit Long Sleeve Bodycon Dress", p: 17.5, was: 28.0, w: 1 },
    { t: "Off Shoulder Smocked Tiered Sundress", p: 23.99, w: 1 },
    { t: "Halter Neck Cut Out Bodycon Dress", p: 19.99, was: 30.0, w: 1 },
    { t: "Wrap Front Polka Dot Midi Dress", p: 24.5, w: 1 },
    { t: "Sequin Bodycon Party Mini Dress", p: 29.99, was: 45.0, w: 1, new: 1 },
    { t: "Ditsy Floral Milkmaid Sundress", p: 22.0, w: 1 },
    { t: "Sleeveless Belted Shirt Dress", p: 25.99, w: 1 },
    { t: "Velvet Long Sleeve Evening Gown", p: 39.99, was: 62.0, w: 1 },
  ] },
  Tops: { sizes: APPAREL, items: [
    { t: "Ribbed Knit Square Neck Crop Top", p: 8.99, was: 14.0, w: 1, new: 1 },
    { t: "Oversized Graphic Drop Shoulder Tee", p: 11.5, w: 1 },
    { t: "Lace Trim Satin Cami Top", p: 9.99, was: 16.0, w: 1 },
    { t: "Puff Sleeve Button Front Blouse", p: 16.99, w: 1, new: 1 },
    { t: "Cropped Zip Up Hoodie", p: 19.5, was: 29.0, w: 1 },
    { t: "Mesh Long Sleeve Layering Top", p: 10.99, w: 1 },
    { t: "Cable Knit Cropped Cardigan", p: 22.99, w: 1, new: 1 },
    { t: "Basic Fitted Ribbed Tank", p: 6.99, was: 11.0, w: 1 },
    { t: "Men's Oversized Washed Cotton Tee", p: 12.99, m: 1, new: 1 },
    { t: "Men's Colour Block Half Zip Sweatshirt", p: 27.5, was: 40.0, m: 1 },
    { t: "Men's Relaxed Fit Flannel Overshirt", p: 24.99, m: 1 },
    { t: "Men's Heavyweight Fleece Hoodie", p: 32.0, was: 48.0, m: 1, new: 1 },
    { t: "Men's Striped Knit Polo Shirt", p: 18.5, m: 1 },
    { t: "Men's Performance Training Tee", p: 14.99, was: 22.0, m: 1 },
  ] },
  Bottoms: { sizes: APPAREL, items: [
    { t: "High Waist Wide Leg Cargo Trousers", p: 24.99, was: 38.0, w: 1, new: 1 },
    { t: "Seamless Ribbed Biker Shorts", p: 9.99, w: 1 },
    { t: "Pleated Mini Tennis Skirt", p: 13.5, was: 20.0, w: 1, new: 1 },
    { t: "Distressed Straight Leg Mom Jeans", p: 29.99, w: 1 },
    { t: "Satin Bias Cut Midi Skirt", p: 18.99, was: 27.0, w: 1 },
    { t: "High Rise Faux Leather Leggings", p: 21.5, w: 1 },
    { t: "Ruched Side Bodycon Mini Skirt", p: 12.99, w: 1 },
    { t: "Men's Relaxed Fit Cargo Joggers", p: 26.99, was: 39.0, m: 1, new: 1 },
    { t: "Men's Straight Leg Denim Jeans", p: 31.5, m: 1 },
    { t: "Men's Drawstring Nylon Track Pants", p: 22.99, m: 1 },
    { t: "Men's Cotton Chino Shorts", p: 17.99, was: 26.0, m: 1 },
    { t: "Men's Fleece Sweatpants", p: 23.5, m: 1 },
  ] },
  Shoes: { items: [
    { t: "Chunky Platform Lace Up Sneakers", p: 34.99, was: 52.0, w: 1, new: 1 },
    { t: "Pointed Toe Stiletto Ankle Boots", p: 42.0, w: 1 },
    { t: "Strappy Block Heel Sandals", p: 26.99, was: 39.0, w: 1 },
    { t: "Quilted Slip On Loafers", p: 29.5, w: 1, new: 1 },
    { t: "Knee High Faux Leather Boots", p: 54.99, w: 1 },
    { t: "Espadrille Wedge Sandals", p: 24.99, was: 36.0, w: 1 },
    { t: "Ballet Flat Mary Janes", p: 21.99, w: 1 },
    { t: "Padded Slide Sandals", p: 14.99, was: 22.0, w: 1 },
    { t: "Men's Low Top Canvas Trainers", p: 27.99, m: 1, new: 1 },
    { t: "Men's Chunky Sole Running Shoes", p: 38.5, was: 55.0, m: 1 },
    { t: "Men's Suede Chelsea Boots", p: 49.99, m: 1 },
    { t: "Men's High Top Basketball Sneakers", p: 44.0, m: 1 },
  ] },
  Beauty: { sizes: ONE, items: [
    { t: "Matte Liquid Lipstick Set", p: 12.99, was: 19.0, w: 1, new: 1 },
    { t: "Dewy Glow Liquid Highlighter", p: 8.99, w: 1 },
    { t: "12 Colour Eyeshadow Palette", p: 15.5, was: 24.0, w: 1, new: 1 },
    { t: "Waterproof Volumising Mascara", p: 7.99, w: 1 },
    { t: "Hydrating Hyaluronic Face Serum", p: 18.99, w: 1 },
    { t: "Jade Roller and Gua Sha Set", p: 11.99, was: 18.0, w: 1 },
    { t: "Precision Liquid Eyeliner Pen", p: 6.5, w: 1 },
    { t: "Tinted Lip Oil Trio", p: 13.99, w: 1, new: 1 },
    { t: "Long Wear Setting Spray", p: 9.99, was: 15.0, w: 1 },
    { t: "Sheet Mask Variety Pack", p: 10.5, w: 1 },
  ] },
  Jewelry: { sizes: ONE, items: [
    { t: "Gold Plated Layered Chain Necklace", p: 9.99, was: 16.0, w: 1, new: 1 },
    { t: "Cubic Zirconia Huggie Hoop Earrings", p: 7.5, w: 1 },
    { t: "Chunky Resin Statement Bangle", p: 11.99, w: 1 },
    { t: "Dainty Initial Pendant Necklace", p: 13.5, was: 20.0, w: 1, new: 1 },
    { t: "Stackable Textured Ring Set", p: 8.99, w: 1 },
    { t: "Freshwater Pearl Drop Earrings", p: 16.99, w: 1 },
    { t: "Butterfly Charm Anklet", p: 6.99, was: 11.0, w: 1 },
    { t: "Herringbone Snake Chain Bracelet", p: 12.5, w: 1 },
    { t: "Rhinestone Ear Cuff Set", p: 9.5, w: 1, new: 1 },
    { t: "Vintage Style Signet Ring", p: 10.99, was: 17.0, w: 1 },
  ] },
  Bags: { sizes: ONE, items: [
    { t: "Quilted Chain Strap Shoulder Bag", p: 24.99, was: 38.0, w: 1, new: 1 },
    { t: "Mini Croc Embossed Top Handle Bag", p: 21.5, w: 1 },
    { t: "Canvas Tote with Inner Pouch", p: 16.99, w: 1 },
    { t: "Nylon Crossbody Sling Bag", p: 18.99, was: 28.0, w: 1 },
    { t: "Faux Leather Bucket Bag", p: 26.5, w: 1, new: 1 },
    { t: "Rhinestone Evening Clutch", p: 19.99, w: 1 },
    { t: "Corduroy Drawstring Backpack", p: 23.99, was: 34.0, img: "Frontpack", new: 1 },
    { t: "Woven Straw Beach Tote", p: 17.5, w: 1 },
    { t: "Belt Bag with Adjustable Strap", p: 14.99, was: 22.0, w: 1 },
    { t: "Structured Laptop Work Satchel", p: 32.99, w: 1 },
  ] },
  Home: { sizes: ONE, items: [
    { t: "Boucle Textured Cushion Cover", p: 11.99, was: 18.0, new: 1 },
    { t: "Ribbed Ceramic Vase Set", p: 19.99 },
    { t: "LED Strip Ambient Light", p: 14.5, was: 22.0 },
    { t: "Waffle Weave Cotton Throw Blanket", p: 27.99, new: 1 },
    { t: "Rattan Woven Storage Basket", p: 16.99 },
    { t: "Minimalist Desk Organiser Tray", p: 12.5, was: 19.0 },
    { t: "Scented Soy Candle Trio", p: 21.99, new: 1 },
    { t: "Velvet Blackout Curtain Panel", p: 24.99 },
    { t: "Marble Effect Coaster Set", p: 9.99, was: 15.0 },
    { t: "Fluffy Faux Fur Area Rug", p: 39.99 },
  ] },
}

// ─── Copy ────────────────────────────────────────────────────────────────────────────

const BLURB = {
  Dresses: "Cut for an easy, close fit with a soft drape that moves with you.",
  Tops: "An everyday layer with a relaxed shoulder and a clean finished hem.",
  Bottoms: "A comfortable mid-weight fabric with just enough stretch to hold its shape.",
  Shoes: "A cushioned footbed and a grippy outsole, made to be worn all day.",
  Beauty: "Blendable, buildable and kind to skin. Cruelty free and fragrance light.",
  Jewelry: "Tarnish resistant plating over a hypoallergenic base, so it wears well daily.",
  Bags: "Roomy enough for the daily carry, with a lined interior and a secure closure.",
  Home: "A quiet finishing touch that works with almost any palette.",
}

const CARE = {
  Dresses: "Machine wash cold, hang to dry.",
  Tops: "Machine wash cold with like colours.",
  Bottoms: "Machine wash cold, tumble dry low.",
  Shoes: "Wipe clean with a damp cloth.",
  Beauty: "Store below 25°C, away from direct sunlight.",
  Jewelry: "Keep dry and store in the pouch provided.",
  Bags: "Spot clean only.",
  Home: "Spot clean or gentle cycle in a laundry bag.",
}

const slug = (s) =>
  s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const money = (n) => n.toFixed(2)

// ─── Build ───────────────────────────────────────────────────────────────────────────

const [source, dummy] = await Promise.all([loadMock(), loadDummy()])
const mockProducts = source.data.products.edges.map((e) => e.node)

/** mock.shop product title -> all of its images, for the Bottoms pool. */
const mockImagesByTitle = new Map(
  mockProducts.map((p) => [p.title, p.images.edges.map((e) => e.node)]),
)

/** dummyjson category -> its images, flattened across the products in it. */
const dummyImagesByCategory = new Map()
for (const p of dummy.products ?? []) {
  const list = dummyImagesByCategory.get(p.category) ?? []
  for (const url of p.images ?? []) list.push({ url, altText: p.title, width: 1000, height: 1000 })
  dummyImagesByCategory.set(p.category, list)
}

/**
 * Hands out photographs without repeating one.
 *
 * Running a pool dry is a hard failure rather than a silent wrap-around: a duplicated
 * photograph across two listings is the exact thing this change exists to remove, and it
 * is far easier to notice here than on a category page.
 */
function makePool(label, images) {
  let cursor = 0
  return () => {
    if (cursor >= images.length) {
      throw new Error(`ran out of photographs for ${label} after ${images.length}`)
    }
    return images[cursor++]
  }
}

function poolsFor(productType) {
  const spec = PHOTO_SOURCES[productType]
  if (!spec) throw new Error(`no photo source configured for ${productType}`)

  const fromDummy = (categories) =>
    categories.flatMap((c) => {
      const found = dummyImagesByCategory.get(c)
      if (!found?.length) throw new Error(`dummyjson category "${c}" has no images`)
      return found
    })

  const fromMock = (titles) =>
    titles.flatMap((t) => {
      const found = mockImagesByTitle.get(t)
      if (!found?.length) throw new Error(`no mock.shop product titled "${t}"`)
      return found
    })

  if (spec.mock) {
    const shared = makePool(productType, fromMock(spec.mock))
    return { women: shared, men: shared }
  }
  if (spec.dummy) {
    const shared = makePool(productType, fromDummy(spec.dummy))
    return { women: shared, men: shared }
  }
  return {
    women: makePool(`${productType} (women)`, fromDummy(spec.dummyW)),
    men: makePool(`${productType} (men)`, fromDummy(spec.dummyM)),
  }
}

/**
 * Every in-stock mock.shop variant, in a stable order. Our variants draw from this pool
 * round-robin; repeats are harmless because the cart line attribute, not the merchandise
 * id, is what identifies the line.
 */
const backingVariants = mockProducts
  .flatMap((p) => p.variants.edges.map((e) => e.node))
  .filter((v) => v.availableForSale)
  .map((v) => v.id)

if (backingVariants.length === 0) throw new Error("no purchasable mock.shop variants found")

let backingCursor = 0
const nextBacking = () => backingVariants[backingCursor++ % backingVariants.length]

const products = []
const seenHandles = new Set()

for (const [productType, group] of Object.entries(SPEC)) {
  const pools = poolsFor(productType)

  group.items.forEach((item) => {
    const handle = slug(item.t)
    if (seenHandles.has(handle)) throw new Error(`duplicate handle: ${handle}`)
    seenHandles.add(handle)

    // Shoes size by gender; everything else uses the group's run.
    const sizes = group.sizes ?? (item.m ? SHOE_M : SHOE_W)
    const colors = PALETTES[productType]

    const photo = (item.m ? pools.men : pools.women)()

    const tags = []
    if (item.w) tags.push("Women")
    if (item.m) tags.push("Men")
    if (item.new) tags.push("New In")
    if (item.was) tags.push("Sale")

    const variants = []
    for (const size of sizes) {
      for (const color of colors) {
        variants.push({
          size,
          color,
          backingId: nextBacking(),
        })
      }
    }

    products.push({
      handle,
      title: item.t,
      productType,
      tags,
      description:
        `${item.t}. ${BLURB[productType]} ${CARE[productType]}`,
      price: money(item.p),
      compareAt: item.was ? money(item.was) : null,
      currencyCode: "CAD",
      // altText describes our listing, not the upstream photograph it was taken from.
      image: { url: photo.url, altText: item.t, width: photo.width, height: photo.height },
      sizes,
      colors,
      variants,
    })
  })
}

const out = {
  // Recorded so a reader can tell where the photography came from without digging.
  source: "mock.shop (bottoms, backing variants) + dummyjson.com (photography)",
  currencyCode: "CAD",
  products,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`)

// ─── Report ──────────────────────────────────────────────────────────────────────────

const byType = {}
const byTag = {}
for (const p of products) {
  byType[p.productType] = (byType[p.productType] ?? 0) + 1
  for (const t of p.tags) byTag[t] = (byTag[t] ?? 0) + 1
}

console.log(`wrote ${OUT}`)
console.log(`  products      ${products.length}`)
console.log(`  variants      ${products.reduce((n, p) => n + p.variants.length, 0)}`)
console.log(`  with a photo  ${products.filter((p) => p.image).length}`)
console.log(`  backing pool  ${backingVariants.length} purchasable mock.shop variants`)
console.log("  by productType:")
for (const [k, v] of Object.entries(byType)) console.log(`    ${k.padEnd(10)} ${v}`)
console.log("  by tag:")
for (const [k, v] of Object.entries(byTag)) console.log(`    ${k.padEnd(10)} ${v}`)

const thin = [...Object.entries(byType), ...Object.entries(byTag)].filter(([, n]) => n < 10)
if (thin.length) {
  console.error(`\nFAIL: under 10 products in ${thin.map(([k, n]) => `${k} (${n})`).join(", ")}`)
  process.exit(1)
}
console.log("\nevery category has at least 10 products")
