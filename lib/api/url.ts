/**
 * Absolute, https-only URLs for anything the API hands out.
 *
 * The agent consuming this API is instructed never to invent a URL, only to copy one
 * from a response, and it rejects anything that is not `https://`. So a relative path,
 * a protocol-relative `//host/…`, or an `http://` origin is not a cosmetic problem —
 * the card either fails validation or renders broken. Everything user-facing goes
 * through absoluteUrl().
 */

/**
 * Where this storefront is served from when nothing says otherwise.
 *
 * A stale-but-correct absolute origin beats a relative path for this consumer, so there
 * is a literal fallback rather than an error or an empty prefix. It is the one place the
 * host is written down; nothing else should hardcode it.
 */
const FALLBACK_ORIGIN = "https://shein-clone-ruby.vercel.app"

let warnedAboutScheme = false

/**
 * Normalises a configured origin to a bare `https://host` with no trailing slash.
 *
 * Returns null when the value cannot be salvaged, so the caller can fall through to the
 * next source rather than emitting something malformed.
 */
function normaliseOrigin(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  // Vercel supplies bare hostnames; a scheme-less value is a host, not a path.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return null
  }

  // http:// is upgraded rather than honoured. The field's contract is https-only, and a
  // silently non-conforming URL fails downstream where it is harder to trace than here.
  if (parsed.protocol !== "https:") {
    if (parsed.protocol !== "http:") return null
    if (!warnedAboutScheme) {
      warnedAboutScheme = true
      console.warn(
        `[url] NEXT_PUBLIC_SITE_URL is ${parsed.protocol}//${parsed.host} — upgrading to https. ` +
          "API URLs are https-only, so an http origin cannot be used as configured.",
      )
    }
    parsed.protocol = "https:"
  }

  return `https://${parsed.host}`
}

/**
 * The origin a development server should own, or null in production.
 *
 * NEXT_PUBLIC_SITE_URL is normally copied from the deployment, so honouring it locally
 * points every product link, product image and checkout link at a host that does not
 * have your work on it yet. That is not cosmetic: a locally generated image renders as a
 * broken box because the request goes to production, and a freshly minted checkout link
 * has to be hand-edited back to localhost before it can be opened.
 *
 * So development serves itself and NEXT_PUBLIC_SITE_URL applies in production, where the
 * https-only contract is the thing that matters. Set GLOWA_SITE_URL_IN_DEV=1 to opt back
 * into the configured origin — useful when checking exactly what the agent will be sent.
 */
function developmentOrigin(): string | null {
  if (process.env.NODE_ENV === "production") return null
  if (process.env.GLOWA_SITE_URL_IN_DEV?.trim()) return null
  return `http://localhost:${process.env.PORT?.trim() || "3000"}`
}

/**
 * The origin every absolute URL is built on.
 *
 * NEXT_PUBLIC_SITE_URL is the intended knob. VERCEL_PROJECT_PRODUCTION_URL is the
 * project's stable production domain and is a reasonable second guess.
 *
 * VERCEL_URL is deliberately NOT consulted: it is the per-deployment hostname, so a
 * preview build would mint canonical product links pointing at a preview that will be
 * torn down — links the agent may well have already sent to a shopper.
 */
export function siteOrigin(): string {
  return (
    developmentOrigin() ??
    normaliseOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normaliseOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    FALLBACK_ORIGIN
  )
}

/** Turns an app-relative path such as `/products/x` into a full https URL. */
export function absoluteUrl(path: string): string {
  return new URL(path, `${siteOrigin()}/`).toString()
}

/**
 * Makes an image URL safe to copy into a card.
 *
 * Shopify already returns absolute https CDN URLs, so in practice this passes them
 * through untouched. It exists for the cases that would otherwise render as a broken
 * image: a protocol-relative `//cdn.example/x.jpg`, which keeps its own host rather than
 * being reparented onto this site, an `http://` CDN, and a site-relative `/x.jpg`.
 */
export function absoluteImageUrl(url: string): string {
  const trimmed = url?.trim()
  if (!trimmed) return trimmed

  if (trimmed.startsWith("https://")) return trimmed
  if (trimmed.startsWith("//")) return `https:${trimmed}`
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`
  // Anything else — including a data: URI, which has no host to make absolute.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return absoluteUrl(trimmed.startsWith("/") ? trimmed : `/${trimmed}`)
}
