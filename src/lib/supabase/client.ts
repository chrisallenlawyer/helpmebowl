import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // createBrowserClient from @supabase/ssr handles cookies automatically
  // It stores the session in cookies that middleware can read
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
