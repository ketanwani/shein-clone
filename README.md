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

So for agents the trust boundary sits at the **caller**, not the end user. Two headers do
two distinct jobs:

| Header | Answers | Set by | Changes |
| --- | --- | --- | --- |
| `X-Agent-Key` | "Is this really the GLOWA agent?" | GLOWA issues one shared secret; the agent platform injects it | Static |
| `X-Customer-Ref` | "Which shopper is this for?" | The agent, per conversation (e.g. an Instagram-scoped user id) | Per request |

Per-user scoping does not go away — it moves from the user proving their identity to a
trusted caller asserting it. The bag, wishlist and order history are all keyed by the
customer ref, and two refs can never see each other's data.

### Configuring `AGENT_API_KEY`

**Locally you need no setup at all.** Outside production the well-known key
`dev-agent-key` is accepted, so the examples below work against `npm run dev`
immediately.

**Anywhere shared — including production — set the variable.** There is deliberately no
built-in fallback in production: a fixed credential in the source would let anyone
assert any customer ref against the public URL and read every shopper's bag, wishlist
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
- `X-Customer-Ref` is required on user-scoped routes and treated as an opaque string —
  never parsed, and never an email. A missing ref is a `400`; sending a ref without a
  valid key is a `401`, never an anonymous fallback.
- **Email is never a lookup key.** It is write-only contact data on the profile and the
  order. There is no way to reach a customer, an address book or an order history by
  supplying an email, so two refs that give the same address stay two separate shoppers.
  A shopper who claims someone else's email gets their own empty profile.
- Address ids are scoped to their owner. One belonging to another customer ref returns
  `404` — never `200`, and never a fall-through to that person's address.
- An unseen `X-Customer-Ref` is provisioned automatically on first use — no password, no
  OTP, no email verification.

### Knowing what to ask the shopper

`GET /api/customer` tells the agent what it still needs to collect. It **always returns
200**, including for a customer ref nobody has seen before — an unknown shopper is a
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

### Worked example: a full purchase with headers only

No cookie jar, no bearer token, no OTP. Note that `curl` is never given `-b`/`-c`.

```bash
BASE=http://localhost:3000
export AGENT_KEY='dev-agent-key'             # locally; the real secret anywhere shared
export CUSTOMER_REF='ig_17841400000000000'   # opaque + stable, one per shopper
AUTH=(-H "X-Agent-Key: $AGENT_KEY" -H "X-Customer-Ref: $CUSTOMER_REF")
JSON=(-H 'Content-Type: application/json')

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
curl -s "${AUTH[@]}" "${JSON[@]}" -H "Idempotency-Key: checkout-$CUSTOMER_REF-001" \
  -X POST "$BASE/api/orders" \
  -d '{"email":"ada@example.com","name":"Ada Lovelace","address":"12 Analytical Way",
       "city":"London","zip":"EC1A 1AA","country":"GB",
       "cardNumber":"4242424242424242","expiry":"12/29","cvc":"123"}' \
  | jq '{order: .order.orderNumber, total: .order.total, address: .order.addressId}'

# 6b. NEXT TIME — the profile already has email and name, so an address id and a
#     card are the whole request.
ADDRESS_ID=$(curl -s "${AUTH[@]}" "$BASE/api/customer" | jq -r '.customer.addresses[0].id')
curl -s "${AUTH[@]}" "${JSON[@]}" -H "Idempotency-Key: checkout-$CUSTOMER_REF-002" \
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

An `address_id` belonging to a different customer ref returns **404**. It never falls
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
