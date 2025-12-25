import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // createBrowserClient automatically handles cookies
  // No need for custom cookie handlers
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

