CREATE TABLE "checkout_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"sessionExpiresAt" timestamp,
	"consumedAt" timestamp,
	"orderId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_grant_token_idx" ON "checkout_grant" USING btree ("tokenHash");