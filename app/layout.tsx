import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Archivo } from 'next/font/google'
import './globals.css'
import { CartProvider } from '@/components/cart/cart-provider'
import { WishlistProvider } from '@/components/wishlist/wishlist-provider'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { getCartAction } from '@/app/actions/cart'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo' })

export const metadata: Metadata = {
  title: 'GLOWA — Trendy Fashion, Tiny Prices',
  description:
    'Shop the latest fast-fashion trends in womenswear, menswear, shoes, beauty and home at GLOWA. New drops daily, unbeatable prices.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffffff',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [cart, session] = await Promise.all([
    getCartAction(),
    auth.api.getSession({ headers: await headers() }),
  ])
  const user = session?.user ?? null

  return (
    <html lang="en" className={`light ${inter.variable} ${archivo.variable}`}>
      <body className="antialiased font-sans bg-background text-foreground">
        <WishlistProvider isLoggedIn={!!user}>
          <CartProvider initialCart={cart}>
            <div className="flex min-h-screen flex-col">
              <Header user={user} />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </CartProvider>
        </WishlistProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
