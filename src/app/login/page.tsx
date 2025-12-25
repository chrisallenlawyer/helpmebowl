'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    console.log('Login page mounted')
  }, [])

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    console.log('=== LOGIN START ===')
    console.log('handleLogin called', { email, passwordLength: password.length })
    setError(null)
    setLoading(true)

    try {
      console.log('Calling Supabase signInWithPassword...')
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('Login response:', { data, error, hasSession: !!data?.session, user: data?.user })

      if (error) {
        console.error('Login error:', error)
        setError(error.message || 'Login failed. Please check your email and password.')
        setLoading(false)
        return
      }

      if (!data?.session) {
        console.error('No session in response:', data)
        setError('No session created. Please check your credentials.')
        setLoading(false)
        return
      }

      console.log('Login successful, redirecting to dashboard...')
      console.log('Session user:', data.session.user.email)
      
      // Verify the user is actually logged in
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      console.log('Current user after login:', currentUser?.email)
      
      if (!currentUser) {
        console.error('User not found after login!')
        setError('Failed to establish session. Please try again.')
        setLoading(false)
        return
      }
      
      // Force a hard navigation to ensure cookies are set
      console.log('=== REDIRECTING TO DASHBOARD ===')
      console.log('Session token:', data.session.access_token.substring(0, 20) + '...')
      
      // Give a moment for cookies to be set by Supabase client
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Use window.location for full page reload to ensure middleware sees the session
      console.log('Executing redirect now...')
      window.location.href = '/dashboard'
    } catch (error: any) {
      console.error('Login exception:', error)
      setError(error.message || 'An error occurred during login')
      setLoading(false)
    }
  }

  const handleResendConfirmation = async () => {
    if (!email) {
      setError('Please enter your email address first')
      return
    }

    setResending(true)
    setError(null)
    setResendSuccess(false)

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback?next=/dashboard`,
        },
      })

      if (error) throw error

      setResendSuccess(true)
    } catch (error: any) {
      setError(error.message || 'Failed to resend confirmation email')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to HelpMeBowl
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
              create a new account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin} noValidate>
          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
              {error.includes('email') && (error.includes('confirm') || error.includes('Email')) && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resending}
                    className="text-sm underline hover:no-underline disabled:opacity-50"
                  >
                    {resending ? 'Sending...' : 'Resend confirmation email'}
                  </button>
                </div>
              )}
            </div>
          )}
          {resendSuccess && (
            <div className="bg-green-50 border border-green-400 text-green-700 px-4 py-3 rounded">
              Confirmation email sent! Please check your inbox.
            </div>
          )}
          {loading && (
            <div className="bg-blue-50 border border-blue-400 text-blue-700 px-4 py-3 rounded">
              Signing in... Check browser console for detailed logs.
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
        <div className="text-center">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
