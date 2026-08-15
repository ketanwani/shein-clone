import { pgTable, text, timestamp, boolean, serial, integer, numeric } from "drizzle-orm/pg-core"

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// --- App tables ------------------------------------------------------------

// Wishlist: one row per (user, product handle). Scoped by userId.
export const wishlistItem = pgTable("wishlist_item", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  productHandle: text("productHandle").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Orders: one row per placed order. Scoped by userId.
export const order = pgTable("order", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  orderNumber: text("orderNumber").notNull(),
  email: text("email").notNull(),
  shippingName: text("shippingName").notNull(),
  shippingAddress: text("shippingAddress").notNull(),
  shippingCity: text("shippingCity").notNull(),
  shippingZip: text("shippingZip").notNull(),
  shippingCountry: text("shippingCountry").notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  shipping: numeric("shipping", { precision: 10, scale: 2 }).notNull().default("0"),
  tax: numeric("tax", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  cardLast4: text("cardLast4"),
  status: text("status").notNull().default("paid"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Line items for an order, linked by orderId.
export const orderItem = pgTable("order_item", {
  id: serial("id").primaryKey(),
  orderId: integer("orderId").notNull(),
  title: text("title").notNull(),
  variantTitle: text("variantTitle"),
  quantity: integer("quantity").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("imageUrl"),
  productHandle: text("productHandle"),
})

// API keys for the public REST API. Only the SHA-256 hash is stored; the raw
// key is shown to the user exactly once at creation. Scoped by userId.
export const apiKey = pgTable("api_key", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  label: text("label").notNull(),
  keyPrefix: text("keyPrefix").notNull(),
  keyHash: text("keyHash").notNull().unique(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Maps a user to their active Shopify cart id, so the REST API can resolve a
// per-user cart without relying on browser cookies.
export const userCart = pgTable("user_cart", {
  userId: text("userId").primaryKey(),
  cartId: text("cartId").notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})
