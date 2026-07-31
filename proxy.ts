import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Must call getUser() (not getSession()) to properly validate the JWT
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const PUBLIC_PATHS = new Set(['/login', '/claim'])

  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Exclude /api/* — those are same-origin JSON route handlers that do their
    // own auth (Bearer JWT via requireUser, or the AssemblyAI webhook secret),
    // not cookie-session pages. The cookie-based redirect below is page-only.
    //
    // `.webmanifest` is excluded for the same reason as the image types: the
    // browser fetches it to decide whether the app is installable, and on
    // /login there is no session yet — redirecting it to /login would make the
    // manifest unparseable and silently kill the install prompt on the one
    // screen a new employee sees first. It carries no private data.
    '/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
}
