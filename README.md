# shein-clone

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_XPfXnQnTi0WGiUUv5JgkY2CYHx1b)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Agent access to the REST API

The storefront API is designed to be driven by an AI agent inside a chat surface — a
Meta Business AI agent in an Instagram DM, for example. Every tool call such an agent
makes is an independent, stateless HTTP request: there is no browser, no cookie jar, and
no way for the shopper to complete an email login without leaving the conversation.

So an agent sends two credentials, answering two distinct questions:

| Header | Answers | Set by | Changes |
| --- | --- | --- | --- |
| `X-Agent-Key` | "Is this really the GLOWA agent?" | GLOWA issues one shared secret; the agent platform injects it | Static |
| `X-Shopper-Email` | "Which shopper is this for?" | The agent, per shopper (demo mode only) | Per request |
| `Authorization: Bearer` | Optional. Only for routes that inspect a live session, and for browser/token clients | The shopper, via the OTP flow | Per sign-in, ~7 days |

They are checked independently: a valid token with no agent key is rejected, and so is an
agent key with no token.

There used to be a third header, `X-Customer-Ref` — an opaque per-conversation id the
agent asserted, which keyed the bag and provisioned a shopper on first sight. It has been
removed. A ref is the *caller* claiming who it is acting for, so everything it unlocked
was reachable by anyone holding the shared secret. The bag, profile, wishlist and order
history are all keyed by an account, so **a shopper must be named before the first
add-to-bag**, not merely before checkout. Requests that still send the ref are ignored
rather than rejected.

`X-Shopper-Email` reintroduces that same weakness on purpose, and only for the demo: the
Instagram agent runtime cannot yet carry a bearer token between calls, so there is
nothing to name the shopper with. It is off unless `ALLOW_SHOPPER_EMAIL_HEADER` is set,
and the OTP token remains the correct mechanism to return to.

### Configuring `AGENT_API_KEY`

**Locally you need no setup at all.** Outside production the well-known key
`dev-agent-key` is accepted, so the examples below work against `npm run dev`
immediately.

**Anywhere shared — including production — set the variable.** There is deliberately no
built-in fallback in production: a fixed credential in the source would let anyone
reach the agent routes against the public URL and, with a stolen token, every shopper's bag, wishlist
and order history.

```bash
openssl rand -hex 32          # generate
```

Set the result as an environment variable on the host (Vercel: Project → Settings →
Environment Variables), then give the value to the agent platform out-of-band — a
password manager or secret-share link, not Slack or email. Never commit it: a key in git
history cannot really be rotated, only regretted.

**The agent path fails closed.** In production with `AGENT_API_KEY` unset, every agent
route returns `401` and the server logs a warning at startup — the routes are never left
open. Browser traffic is unaffected either way.

#### Rotating without downtime

`AGENT_API_KEY` accepts a comma-separated list, and every listed key is valid. So a
rotation never has a window where the agent is getting 401s:

```bash
AGENT_API_KEY=old-key,new-key   # 1. both accepted — deploy this
                                # 2. move the caller onto new-key
AGENT_API_KEY=new-key           # 3. retire old-key — deploy this
```

Keys are compared in constant time, and every candidate is checked even after one
matches, so response timing does not reveal which key was the hit.

A few rules the server enforces:

- The key is compared in **constant time**, and is never logged, echoed, or included in
  an error message.
- Every shopper-scoped route — cart, customer, wishlist and orders — is named by
  `X-Shopper-Email`. **No token, sign-in or password is involved on that path**: nothing
  to store between calls, nothing to refresh. Naming nobody returns `400` with a hint
  saying what to send; a missing or wrong agent key returns `401`. Both are routine and
  recoverable rather than a dead end. A bearer token or browser cookie is still honoured
  when no header is present, which is what keeps the website's logged-in pages working.
- **`X-Shopper-Email` is asserted by the caller and proves nothing.** Anyone holding the
  agent key can act as any address. It is off unless `ALLOW_SHOPPER_EMAIL_HEADER` is set,
  exists only because the agent runtime cannot yet carry a bearer token between calls,
  and is acceptable only on a demo deployment with mock data.
- **Email is never a lookup key.** It is write-only contact data on the profile and the
  order. There is no way to reach a customer, an address book or an order history by
  supplying an email, so two shoppers who give the same address stay two separate
  accounts. A shopper who claims someone else's email gets their own empty profile.
- Address ids are scoped to their owner. One belonging to another shopper returns `404` —
  never `200`, and never a fall-through to that person's address.
- Accounts are created when a correct OTP arrives, never when one is requested, so a
  mistyped address leaves nothing behind.

### Knowing what to ask the shopper

`GET /api/customer` tells the agent what it still needs to collect. It **always returns
200**, including for a signed-in shopper we hold nothing for yet — that is a
normal state on the happy path, and a 4xx there would read to the model as a broken tool
and make it apologise or abandon the purchase.

