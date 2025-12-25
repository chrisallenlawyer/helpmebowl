import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return document.cookie.split('; ').map(cookie => {
            const [name, ...rest] = cookie.split('=')
            return { name, value: decodeURIComponent(rest.join('=')) }
          }).filter(cookie => cookie.name)
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieValue = encodeURIComponent(value)
            let cookieString = `${name}=${cookieValue}; path=${options?.path || '/'}; SameSite=${options?.sameSite || 'Lax'}`
            
            if (options?.maxAge) {
              cookieString += `; max-age=${options.maxAge}`
            }
            
            if (options?.domain) {
              cookieString += `; domain=${options.domain}`
            }
            
            if (options?.secure || window.location.protocol === 'https:') {
              cookieString += `; Secure`
            }
            
            // Don't set HttpOnly for client-side accessible cookies
            document.cookie = cookieString
          })
        },
      },
    }
  )
}

