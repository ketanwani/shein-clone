#!/usr/bin/env node
/**
 * Acceptance tests for the agent auth surface. No dependencies, no framework.
 *
 *   npm run db && npm run dev          # in another shell, with DEMO_OTP_CODE set
 *   DEMO_OTP_CODE=000000 node scripts/test-agent-auth.mjs
 *
 * These cover the credential rules that are invisible in a type signature and easy to
 * regress: which of the three credentials decides identity, what happens when two of
 * them name different shoppers, and whether a bag built before sign-in survives it.
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

  // --- All three together, and the mismatch ---------------------------------
  console.log("\nall three credentials, and ref/token mismatch")
  const ref = unique("ref")
  const variantId = await firstVariantId()

  // Build a bag under the ref alone, before anyone has signed in.
  const filled = await call("/api/cart/lines", { method: "POST", ref, body: { merchandiseId: variantId, quantity: 2 } })
  check("bag filled with ref only -> 201", filled.status === 201, `got ${filled.status}`)
  const refCartId = filled.json?.cart?.id

  // First authenticated call adopts the ref onto the account.
  const adopted = await call("/api/cart", { ref, token: a.token })
  check("all three credentials accepted -> 200", adopted.status === 200, `got ${adopted.status}`)
  check("ref-keyed bag survives sign-in", adopted.json?.cart?.id === refCartId, `got ${adopted.json?.cart?.id}`)
  check("bag contents intact", adopted.json?.cart?.totalQuantity === 2)

  // A second shopper. The ref now belongs to the first.
  const b = await signIn(`${unique("shopper-b")}@example.com`)
  await call("/api/wishlist", { method: "POST", token: a.token, body: { handle: "only-a-saved-this" } })

  for (const path of ["/api/wishlist", "/api/orders", "/api/cart"]) {
    const mismatch = await call(path, { ref, token: b.token })
    check(`${path}: ref of A + token of B -> 409`, mismatch.status === 409, `got ${mismatch.status}`)
    check(`${path}: ...code "customer_ref_mismatch"`, mismatch.json?.error?.code === "customer_ref_mismatch")
    check(
      `${path}: ...leaks none of A's data`,
      !JSON.stringify(mismatch.json ?? {}).includes("only-a-saved-this"),
    )
  }

  const matched = await call("/api/wishlist", { ref, token: a.token })
  check("matching ref + token still works -> 200", matched.status === 200, `got ${matched.status}`)
  check("...and returns the token holder's data", matched.json?.handles?.includes("only-a-saved-this"))

  const bAlone = await call("/api/wishlist", { token: b.token })
  check("token B without the ref is unaffected -> 200", bAlone.status === 200, `got ${bAlone.status}`)
  check("...and sees only its own data", (bAlone.json?.handles ?? []).length === 0)

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