```jsonc
// new shopper
{ "customer": { "status": "new",
                "missing": ["email", "name", "shipping_address"],
                "addresses": [] } }

// returning shopper
{ "customer": { "status": "known", "email": "ada@example.com", "name": "Ada Lovelace",
                "missing": [],
                "addresses": [
                  { "id": "addr_9f2c…", "label": "Home", "line1": "12 Analytical Way",
                    "city": "London", "zip": "EC1A 1AA", "country": "GB",
                    "is_default": true }
                ] } }
```

`missing` is an array of **field names, not prose** — the agent composes its own
question. Every address has a stable `id`, so when the shopper says "send it to work"
there is something concrete to send back as `address_id`.

**Do not front-load this.** Browsing, search and adding to the bag need no profile data
at all. Ask at checkout, or you have replaced a login wall with an interrogation.

### Worked example: a full purchase, no cookie jar

Note that `curl` is never given `-b`/`-c`, and there is no sign-in step. Every call
carries the same two headers.

```bash
BASE=http://localhost:3000
export AGENT_KEY='dev-agent-key'          # locally; the real secret anywhere shared
export SHOPPER_EMAIL='ada@example.com'    # who the calls are for
JSON=(-H 'Content-Type: application/json')

# No sign-in step: the two headers are the whole credential set.
AUTH=(-H "X-Agent-Key: $AGENT_KEY" -H "X-Shopper-Email: $SHOPPER_EMAIL")

# 1. Find something to buy (catalogue reads are public — no headers needed).
curl -s "$BASE/api/search?q=hoodie&limit=5" | jq -r '.products[] | "\(.handle)  \(.title)"'

# 2. Read the variant GID. That id is the merchandiseId, not the product id.
VARIANT=$(curl -s "$BASE/api/products/soft-cotton-hoodie-in-ocean" \
  | jq -r '.product.variants[0].id')

# 3. Add it to this shopper's bag. No profile needed to get this far.
curl -s "${AUTH[@]}" "${JSON[@]}" -X POST "$BASE/api/cart/lines" \
  -d "{\"merchandiseId\":\"$VARIANT\",\"quantity\":2}" | jq '.cart.cost.subtotalAmount'

# 4. Confirm the bag — a separate request, and the items are still there.
curl -s "${AUTH[@]}" "$BASE/api/cart" | jq '.cart.lines[] | {title: .merchandise.product.title, quantity}'

# 5. Now, at checkout, find out what to ask for.
curl -s "${AUTH[@]}" "$BASE/api/customer" | jq '.customer.missing, .customer.addresses'

# 6a. FIRST TIME — send a full inline address. It is saved to the address book,
#     and its id comes back on the order.
curl -s "${AUTH[@]}" "${JSON[@]}" -H "Idempotency-Key: checkout-001" \
  -X POST "$BASE/api/orders" \
  -d '{"email":"ada@example.com","name":"Ada Lovelace","address":"12 Analytical Way",
       "city":"London","zip":"EC1A 1AA","country":"GB",
       "cardNumber":"4242424242424242","expiry":"12/29","cvc":"123"}' \
  | jq '{order: .order.orderNumber, total: .order.total, address: .order.addressId}'

# 6b. NEXT TIME — the profile already has email and name, so an address id and a
#     card are the whole request.
ADDRESS_ID=$(curl -s "${AUTH[@]}" "$BASE/api/customer" | jq -r '.customer.addresses[0].id')
curl -s "${AUTH[@]}" "${JSON[@]}" -H "Idempotency-Key: checkout-002" \
  -X POST "$BASE/api/orders" \
  -d "{\"address_id\":\"$ADDRESS_ID\",
       \"cardNumber\":\"4242424242424242\",\"expiry\":\"12/29\",\"cvc\":\"123\"}" \
  | jq '.order.orderNumber'

# 7. Verify.
curl -s "${AUTH[@]}" "$BASE/api/orders" | jq '.count'
```

Replaying a checkout with the same `Idempotency-Key` returns the *same* order and
responds `200` instead of `201` — it does not buy the bag twice. A declined card or an
empty bag does not consume the key, so the agent can fix the input and retry with it.

An `address_id` belonging to a different shopper returns **404**. It never falls
through to an inline address, and never ships to the other shopper.

Payment is simulated: only the test card `4242424242424242` is accepted.

Full endpoint reference: [`/docs/api`](http://localhost:3000/docs/api), as markdown at
`/docs/api/raw`, and as OpenAPI 3.1 at `/api/openapi.json`.

### Browser clients are unchanged

The cookie and bearer-token paths still work exactly as before: catalogue reads are
public, a signed-in browser is identified by its session, and an anonymous bag rides on
an httpOnly `cartId` cookie. The agent path is selected purely by which credential is
present, and both share the same underlying cart storage.

One related note: the email-OTP flow and its `DEMO_OTP` fixed code have been **removed**.
A hardcoded `000000` let anyone who could reach the server sign in as any email address
and read that account's orders, and once agents authenticated with a key, nothing needed
it — the website's own login is email and password. There is no passwordless sign-in;
adding one back means wiring a real mail provider, not a fixed code.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
