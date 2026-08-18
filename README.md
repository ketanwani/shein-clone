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

Generate a secret and put it in `.env.local`:

```bash
echo "AGENT_API_KEY=$(openssl rand -hex 32)" >> .env.local
```

Restart the dev server, then give that value to the agent platform to send as
`X-Agent-Key`. In a hosted deployment set it as an environment variable (on Vercel:
Project → Settings → Environment Variables) rather than committing it.

**The agent path fails closed.** With `AGENT_API_KEY` unset, every agent route returns
`401` and logs a warning at startup — the routes are never left open. Browser traffic is
unaffected either way.

A few rules the server enforces:

- The key is compared in **constant time**, and is never logged, echoed, or included in
  an error message.
- `X-Customer-Ref` is required on user-scoped routes and treated as an opaque string. A
  missing ref is a `400`; sending a ref without a valid key is a `401`, never an
  anonymous fallback.
- `X-Customer-Email` is optional **contact data only**. It is never an identity, so two
  refs that supply the same address remain two separate shoppers. An email can never be
  used to read anyone's data.
- An unseen `X-Customer-Ref` is provisioned automatically on first use — no password, no
  OTP, no email verification.

### Worked example: a full purchase with headers only

No cookie jar, no bearer token, no OTP. Note that `curl` is never given `-b`/`-c`.

```bash
BASE=http://localhost:3000
export AGENT_KEY='<the value of AGENT_API_KEY>'
export CUSTOMER_REF='ig_17841400000000000'   # opaque + stable, one per shopper
AUTH=(-H "X-Agent-Key: $AGENT_KEY" -H "X-Customer-Ref: $CUSTOMER_REF")

# 1. Find something to buy (catalogue reads are public — no headers needed).
curl -s "$BASE/api/search?q=hoodie&limit=5" | jq -r '.products[] | "\(.handle)  \(.title)"'

# 2. Read the variant GID. That id is the merchandiseId, not the product id.
VARIANT=$(curl -s "$BASE/api/products/soft-cotton-hoodie-in-ocean" \
  | jq -r '.product.variants[0].id')

# 3. Add it to this shopper's bag.
curl -s "${AUTH[@]}" -H 'Content-Type: application/json' \
  -X POST "$BASE/api/cart/lines" \
  -d "{\"merchandiseId\":\"$VARIANT\",\"quantity\":2}" | jq '.cart.cost.subtotalAmount'

# 4. Confirm the bag — a separate request, and the items are still there.
curl -s "${AUTH[@]}" "$BASE/api/cart" | jq '.cart.lines[] | {title: .merchandise.product.title, quantity}'

# 5. Check out. Idempotency-Key makes the retry safe; totals are recomputed
#    server-side, so no amounts are accepted from the client.
curl -s "${AUTH[@]}" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: checkout-$CUSTOMER_REF-001" \
  -X POST "$BASE/api/orders" \
  -d '{"email":"shopper@example.com","name":"Ada Lovelace","address":"12 Analytical Way",
       "city":"London","zip":"EC1A 1AA","country":"GB",
       "cardNumber":"4242424242424242","expiry":"12/29","cvc":"123"}' \
  | jq '.order.orderNumber, .order.total'

# 6. Verify it was recorded.
curl -s "${AUTH[@]}" "$BASE/api/orders" | jq '.count'
```

Replaying step 5 with the same `Idempotency-Key` returns the *same* order and responds
`200` instead of `201` — it does not buy the bag twice. A declined card or an empty bag
does not consume the key, so the agent can fix the input and retry with it.

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
