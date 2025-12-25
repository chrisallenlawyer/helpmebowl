import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect to dashboard if already logged in
  if (user) {
    redirect('/dashboard')
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Welcome to HelpMeBowl
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            Track your bowling scores, calculate averages, and improve your game with OCR-powered score recognition
          </p>
          
          <div className="flex gap-4 justify-center mb-16">
            <Link
              href="/signup"
              className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="bg-white text-indigo-600 px-8 py-3 rounded-lg font-semibold border-2 border-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              Sign In
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-4xl mb-4">📸</div>
              <h3 className="text-xl font-semibold mb-2">OCR Score Recognition</h3>
              <p className="text-gray-600">
                Take photos of your bowling scores and automatically extract them
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Track Your Average</h3>
              <p className="text-gray-600">
                Monitor your progress with detailed analytics and statistics
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-xl font-semibold mb-2">Maximum Score Calculator</h3>
              <p className="text-gray-600">
                Calculate your maximum possible score from any point in a game
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
    </>
  )
}
