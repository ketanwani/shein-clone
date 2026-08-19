#!/usr/bin/env node
/**
 * Acceptance tests for the agent auth surface. No dependencies, no framework.
 *
 *   npm run db && npm run dev          # in another shell, with DEMO_OTP_CODE set
 *   DEMO_OTP_CODE=000000 node scripts/test-agent-auth.mjs
 *
 * These cover the credential rules that are invisible in a type signature and easy to
 * regress: that the caller credential and the shopper credential are independent, that
 * every shopper-scoped route needs a bearer token including the cart, and that a
 * lingering X-Customer-Ref changes nothing.
 *
 * Env: BASE_URL, AGENT_KEY, DEMO_OTP_CODE.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const KEY = process.env.AGENT_KEY ?? "local-dev-agent-key-9f3a2b"
const OTP = process.env.DEMO_OTP_CODE ?? "000000"

let passed = 0
const failures = []

function check(name, ok, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

async function call(path, { method = "GET", token, ref, body, key = KEY } = {}) {
  const headers = {}
  if (key) headers["X-Agent-Key"] = key
  if (ref) headers["X-Customer-Ref"] = ref
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers["Content-Type"] = "application/json"

  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, json, text }
}

const unique = (prefix) => `${prefix}-${Date.now().toString(36)}-${passed}-${Math.round(process.hrtime()[1] / 1000)}`

async function signIn(email) {
  await call("/api/auth/email-otp/send-verification-otp", { method: "POST", body: { email, type: "sign-in" } })
  const res = await call("/api/auth/sign-in/email-otp", { method: "POST", body: { email, otp: OTP } })
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status} ${res.text}`)
  return res.json.data
}

async function firstVariantId() {
  const res = await call("/api/products?limit=1", { key: null })
  return res.json.products[0].variants[0].id
}

async function main() {
  console.log(`\nagent auth acceptance — ${BASE}\n`)

  // --- Sign-in contract -----------------------------------------------------
  console.log("sign-in response shape")
  const a = await signIn(`${unique("shopper-a")}@example.com`)
  check("data.token present", typeof a.token === "string" && a.token.length > 0)
  check("data.expiresAt is ISO 8601", !Number.isNaN(Date.parse(a.expiresAt ?? "")))
  check("data.expiresAtUnix is an integer", Number.isInteger(a.expiresAtUnix))
  check(
    "expiresAtUnix is seconds, not milliseconds",
    a.expiresAtUnix > 1_000_000_000 && a.expiresAtUnix < 10_000_000_000,
    String(a.expiresAtUnix),
  )
  check(
    "expiresAtUnix agrees with expiresAt",
    Math.abs(Date.parse(a.expiresAt) / 1000 - a.expiresAtUnix) <= 1,
  )

  // --- The two credentials are independent ----------------------------------
  console.log("\ncredential independence")
  for (const path of ["/api/wishlist", "/api/orders"]) {
    const noBearer = await call(path, { ref: unique("ref") })
    check(`${path}: agent key + ref, no bearer -> 401`, noBearer.status === 401, `got ${noBearer.status}`)
    check(`${path}: ...with code "unauthorized"`, noBearer.json?.error?.code === "unauthorized")

    const noKey = await call(path, { token: a.token, key: null })
    check(`${path}: valid bearer, no agent key -> 401`, noKey.status === 401, `got ${noKey.status}`)

    const badKey = await call(path, { token: a.token, key: "wrong-key" })
    check(`${path}: valid bearer, wrong agent key -> 401`, badKey.status === 401, `got ${badKey.status}`)
  }

  // --- The cart now needs a token too ---------------------------------------
  console.log("\ncart requires the shopper, not just the caller")
  const variantId = await firstVariantId()

  const noToken = await call("/api/cart/lines", {
    method: "POST",
    body: { merchandiseId: variantId, quantity: 1 },
  })
  check("POST /api/cart/lines without a bearer -> 401", noToken.status === 401, `got ${noToken.status}`)
  check("...code \"unauthorized\"", noToken.json?.error?.code === "unauthorized")
  check(
    "...hint tells the agent to run the OTP flow, not to give up",
    (noToken.json?.error?.hint ?? "").includes("do not hand off to a human") &&
      (noToken.json?.error?.hint ?? "").includes("/api/auth/sign-in/email-otp"),
  )
  const cartNoToken = await call("/api/cart")
  check("GET /api/cart without a bearer -> 401", cartNoToken.status === 401, `got ${cartNoToken.status}`)

  for (const path of ["/api/customer", "/api/customer/addresses"]) {
    const res = await call(path)
    check(`${path} without a bearer -> 401`, res.status === 401, `got ${res.status}`)
  }

  // --- The whole journey on the bearer alone --------------------------------
  console.log("\nfull journey on the token alone")
  const added = await call("/api/cart/lines", {
    method: "POST",
    token: a.token,
    body: { merchandiseId: variantId, quantity: 2 },
  })
  check("add to bag with the token -> 201", added.status === 201, `got ${added.status}`)

  const bag = await call("/api/cart", { token: a.token })
  check("bag is there on the next call", bag.json?.cart?.id === added.json?.cart?.id)
  check("bag contents intact", bag.json?.cart?.totalQuantity === 2)

  const placed = await call("/api/orders", {
    method: "POST",
    token: a.token,
    body: {
      email: "ada@example.com",
      name: "Ada Lovelace",
      address: "12 Analytical Way",
      city: "London",
      zip: "EC1A 1AA",
      country: "GB",
      cardNumber: "4242424242424242",
      expiry: "12/29",
      cvc: "123",
    },
  })
  check("checkout with an inline address -> 201", placed.status === 201, `got ${placed.status} ${placed.text.slice(0, 120)}`)

  const book = await call("/api/customer/addresses", { token: a.token })
  check("checkout saved the address to the book", (book.json?.addresses ?? []).length === 1)
  const savedId = book.json?.addresses?.[0]?.id
  check("saved address has an id", typeof savedId === "string" && savedId.startsWith("addr_"))

  // "Ship it to my usual address" — the case the ref removal must not break.
  await call("/api/cart/lines", { method: "POST", token: a.token, body: { merchandiseId: variantId, quantity: 1 } })
  const reorder = await call("/api/orders", {
    method: "POST",
    token: a.token,
    body: { address_id: savedId, cardNumber: "4242424242424242", expiry: "12/29", cvc: "123" },
  })
  check("reorder quoting address_id -> 201", reorder.status === 201, `got ${reorder.status} ${reorder.text.slice(0, 120)}`)

  // --- A stale ref must change nothing --------------------------------------
  console.log("\na lingering X-Customer-Ref is ignored, not rejected")
  for (const path of ["/api/wishlist", "/api/orders", "/api/cart", "/api/customer"]) {
    const withRef = await call(path, { token: a.token, ref: "stale-ref-from-old-integration" })
    const without = await call(path, { token: a.token })
    check(`${path}: same status with and without the ref`, withRef.status === without.status, `${withRef.status} vs ${without.status}`)
    check(`${path}: not 400 or 409`, withRef.status !== 400 && withRef.status !== 409, `got ${withRef.status}`)
  }
  const refNoToken = await call("/api/cart", { ref: "stale-ref-from-old-integration" })
  check("ref without a token is still just 401", refNoToken.status === 401, `got ${refNoToken.status}`)

  // --- Enumeration --------------------------------------------------------
  console.log("\nuniform responses")
  const known = await call("/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    body: { email: `${unique("known")}@example.com`, type: "sign-in" },
  })
  const unknown = await call("/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    body: { email: `${unique("nobody")}@example.com`, type: "sign-in" },
  })
  check("send-otp: identical status for known and unknown", known.status === unknown.status)
  check("send-otp: identical body", known.text === unknown.text)

  const wrong = await call("/api/auth/sign-in/email-otp", {
    method: "POST",
    body: { email: `${unique("nobody")}@example.com`, otp: "123456" },
  })
  check("verify with a wrong code -> 401 invalid_code", wrong.status === 401 && wrong.json?.error?.code === "invalid_code")

  console.log(`\n${passed} passed, ${failures.length} failed`)
  if (failures.length) {
    console.log("\nfailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("\nharness error:", err.message)
  process.exit(1)
})
