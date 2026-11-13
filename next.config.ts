import type { NextConfig } from "next";

// Browser-side safety headers, sent with every response.
//
// Enforced now (cannot break the app):
//   X-Frame-Options DENY          — no other site can put MeetUp in a frame, so an
//                                   admin cannot be tricked into clicking buttons
//                                   on a hidden copy of the admin screens.
//   X-Content-Type-Options nosniff — the browser never guesses a file's type.
//   Referrer-Policy               — other sites only learn our origin, not full URLs.
//   Permissions-Policy            — switches off browser features MeetUp never uses.
//                                   The microphone is deliberately NOT listed: the
//                                   whole product records audio, and leaving it out
//                                   keeps the default (allowed for our own origin).
//
// Report-only for now: Content-Security-Policy. In report-only mode the browser
// merely logs what it WOULD have blocked in the console and blocks nothing, so it
// cannot break recording or login. After the app has been used on a real
// deployment with a clean console, rename the header to enforce it.
// ('unsafe-inline' is needed because Next injects inline scripts/styles; the
// stricter nonce-based policy would force every page, including the static
// login page, to render dynamically — see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.)

// Pin connections to OUR Supabase project instead of a wildcard. Falls back to
// any *.supabase.co if the env var is somehow missing at build time.
function supabaseHosts(): string {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
    return `https://${host} wss://${host}`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co";
  }
}

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseHosts()}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
