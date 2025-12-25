import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  // Debug logging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('Middleware:', {
      path: request.nextUrl.pathname,
      hasUser: !!user,
      userEmail: user?.email,
      cookies: request.cookies.getAll().map(c => c.name),
      error: userError?.message,
    })
  }

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!user) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Redirecting to login - no user found')
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // Allow auth callback to proceed without redirect
  if (request.nextUrl.pathname.startsWith('/auth/callback')) {
    return response
  }

  // Redirect authenticated users away from auth pages
  if (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup')) {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/signup',
    '/auth/callback',
  ],
}

