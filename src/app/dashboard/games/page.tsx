import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function GamesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: games, error } = await supabase
    .from('games')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Games</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage your bowling game history
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/dashboard/games/frame-by-frame"
            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 text-sm sm:text-base"
          >
            Frame-by-Frame
          </Link>
          <Link
            href="/dashboard/games/new"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 text-sm sm:text-base"
          >
            Quick Add
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error loading games: {error.message}
        </div>
      )}

      {games && games.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <div className="text-6xl mb-4">🎳</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No games yet</h3>
          <p className="text-gray-500 mb-6">Get started by adding your first bowling game!</p>
          <Link
            href="/dashboard/games/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Add Your First Game
          </Link>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {games?.map((game) => (
              <li key={game.id}>
                <Link
                  href={`/dashboard/games/${game.id}`}
                  className="block hover:bg-gray-50"
                >
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <p className="text-2xl font-bold text-gray-900">
                          {game.score}
                        </p>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-900">
                            {game.location_name || 'No location'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {format(new Date(game.date), 'MMMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {game.score_source === 'ocr' ? '📸 Photo' : '✍️ Manual'}
                        </span>
                        <svg
                          className="ml-4 h-5 w-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </div>
                    {game.notes && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600">{game.notes}</p>
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

