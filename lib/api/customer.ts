/**
 * The shopper's profile and address book.
 *
 * Everything here is keyed by userId — the account the shopper proved they own by
 * completing the email-OTP flow. Email is write-only contact data: it is stored on the
 * profile and put on orders, and it is never a lookup key. There is deliberately no
 * function in this file that takes an email and returns a customer — if a shopper could
 * say "my email is someone@else.com" and receive that person's saved addresses, the
 * whole design would have failed.
 */

import { randomUUID } from "node:crypto"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { customerAddress, customerProfile, user } from "@/lib/db/schema"
import { ApiFailure } from "@/lib/api/failure"

/** Field names the agent still needs to collect. Machine-readable on purpose. */
export type MissingField = "email" | "name" | "shipping_address"

export type AddressInput = {
  line1: string
  city: string
  zip: string
  country: string
  label?: string | null
  isDefault?: boolean
}

/** Wire shape. snake_case here matches the agent-facing contract for this surface. */
export type AddressPayload = {
  id: string
  label?: string
  line1: string
  city: string
  zip: string
  country: string
  is_default: boolean
}

export async function listAddresses(userId: string): Promise<AddressPayload[]> {
  const rows = await db
    .select()
    .from(customerAddress)
    .where(eq(customerAddress.userId, userId))
    .orderBy(asc(customerAddress.createdAt))

  return rows.map((row) => ({
    id: row.id,
    ...(row.label ? { label: row.label } : {}),
    line1: row.line1,
    city: row.city,
    zip: row.zip,
    country: row.country,
    is_default: row.isDefault,
  }))
}

/**
 * Looks up one address, scoped to its owner.
 *
 * Returns null when the id is unknown *or* belongs to someone else — the caller turns
 * both into a 404, so an id cannot be probed to learn whether it exists.
 */
export async function findAddress(userId: string, addressId: string): Promise<AddressPayload | null> {
  const [row] = await db
    .select()
    .from(customerAddress)
    .where(and(eq(customerAddress.userId, userId), eq(customerAddress.id, addressId)))
    .limit(1)

  if (!row) return null
  return {
    id: row.id,
    ...(row.label ? { label: row.label } : {}),
    line1: row.line1,
    city: row.city,
    zip: row.zip,
    country: row.country,
    is_default: row.isDefault,
  }
}

export async function saveAddress(userId: string, input: AddressInput): Promise<AddressPayload> {
  const existing = await db
    .select({ id: customerAddress.id })
    .from(customerAddress)
    .where(eq(customerAddress.userId, userId))

  // The first address a shopper saves is their default; later ones only take over when
  // asked to.
  const isDefault = input.isDefault ?? existing.length === 0
  if (isDefault && existing.length > 0) {
    await db.update(customerAddress).set({ isDefault: false }).where(eq(customerAddress.userId, userId))
  }

  const id = `addr_${randomUUID().replace(/-/g, "").slice(0, 16)}`
  await db.insert(customerAddress).values({
    id,
    userId,
    label: input.label?.trim() || null,
    line1: input.line1.trim(),
    city: input.city.trim(),
    zip: input.zip.trim(),
    country: input.country.trim(),
    isDefault,
  })

  return {
    id,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    line1: input.line1.trim(),
    city: input.city.trim(),
    zip: input.zip.trim(),
    country: input.country.trim(),
    is_default: isDefault,
  }
}

/** Reuses an identical saved address rather than filling the book with duplicates. */
export async function saveAddressOnce(userId: string, input: AddressInput): Promise<AddressPayload> {
  const [match] = await db
    .select({ id: customerAddress.id })
    .from(customerAddress)
    .where(
      and(
        eq(customerAddress.userId, userId),
        eq(customerAddress.line1, input.line1.trim()),
        eq(customerAddress.city, input.city.trim()),
        eq(customerAddress.zip, input.zip.trim()),
        eq(customerAddress.country, input.country.trim()),
      ),
    )
    .limit(1)

  if (match) return (await findAddress(userId, match.id))!
  return saveAddress(userId, input)
}

export type CustomerProfile = {
  email: string | null
  name: string | null
}

/**
 * The shopper's contact details, falling back to the account itself.
 *
 * customer_profile only gets written when someone tells us something — a PATCH, or an
 * order. The account row already carries a name and an email long before that: set at
 * sign-up on the website, and set to the address the agent named for a shopper
 * provisioned by X-Shopper-Email.
 *
 * Reading only the profile meant GET /api/customer reported `missing: ["email","name"]`
 * for a shopper whose name and email we plainly had, so the agent would ask again for
 * details it had already been given. `missing` exists precisely to stop that.
 *
 * This is not email-as-a-lookup-key: the account is already resolved, and this reads a
 * column off it. Nothing here takes an address and finds a customer.
 */
export async function getProfile(userId: string): Promise<CustomerProfile> {
  const [row] = await db
    .select({ email: customerProfile.email, name: customerProfile.name })
    .from(customerProfile)
    .where(eq(customerProfile.userId, userId))
    .limit(1)

  if (row?.email && row?.name) return { email: row.email, name: row.name }

  const [account] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  // An OTP or header-provisioned account has an empty name, which is absent, not a name.
  const accountName = account?.name?.trim() || null

  return {
    email: row?.email ?? account?.email ?? null,
    name: row?.name ?? accountName,
  }
}

/** Records contact details the shopper has given. Never merges customers by email. */
export async function updateProfile(userId: string, patch: Partial<CustomerProfile>) {
  const email = patch.email?.trim() || undefined
  const name = patch.name?.trim() || undefined
  if (!email && !name) return

  // Upsert, not update. Nothing provisions a profile row up front any more — the ref
  // path used to, and an update-only write would now silently discard the first
  // address and name a shopper ever gives us.
  await db
    .insert(customerProfile)
    .values({ userId, email: email ?? null, name: name ?? null })
    .onConflictDoUpdate({
      target: customerProfile.userId,
      set: { ...(email ? { email } : {}), ...(name ? { name } : {}), updatedAt: new Date() },
    })
}

export type CustomerPayload = {
  status: "new" | "known"
  email?: string
  name?: string
  missing: MissingField[]
  addresses: AddressPayload[]
}

/**
 * The whole point of GET /api/customer: what does the agent still need to ask for?
 *
 * An unrecognised shopper is a normal state on the happy path, not an error, so this
 * always resolves — the caller returns 200 either way. A 4xx here would read to the
 * model as a broken tool and it would apologise, retry, or abandon the purchase.
 */
export async function buildCustomerPayload(userId: string): Promise<CustomerPayload> {
  const [{ email, name }, addresses] = await Promise.all([getProfile(userId), listAddresses(userId)])

  const missing: MissingField[] = []
  if (!email) missing.push("email")
  if (!name) missing.push("name")
  if (addresses.length === 0) missing.push("shipping_address")

  // "new" means the shopper has told us nothing yet. The email is deliberately not
  // part of that judgement: it now always resolves, being either the address the
  // caller named them by or the one they signed up with, so counting it would make
  // "new" unreachable and the field useless. A shopper part-way through onboarding
  // is "known" with a shorter missing list.
  const status = !name && addresses.length === 0 ? "new" : "known"

  return {
    status,
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    missing,
    addresses,
  }
}

export function addressNotFound(addressId: string) {
  return new ApiFailure(
    404,
    "not_found",
    `No address "${addressId}" for this customer.`,
    "Use an id from GET /api/customer, or send a full inline address instead.",
  )
}
