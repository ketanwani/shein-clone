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

async function call(path, { method = "GET", token, ref, shopper, body, key = KEY } = {}) {
  const headers = {}
  if (key) headers["X-Agent-Key"] = key
  if (ref) headers["X-Customer-Ref"] = ref
  if (shopper) headers["X-Shopper-Email"] = shopper
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
    check(`${path}: agent key + stale ref, nobody named -> 400`, noBearer.status === 400, `got ${noBearer.status}`)
    check(`${path}: ...with code "bad_request"`, noBearer.json?.error?.code === "bad_request")

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
  check("POST /api/cart/lines naming nobody -> 400", noToken.status === 400, `got ${noToken.status}`)
  check("...code \"bad_request\"", noToken.json?.error?.code === "bad_request")
  check(
    "...hint tells the agent to run the OTP flow, not to give up",
    (noToken.json?.error?.hint ?? "").includes("do not hand off to a human") &&
      (noToken.json?.error?.hint ?? "").includes("/api/auth/sign-in/email-otp"),
  )
  const cartNoToken = await call("/api/cart")
  check("GET /api/cart naming nobody -> 400", cartNoToken.status === 400, `got ${cartNoToken.status}`)

  for (const path of ["/api/customer", "/api/customer/addresses"]) {
    const res = await call(path)
    check(`${path} naming nobody -> 400`, res.status === 400, `got ${res.status}`)
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
  check(
    "a ref names nobody, so it is the ordinary 400",
    refNoToken.status === 400,
    `got ${refNoToken.status}`,
  )

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

  // --- Test-only delete endpoint -------------------------------------------
  // Gated on two env vars; when either is missing the route must be a 404 rather than
  // a 401, so nothing advertises that it exists.
  console.log("\ntest-only delete endpoint")
  const deleteEnabled = process.env.ALLOW_USER_DELETE?.trim() && process.env.DEMO_OTP_CODE?.trim()

  const noOtp = await call("/api/admin/users?email=probe@example.com", { method: "DELETE" })
  if (deleteEnabled) {
    check("agent key without X-Admin-Otp -> 401", noOtp.status === 401, `got ${noOtp.status}`)
    const wrongOtp = await fetch(`${BASE}/api/admin/users?email=probe@example.com`, {
      method: "DELETE",
      headers: { "X-Agent-Key": KEY, "X-Admin-Otp": "999999" },
    })
    check("agent key with a wrong X-Admin-Otp -> 401", wrongOtp.status === 401, `got ${wrongOtp.status}`)

    const victim = `${unique("doomed")}@example.com`
    const v = await signIn(victim)
    await call("/api/wishlist", { method: "POST", token: v.token, body: { handle: "doomed-handle" } })
    const del = await fetch(`${BASE}/api/admin/users?email=${encodeURIComponent(victim)}`, {
      method: "DELETE",
      headers: { "X-Agent-Key": KEY, "X-Admin-Otp": OTP },
    })
    const delBody = await del.json()
    check("delete an existing shopper -> 200 deleted:true", del.status === 200 && delBody.deleted === true)
    check("...and reports what it removed", (delBody.counts?.wishlist_item ?? 0) >= 1)

    const dead = await call("/api/wishlist", { token: v.token })
    check("...their token is dead afterwards -> 401", dead.status === 401, `got ${dead.status}`)

    const again = await signIn(victim)
    check("...and the address can sign in fresh", typeof again.token === "string" && again.token !== v.token)
    const empty = await call("/api/wishlist", { token: again.token })
    check("...with none of the old data", (empty.json?.handles ?? []).length === 0)
  } else {
    check("delete endpoint is 404 when not enabled", noOtp.status === 404, `got ${noOtp.status}`)
  }

  // --- X-Shopper-Email -------------------------------------------------------
  console.log("\nnaming the shopper by email header")
  const headerMode = process.env.ALLOW_SHOPPER_EMAIL_HEADER?.trim()

  if (headerMode) {
    const addr = `${unique("hdr")}@example.com`
    const variantForHeader = await firstVariantId()

    const added = await call("/api/cart/lines", {
      method: "POST",
      shopper: addr,
      body: { merchandiseId: variantForHeader, quantity: 2 },
    })
    check("cart write with the email header, no bearer -> 201", added.status === 201, `got ${added.status}`)

    const bag = await call("/api/cart", { shopper: addr })
    check("the bag is there on the next call", bag.json?.cart?.id === added.json?.cart?.id)
    check("...with its contents", bag.json?.cart?.totalQuantity === 2)

    await call("/api/wishlist", { method: "POST", shopper: addr, body: { handle: "header-saved" } })
    const mixedCase = await call("/api/wishlist", { shopper: addr.toUpperCase() })
    check("UPPERCASE address is the same shopper", (mixedCase.json?.handles ?? []).includes("header-saved"))
    const padded = await call("/api/wishlist", { shopper: `  ${addr}  ` })
    check("padded address is the same shopper", (padded.json?.handles ?? []).includes("header-saved"))

    const other = await call("/api/wishlist", { shopper: `${unique("someone-else")}@example.com` })
    check("a different address sees none of it", (other.json?.handles ?? []).length === 0)

    // The token must win, or a stray header could redirect a signed-in shopper's writes.
    const tokenHolder = await signIn(`${unique("tokenwins")}@example.com`)
    await call("/api/wishlist", { method: "POST", token: tokenHolder.token, body: { handle: "token-only" } })
    const both = await call("/api/wishlist", { token: tokenHolder.token, shopper: addr })
    check("bearer wins when both are sent", (both.json?.handles ?? []).includes("token-only"))
    check("...and the header's shopper is not used", !(both.json?.handles ?? []).includes("header-saved"))

    const malformed = await call("/api/wishlist", { shopper: "not-an-email" })
    check("a malformed address names nobody -> 400", malformed.status === 400, `got ${malformed.status}`)

    const noKey = await call("/api/wishlist", { shopper: addr, key: null })
    check("the email header alone is not enough -> 401", noKey.status === 401, `got ${noKey.status}`)
  } else {
    const ignored = await call("/api/wishlist", { shopper: "ada@example.com" })
    check("the header is ignored when not enabled -> 400", ignored.status === 400, `got ${ignored.status}`)
  }

  for (const path of ["/api/cart", "/api/wishlist", "/api/orders", "/api/customer"]) {
    const nobody = await call(path)
    check(`${path}: naming nobody -> 400`, nobody.status === 400, `got ${nobody.status}`)
    check(`${path}: ...code "bad_request"`, nobody.json?.error?.code === "bad_request")
    check(
      `${path}: ...hint is actionable, not a dead end`,
      (nobody.json?.error?.hint ?? "").includes("do not hand off to a human"),
    )
  }

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
