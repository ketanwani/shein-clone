/**
 * The storefront's own URL paths, in one place.
 *
 * These exist so the `url` on an API product cannot drift from the page a shopper
 * actually lands on. The agent copies that URL verbatim into a chat card and never
 * synthesises one, so a path that is right in the API and wrong in the app — or the
 * other way round — sends a real person to a 404.
 *
 * Both sides call these: the Link hrefs the site renders, and lib/api/url.ts when it
 * builds the absolute form. Moving a route means changing it here, once, and the two
 * cannot disagree afterwards.
 */

/** Canonical product detail page. Variants share it — there are no per-variant pages. */
export function productPath(handle: string): string {
  return `/products/${encodeURIComponent(handle)}`
}

export function collectionPath(slug: string): string {
  return `/collections/${encodeURIComponent(slug)}`
}
