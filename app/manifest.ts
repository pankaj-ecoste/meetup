import type { MetadataRoute } from 'next'

// PWA install metadata (plan.md §8.13). `display: 'standalone'` is what drops
// the address bar once the app is on the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MeetUp — Ecoste · Lamora · Metamask',
    short_name: 'MeetUp',
    description: 'Voice-first task delegation, meetings, and ideas.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'en',
    // Matches the app background (gray-50) so the Android splash screen does
    // not flash a different colour before the first paint.
    background_color: '#f9fafb',
    theme_color: '#4f46e5',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Separate maskable copy: launchers crop to a circle, so this one keeps
      // the glyph inside the safe zone instead of clipping its edges.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
