-- Baseline schema.
--
-- Deliberately idempotent, unlike a stock drizzle-kit baseline: IF NOT EXISTS on every
-- table, column and index, and DO blocks for the foreign keys. This migration has to be
-- able to run against a database that predates migrations and already holds most of
-- these objects, and against an empty one, and reach the same place either way.
--
-- That is what removes the need to baseline by hand. A database that is behind gets the
-- pieces it is missing; one that is current is untouched; a new one gets everything.
-- Later migrations are generated normally and need none of this.
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "emailVerified" boolean DEFAULT false NOT NULL,
  "image" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_email_unique" UNIQUE("email")
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "token" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL,
  CONSTRAINT "session_token_unique" UNIQUE("token")
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp,
  "refreshTokenExpiresAt" timestamp,
  "scope" text,
  "password" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wishlist_item" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "productHandle" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_cart" (
  "userId" text PRIMARY KEY NOT NULL,
  "cartId" text NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_profile" (
  "userId" text PRIMARY KEY NOT NULL,
  "email" text,
  "name" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_address" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "label" text,
  "line1" text NOT NULL,
  "city" text NOT NULL,
  "zip" text NOT NULL,
  "country" text NOT NULL,
  "isDefault" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_idempotency" (
  "userId" text NOT NULL,
  "key" text NOT NULL,
  "orderNumber" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "order_idempotency_userId_key_pk" PRIMARY KEY ("userId", "key")
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "orderNumber" text NOT NULL,
  "email" text NOT NULL,
  "shippingName" text NOT NULL,
  "shippingAddress" text NOT NULL,
  "shippingCity" text NOT NULL,
  "shippingZip" text NOT NULL,
  "shippingCountry" text NOT NULL,
  "subtotal" numeric(10, 2) NOT NULL,
  "shipping" numeric(10, 2) DEFAULT '0' NOT NULL,
  "tax" numeric(10, 2) DEFAULT '0' NOT NULL,
  "total" numeric(10, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "cardLast4" text,
  "status" text DEFAULT 'paid' NOT NULL,
  "addressId" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_item" (
  "id" serial PRIMARY KEY NOT NULL,
  "orderId" integer NOT NULL,
  "title" text NOT NULL,
  "variantTitle" text,
  "quantity" integer NOT NULL,
  "price" numeric(10, 2) NOT NULL,
  "imageUrl" text,
  "productHandle" text
  );
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "addressId" text;
--> statement-breakpoint
ALTER TABLE "customer_address" ADD COLUMN IF NOT EXISTS "label" text;
--> statement-breakpoint
ALTER TABLE "customer_profile" ADD COLUMN IF NOT EXISTS "email" text;
--> statement-breakpoint
ALTER TABLE "customer_profile" ADD COLUMN IF NOT EXISTS "name" text;
--> statement-breakpoint
DELETE FROM "wishlist_item" a USING "wishlist_item" b
WHERE a."id" > b."id"
  AND a."userId" = b."userId"
  AND a."productHandle" = b."productHandle";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wishlist_item_user_handle_idx"
  ON "wishlist_item" ("userId", "productHandle");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_userId_user_id_fk') THEN
    ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_userId_user_id_fk') THEN
    ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
  END IF;
END $$;
