/**
 * Server startup hook.
 *
 * On a corp laptop all outbound traffic must go through an egress proxy, and direct
 * connections fail with EPERM. curl honours HTTP(S)_PROXY, but Node's global fetch
 * does not, so server-side Shopify calls would fail locally. Point undici's global
 * dispatcher at the proxy when one is configured — Node's built-in fetch reads the
 * same global, so `fetch` starts honouring it.
 *
 * No proxy variables are set on Vercel or in CI, so this is a no-op there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy
  if (!proxy) return

  const { ProxyAgent, setGlobalDispatcher } = await import("undici")
  setGlobalDispatcher(new ProxyAgent(proxy))
  console.log(`[instrumentation] routing server-side fetch through ${proxy}`)
}
