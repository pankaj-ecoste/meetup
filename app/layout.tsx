import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MeetUp',
  description: 'Internal operations platform — Ecoste · Lamora · Metamask',
  // Emits <meta name="mobile-web-app-capable">, the app title iOS shows under
  // the home-screen icon, and the status-bar style (plan.md §8.13).
  appleWebApp: {
    capable: true,
    title: 'MeetUp',
    statusBarStyle: 'default',
  },
  other: {
    // Next only emits the modern `mobile-web-app-capable`. Older iOS still
    // reads the Apple-prefixed name, and without it those devices open the
    // installed icon in a Safari chrome instead of standalone.
    'apple-mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  // Tints the Android status bar to match the app's indigo.
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  // Deliberately not setting maximumScale/userScalable: standalone mode has no
  // browser chrome to fall back on, so blocking pinch-zoom would leave anyone
  // who needs to magnify a task description with no way out.
  // Also deliberately not setting viewportFit: 'cover' — the layout has no
  // safe-area insets yet, so cover would slide the Nav under the iPhone notch.
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
