# GLOWA Storefront REST API

A REST API for external apps and AI agents to browse products, manage a cart, place (simulated) orders, and manage a wishlist. Everything an agent does is scoped to the account that owns the API key.

- **Base URL:** `https://<your-deployment>/api/v1`
- **OpenAPI spec:** `GET /api/v1/openapi` (OpenAPI 3.1 JSON — point your agent/tooling at this)
- **Content type:** `application/json` for all request and response bodies

---

## Authentication

Every endpoint requires a **per-user API key**.

### Getting a key
1. Sign in to the site and open **My Account**.
2. In the **API Keys** section, enter a name (e.g. "Shopping Agent") and click **Create key**.
3. Copy the key immediately — it starts with `glowa_sk_` and is shown **only once**. Only a hash is stored server-side, so it can't be retrieved again. If lost, revoke it and create a new one.

### Using a key
Send it as a bearer token on every request:

```
Authorization: Bearer glowa_sk_xxxxxxxxxxxxxxxxxxxxxxxx
```

(An `X-API-Key: glowa_sk_...` header is also accepted.)

Requests without a valid key return `401`:

```json
{ "error": { "code": "unauthorized", "message": "Missing or invalid API key. Send it as 'Authorization: Bearer glowa_sk_...'." } }
```

Keys can be revoked anytime from the account page, which immediately invalidates them.

---

## Errors

Errors use a consistent shape and standard HTTP status codes:

```json
{ "error": { "code": "bad_request", "message": "'variantId' is required." } }
```

| Status | Meaning |
|--------|---------|
| `400`  | Validation error, declined card, or empty cart |
| `401`  | Missing or invalid API key |
| `404`  | Resource not found (product/order) |
| `500`  | Unexpected server error |

---

## Endpoints

### Products

**List / search** — `GET /products`

Query params: `q` (search text), `sort` (`best_selling` \| `newest` \| `price_asc` \| `price_desc` \| `relevance`), `limit` (1–100, default 50).

```bash
curl "https://<host>/api/v1/products?q=dress&sort=price_asc&limit=10" \
  -H "Authorization: Bearer $GLOWA_KEY"
```

**Get one** — `GET /products/{handle}`

```bash
curl "https://<host>/api/v1/products/satin-slip-maxi-dress" \
  -H "Authorization: Bearer $GLOWA_KEY"
```

Each product includes a `variants[]` array — use a variant's `id` as the `variantId` when adding to the cart.

### Cart

The cart is tied to your account automatically; there's no cart ID to track.

**Get cart** — `GET /cart`
**Empty cart** — `DELETE /cart`

**Add item** — `POST /cart/lines`

```bash
curl -X POST "https://<host>/api/v1/cart/lines" \
  -H "Authorization: Bearer $GLOWA_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "variantId": "gid://shopify/ProductVariant/123", "quantity": 2 }'
```

**Update quantity** (0 removes the line) — `PATCH /cart/lines`

```bash
curl -X PATCH "https://<host>/api/v1/cart/lines" \
  -H "Authorization: Bearer $GLOWA_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "lineId": "gid://shopify/CartLine/abc", "quantity": 3 }'
```

**Remove line** — `DELETE /cart/lines` with body `{ "lineId": "..." }`.

Every cart response returns the full updated cart, including each line's `lineId` (needed for updates/removals).

### Checkout

**Place a simulated order** — `POST /checkout`

Totals (subtotal, shipping, 8% tax) are **recomputed server-side** from the cart — client-supplied amounts are ignored. Payment is simulated: **only** test card `4242 4242 4242 4242` succeeds; any other number returns `400`.

```bash
curl -X POST "https://<host>/api/v1/checkout" \
  -H "Authorization: Bearer $GLOWA_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "shopper@example.com",
    "name": "Ada Lovelace",
    "address": "1 Analytical Ave",
    "city": "London",
    "zip": "EC1A",
    "country": "UK",
    "cardNumber": "4242424242424242",
    "expiry": "12/28",
    "cvc": "123"
  }'
```

On success the cart is emptied and the created order is returned. Orders are stored in the app's database (not in Shopify).

### Orders

**List** — `GET /orders`
**Get one** — `GET /orders/{orderNumber}` (e.g. `GLW-35887140`)

### Wishlist

**Get** — `GET /wishlist` → `{ handles, products }`
**Add** — `POST /wishlist` with `{ "productHandle": "satin-slip-maxi-dress" }`
**Remove** — `DELETE /wishlist` with `{ "productHandle": "satin-slip-maxi-dress" }`

---

## Typical agent flow

1. `GET /products?q=summer dress` → pick a product and a `variants[].id`.
2. `POST /cart/lines` with that `variantId`.
3. `GET /cart` → confirm contents and totals.
4. `POST /checkout` with shipping details and the test card.
5. `GET /orders/{orderNumber}` → confirm the order.

## Notes

- This is a **test/simulation** environment: no real payments are processed and orders do not sync to Shopify.
- All data (cart, orders, wishlist) is scoped to the API key's owning user.
- Point any OpenAPI-aware tool (agent frameworks, Postman, code generators) at `GET /api/v1/openapi`.
