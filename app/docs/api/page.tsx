import type { Metadata } from "next"
import { headers } from "next/headers"
import { CopyButton } from "@/components/docs/copy-button"
import { curlFor } from "@/lib/api/curl"
import { renderSchema } from "@/lib/api/schema-render"
import {
  API_GROUPS,
  API_TITLE,
  API_VERSION,
  AUTH_LABELS,
  SCHEMAS,
  type ApiEndpoint,
  type ApiParam,
} from "@/lib/api/spec"

export const metadata: Metadata = {
  title: "API Reference — GLOWA",
  description: "REST endpoints for the GLOWA storefront, written for AI agent integration.",
}

const METHOD_STYLES: Record<ApiEndpoint["method"], string> = {
  GET: "bg-emerald-100 text-emerald-800",
  POST: "bg-sky-100 text-sky-800",
  PATCH: "bg-amber-100 text-amber-900",
  DELETE: "bg-rose-100 text-rose-800",
}

const AUTH_STYLES: Record<ApiEndpoint["auth"], string> = {
  public: "bg-muted text-muted-foreground",
  cart: "bg-amber-50 text-amber-900",
  bearer: "bg-sky-50 text-sky-900",
  agentKey: "bg-emerald-50 text-emerald-900",
  shopper: "bg-violet-50 text-violet-900",
}

