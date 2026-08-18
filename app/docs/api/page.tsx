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
  session: "bg-accent/10 text-accent",
  bearer: "bg-sky-50 text-sky-900",
  agent: "bg-emerald-50 text-emerald-900",
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
        {endpoint.responses.map((response) => {
          const isSuccess = response.status < 400
          const body = (
            <>
              {response.example !== undefined && <Code className="mt-2">{JSON.stringify(response.example, null, 2)}</Code>}
              {response.exampleNote && <p className="mt-2 text-xs text-muted-foreground">{response.exampleNote}</p>}
            </>
          )

          return (
            <details
              key={response.status}
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
              A complete buy flow. Send <code className="font-mono text-xs">X-Agent-Key</code> and{" "}
              <code className="font-mono text-xs">X-Customer-Ref</code> on every user-scoped call below — there is no
              sign-in step, no token to store and no cookie jar, so each request stands on its own.
            </p>
            <ol className="mt-4 space-y-2 text-sm text-foreground/80">
              {[
                ["GET /api/collections", "discover valid category slugs"],
                ["GET /api/search?q=summer%20dress", "find candidate products"],
                ["GET /api/products/{handle}", "read variants[].id — that GID is the merchandiseId"],
                ["POST /api/cart/lines", "add to the bag — no profile data needed to get this far"],
                ["GET /api/cart", "confirm lines and totals"],
                ["GET /api/customer", "only now: read missing[] to see what to ask for, addresses[] to offer one"],
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
              Two headers, and nothing to carry between calls.{" "}
              <code className="font-mono text-xs">X-Agent-Key</code> is the shared secret GLOWA issued you, proving the
              caller is the agent; it never changes.{" "}
              <code className="font-mono text-xs">X-Customer-Ref</code> is an opaque, stable id for the shopper you are
              acting for and changes per conversation. An unseen ref is provisioned on first use — no password, no
              one-time code, and nothing for the shopper to fetch from an inbox.
            </p>
            <Code className="mt-3">{`export AGENT_KEY='...'                     # the secret GLOWA issued you
export CUSTOMER_REF='ig_17841400000000000'  # opaque, stable, one per shopper

curl -s -H "X-Agent-Key: $AGENT_KEY" -H "X-Customer-Ref: $CUSTOMER_REF" \\
  '${baseUrl}/api/wishlist'`}</Code>
            <p className="mt-3 text-sm text-foreground/80">
              Sending <code className="font-mono text-xs">X-Customer-Ref</code> without a valid key is a 401, never an
              anonymous fallback, and if the server has no{" "}
              <code className="font-mono text-xs">AGENT_API_KEY</code> configured the agent path is disabled entirely.
              Browser clients sign in with email and password instead.
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
