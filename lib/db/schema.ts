import { pgTable, text, timestamp, boolean, serial, integer, numeric, primaryKey, uniqueIndex } from "drizzle-orm/pg-core"

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
//
// The unique index is what makes saving idempotent. Agents retry, and shoppers ask for
// the same dress twice; without it the onConflictDoNothing in addToServerWishlist has no
// conflict to detect and the same handle piles up in the list.
export const wishlistItem = pgTable(
  "wishlist_item",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    productHandle: text("productHandle").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wishlist_item_user_handle_idx").on(table.userId, table.productHandle)],
)

// The signed-in user's active Shopify cart. Lets API clients work the bag with only
// a bearer token: no cookie, and the bag survives losing one. Anonymous callers still
// fall back to the cartId cookie.
export const userCart = pgTable("user_cart", {
  userId: text("userId").primaryKey(),
  cartId: text("cartId").notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Contact details the shopper has given: the name and address an order goes out under.
// Keyed by the account, which is the only shopper identity there is.
//
// `email` is contact data, deliberately NOT unique and never used to look anyone up.
// The account's own email (on the user table) is the identity; this one is just what to
// put on a parcel, and two shoppers may legitimately give the same one.
export const customerProfile = pgTable("customer_profile", {
  userId: text("userId").primaryKey(),
  email: text("email"),
  name: text("name"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// The shopper's saved shipping addresses. Scoped by userId, so an address id is only
// ever resolvable by the customer ref that owns it — an id belonging to someone else is
// a 404, not someone else's doorstep.
//
// `id` is an opaque string rather than a serial because the agent quotes it back to us
// ("send it to work"); a guessable sequence invites a caller to try its neighbours.
export const customerAddress = pgTable("customer_address", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  /** Free text, shopper's own words. Absent rather than invented. */
  label: text("label"),
  line1: text("line1").notNull(),
  city: text("city").notNull(),
  zip: text("zip").notNull(),
  country: text("country").notNull(),
  isDefault: boolean("isDefault").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Replay protection for POST /api/orders. Agents retry, so a repeated Idempotency-Key
// must return the first order rather than buying twice. Scoped by userId as well as
// key so one shopper's key can never surface another's order.
export const orderIdempotency = pgTable(
  "order_idempotency",
  {
    userId: text("userId").notNull(),
    key: text("key").notNull(),
    orderNumber: text("orderNumber").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
)

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
  /** The address book entry this order shipped to, whether picked or saved inline. */
  addressId: text("addressId"),
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