function anchorFor(endpoint: ApiEndpoint) {
  return `${endpoint.method}-${endpoint.path}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function paramDetail(param: ApiParam) {
  const extras: string[] = []
  if (param.enum) extras.push(`One of: ${param.enum.join(", ")}.`)
  if (param.default !== undefined) extras.push(`Defaults to ${param.default}.`)
  return [param.description, ...extras].join(" ")
}

function Code({ children, className = "" }: { children: string; className?: string }) {
  return (
    <pre
      className={`overflow-x-auto rounded-lg border border-border bg-muted/60 p-4 text-xs leading-relaxed ${className}`}
    >
      <code className="font-mono">{children}</code>
    </pre>
  )
}

function FieldTable({
  caption,
  rows,
}: {
  caption: string
  rows: { name: string; type: string; required: boolean; detail: string }[]
}) {
  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{caption}</p>
      <table className="mt-2 w-full border-collapse text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-border last:border-0 align-top">
              <td className="w-40 py-2 pr-3 font-mono text-xs font-semibold">{row.name}</td>
              <td className="w-24 py-2 pr-3 text-xs text-muted-foreground">{row.type}</td>
              <td className="w-20 py-2 pr-3 text-xs text-muted-foreground">{row.required ? "required" : "optional"}</td>
              <td className="py-2 text-sm text-foreground/80">{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EndpointCard({ endpoint, baseUrl }: { endpoint: ApiEndpoint; baseUrl: string }) {
  const pathParams = (endpoint.params ?? []).filter((p) => p.in === "path")
  const queryParams = (endpoint.params ?? []).filter((p) => p.in === "query")
  const headerParams = (endpoint.params ?? []).filter((p) => p.in === "header")
  const curl = curlFor(endpoint, baseUrl)

  return (
    <article id={anchorFor(endpoint)} className="scroll-mt-24 rounded-xl border border-border p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${METHOD_STYLES[endpoint.method]}`}>
          {endpoint.method}
        </span>
        <span className="font-mono text-sm font-semibold break-all">{endpoint.path}</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${AUTH_STYLES[endpoint.auth]}`}>
          {AUTH_LABELS[endpoint.auth]}
        </span>
      </div>

      <h4 className="mt-3 font-serif text-lg font-bold">{endpoint.summary}</h4>
      <p className="mt-1 text-sm leading-relaxed text-foreground/80">{endpoint.description}</p>

      {headerParams.length > 0 && (
        <FieldTable
          caption="Headers"
          rows={headerParams.map((p) => ({
            name: p.name,
            type: p.type,
            required: Boolean(p.required),
            detail: paramDetail(p),
          }))}
        />
      )}

      {pathParams.length > 0 && (
        <FieldTable
          caption="Path parameters"
          rows={pathParams.map((p) => ({ name: p.name, type: p.type, required: true, detail: paramDetail(p) }))}
        />
      )}

      {queryParams.length > 0 && (
        <FieldTable
          caption="Query parameters"
          rows={queryParams.map((p) => ({
            name: p.name,
            type: p.type,
            required: Boolean(p.required),
            detail: paramDetail(p),
          }))}
        />
      )}

      {endpoint.body && (
        <FieldTable
          caption="Request body (application/json)"
          rows={endpoint.body.map((f) => ({
            name: f.name,
            type: f.type,
            required: Boolean(f.required),
            detail: f.description,
          }))}
        />
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Example request</p>
        <CopyButton text={curl} label="Copy curl" />
      </div>
      <Code className="mt-2">{curl}</Code>

      <p className="mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Responses</p>
      <div className="mt-2 space-y-2">
        {/* Keyed by index, not status: an endpoint can document two distinct failures
            that share a status, e.g. a missing body field and a missing header. */}
        {endpoint.responses.map((response, index) => {
          const isSuccess = response.status < 400
          const body = (
            <>
              {response.example !== undefined && <Code className="mt-2">{JSON.stringify(response.example, null, 2)}</Code>}
              {response.exampleNote && <p className="mt-2 text-xs text-muted-foreground">{response.exampleNote}</p>}
            </>
          )

          return (
            <details
              key={`${response.status}-${index}`}
              open={isSuccess}
              className="rounded-lg border border-border px-4 py-3 [&_summary]:cursor-pointer"
            >
              <summary className="text-sm">
                <span
                  className={`mr-2 font-mono text-xs font-bold ${isSuccess ? "text-emerald-700" : "text-rose-700"}`}
                >
                  {response.status}
                </span>
                <span className="text-foreground/80">{response.description}</span>
              </summary>
              {body}
            </details>
          )
        })}
      </div>

      {endpoint.notes?.length ? (
        <ul className="mt-4 space-y-1.5 border-l-2 border-accent/40 pl-4">
          {endpoint.notes.map((note) => (
            <li key={note} className="text-sm text-foreground/70">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

export default async function ApiDocsPage() {
  const host = (await headers()).get("host") ?? "localhost:3000"
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"
  const baseUrl = `${protocol}://${host}`
  const endpointCount = API_GROUPS.reduce((total, group) => total + group.endpoints.length, 0)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="border-b border-border pb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">For AI agents</p>
        <h1 className="mt-2 font-serif text-4xl font-extrabold md:text-5xl">{API_TITLE}</h1>
        <p className="mt-3 max-w-2xl text-base text-foreground/80">
          {endpointCount} REST endpoints covering the catalogue, the bag, the wishlist and checkout. Catalogue reads are
          public; the bag rides on a cookie; wishlist and orders need a per-user bearer token. Everything speaks JSON.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <CopyButton fetchUrl="/docs/api/raw" label="Copy full reference as markdown" className="bg-accent/10" />
          <a
            href="/docs/api/raw"
            className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-semibold transition hover:bg-muted"
          >
            Raw markdown
          </a>
          <a
            href="/api/openapi.json"
            className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-semibold transition hover:bg-muted"
          >
            OpenAPI 3.1 JSON
          </a>
          <span className="text-xs text-muted-foreground">
            v{API_VERSION} · base URL <code className="font-mono">{baseUrl}</code>
          </span>
        </div>
      </header>

      <div className="gap-10 pt-8 lg:flex">
        <nav className="mb-8 shrink-0 lg:sticky lg:top-24 lg:mb-0 lg:h-[calc(100vh-8rem)] lg:w-60 lg:overflow-y-auto">
          {API_GROUPS.map((group) => (
            <div key={group.slug} className="mb-5">
              <a href={`#${group.slug}`} className="text-sm font-bold hover:text-accent">
                {group.name}
              </a>
              <ul className="mt-1.5 space-y-1">
                {group.endpoints.map((endpoint) => (
                  <li key={anchorFor(endpoint)}>
                    <a
                      href={`#${anchorFor(endpoint)}`}
                      className="flex gap-2 text-xs text-muted-foreground transition hover:text-foreground"
                    >
                      <span className="w-12 shrink-0 font-mono font-semibold">{endpoint.method}</span>
                      <span className="truncate font-mono">{endpoint.path.replace("/api", "")}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <a href="#schemas" className="text-sm font-bold hover:text-accent">
            Schemas
          </a>
        </nav>

        <div className="min-w-0 flex-1 space-y-12">
          <section id="quickstart" className="scroll-mt-24">
            <h2 className="font-serif text-2xl font-extrabold">Agent quickstart</h2>
            <p className="mt-2 text-sm text-foreground/80">
              A complete buy flow. Send <code className="font-mono text-xs">X-Agent-Key</code> throughout, and{" "}
              <code className="font-mono text-xs">Authorization: Bearer</code> from step 4 onwards. No cookie jar is
              involved at any point.
            </p>
            <ol className="mt-4 space-y-2 text-sm text-foreground/80">
              {[
                ["GET /api/collections", "discover valid category slugs"],
                ["GET /api/search?q=summer%20dress", "find candidate products"],
                ["GET /api/products/{handle}", "read variants[].id — that GID is the merchandiseId"],
                ["POST /api/auth/sign-in/email-otp", "sign the shopper in; keep data.token. Or skip and send X-Shopper-Email instead"],
                ["POST /api/cart/lines", "add to the bag, as the signed-in shopper"],
                ["GET /api/cart", "confirm lines and totals"],
                ["GET /api/customer", "read missing[] to see what to ask for, addresses[] to offer one"],
                ["POST /api/orders", "checkout with address_id or an inline address, plus an Idempotency-Key"],
                ["GET /api/orders", "verify the order was recorded"],
              ].map(([call, why], index) => (
                <li key={call} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
                    {index + 1}
                  </span>
                  <span>
                    <code className="font-mono text-xs font-semibold">{call}</code>
                    <span className="text-muted-foreground"> — {why}</span>
                  </span>
                </li>
              ))}
            </ol>

            <h3 className="mt-8 font-serif text-lg font-bold">Authenticating</h3>
            <p className="mt-2 text-sm text-foreground/80">
              <code className="font-mono text-xs">X-Agent-Key</code> is the shared secret GLOWA issued you, proving the
              caller is the agent. It goes on every call, never changes, and proves the caller and nothing else.
            </p>
            <p className="mt-2 text-sm text-foreground/80">
              Naming the <em>shopper</em> is separate, and there are two ways.{" "}
              <code className="font-mono text-xs">Authorization: Bearer</code> from the OTP flow, or{" "}
              <code className="font-mono text-xs">X-Shopper-Email</code> carrying their address. If both arrive the
              token wins. The bag, profile, wishlist and order history are all keyed by the resulting account, so every
              one of those calls — including the first add-to-bag — must name a shopper. There is no anonymous agent
              bag.
            </p>
            <p className="mt-2 text-sm text-foreground/80">
              Addresses are trimmed and lowercased, so <code className="font-mono text-xs">Ada@Example.com</code> and{" "}
              <code className="font-mono text-xs">ada@example.com</code> are one shopper. An address seen for the first
              time provisions that shopper.
            </p>
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>⚠️ X-Shopper-Email is asserted by the caller and proves nothing.</strong> Anyone holding{" "}
              <code className="font-mono text-xs">X-Agent-Key</code> can read or modify any shopper&apos;s bag,
              wishlist, profile and order history by naming their address — the same weakness{" "}
              <code className="font-mono text-xs">X-Customer-Ref</code> was removed for, knowingly reintroduced. The
              OTP bearer token is the correct mechanism and is still implemented; this exists only because the agent
              runtime cannot yet carry a token between calls. It is off unless the server sets{" "}
              <code className="font-mono text-xs">ALLOW_SHOPPER_EMAIL_HEADER</code>, and is acceptable only on this
              demo deployment, which holds mock products and simulated payments.
            </p>
            <Code className="mt-3">{`export AGENT_KEY='...'   # the secret GLOWA issued you

# 1. Sign the shopper in. The code goes to them, never to you.
curl -s -X POST -H "X-Agent-Key: $AGENT_KEY" -H 'Content-Type: application/json' \\
  -d '{"email":"ada@example.com","type":"sign-in"}' \\
  '${baseUrl}/api/auth/email-otp/send-verification-otp'

curl -s -X POST -H "X-Agent-Key: $AGENT_KEY" -H 'Content-Type: application/json' \\
  -d '{"email":"ada@example.com","otp":"123456"}' \\
  '${baseUrl}/api/auth/sign-in/email-otp'
# -> {"data":{"token":"...","expiresAt":"...","expiresAtUnix":1787739561,"user":{...}}}

export TOKEN='...'   # data.token from the response above

# 2. Everything shopper-scoped: agent key + the shopper's token.
curl -s -H "X-Agent-Key: $AGENT_KEY" -H "Authorization: Bearer $TOKEN" \\
  '${baseUrl}/api/cart'

# Or, where the runtime cannot carry a token, name the shopper directly:
curl -s -H "X-Agent-Key: $AGENT_KEY" -H "X-Shopper-Email: ada@example.com" \\
  '${baseUrl}/api/cart'`}</Code>
            <p className="mt-3 text-sm text-foreground/80">
              If the server has no <code className="font-mono text-xs">AGENT_API_KEY</code> configured the agent path is
              disabled entirely and every call returns 401. Browser clients sign in with email and password instead, and
              an anonymous browser bag rides on a <code className="font-mono text-xs">cartId</code> cookie until its
              shopper signs in.
            </p>
            <p className="mt-3 text-sm text-foreground/80">
              Sign-in never tells you whether an address has an account: the send call returns the same 200 either way,
              and every verification failure is the same 401{" "}
              <code className="font-mono text-xs">invalid_code</code>. Do not report &ldquo;no account found&rdquo; to a
              shopper — you were not told that. Sessions last 7 days and there is no refresh token, so store{" "}
              <code className="font-mono text-xs">data.expiresAt</code> or{" "}
              <code className="font-mono text-xs">data.expiresAtUnix</code> and run the flow again when it passes. A 401
              on a shopper-scoped call is routine and recoverable — re-run the flow and retry.
            </p>

            <h3 className="mt-8 font-serif text-lg font-bold">Conventions</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-foreground/80">
              <li>Money is always a decimal string plus a currency code, never a float.</li>
              <li>
                Products are addressed by <code className="font-mono text-xs">handle</code>; cart lines and variants by
                Shopify GIDs, which must be echoed back exactly as received.
              </li>
              <li>
                List endpoints return <code className="font-mono text-xs">count</code> beside the array. There is no
                pagination and <code className="font-mono text-xs">limit</code> caps at 50.
              </li>
              <li>
                Every error shares one shape, so an agent can branch on <code className="font-mono text-xs">error.code</code>:
              </li>
            </ul>
            <Code className="mt-3">
              {JSON.stringify(
                {
                  error: {
                    code: "not_found",
                    message: 'No product with handle "nope".',
                    hint: "Present when there is a concrete next step.",
                  },
                },
                null,
                2,
              )}
            </Code>
          </section>

          {API_GROUPS.map((group) => (
            <section key={group.slug} id={group.slug} className="scroll-mt-24">
              <h2 className="font-serif text-2xl font-extrabold">{group.name}</h2>
              <p className="mt-2 max-w-3xl text-sm text-foreground/80">{group.description}</p>
              <div className="mt-5 space-y-5">
                {group.endpoints.map((endpoint) => (
                  <EndpointCard key={anchorFor(endpoint)} endpoint={endpoint} baseUrl={baseUrl} />
                ))}
              </div>
            </section>
          ))}

          <section id="schemas" className="scroll-mt-24">
            <h2 className="font-serif text-2xl font-extrabold">Schemas</h2>
            <p className="mt-2 text-sm text-foreground/80">Shapes referenced by the responses above.</p>
            <div className="mt-5 space-y-4">
              {Object.entries(SCHEMAS).map(([name, schema]) => (
                <Code key={name}>{renderSchema(name, schema)}</Code>
              ))}
            </div>
          </section>

          <section id="limits" className="scroll-mt-24">
            <h2 className="font-serif text-2xl font-extrabold">Limits and gotchas</h2>
            <ul className="mt-3 space-y-2 text-sm text-foreground/80">
              <li>
                <code className="font-mono text-xs">POST /api/orders</code> is not idempotent — calling it twice with a
                non-empty bag creates two orders.
              </li>
              <li>Payment is simulated. Only 4242424242424242 is accepted; anything else returns order_rejected.</li>
              <li>
                Totals are recomputed server-side (subtotal + 3.99 shipping under a 29 subtotal + 8% tax). Client-sent
                amounts are ignored.
              </li>
              <li>Cart endpoints need Shopify credentials; wishlist and orders need Postgres. Both return 503 when unset.</li>
              <li>No rate limiting, no pagination, and wishlist handles are not validated against the catalogue.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
