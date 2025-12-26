'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { calculateStrikes, calculateSpares } from '@/lib/bowling-stats'
import { Frame } from '@/lib/bowling'

export const dynamic = 'force-dynamic'

interface Game {
  id: string
  score: number
  date: string
  frame_scores: Frame[] | null
}

export default function AnalyticsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState<Game[]>([])
  const [filteredGames, setFilteredGames] = useState<Game[]>([])
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  })

  useEffect(() => {
    loadGames()
  }, [])

  useEffect(() => {
    applyDateFilter()
  }, [games, dateRange])

  const loadGames = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('games')
        .select('id, score, date, frame_scores')
        .eq('user_id', user.id)
        .order('date', { ascending: false })

      if (error) throw error

      setGames(data || [])
      setDateRange({
        startDate: data && data.length > 0 
          ? new Date(data[data.length - 1].date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
      })
    } catch (error: any) {
      console.error('Error loading games:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyDateFilter = () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      setFilteredGames(games)
      return
    }

    const start = new Date(dateRange.startDate)
    const end = new Date(dateRange.endDate)
    end.setHours(23, 59, 59, 999) // Include the entire end date

    const filtered = games.filter(game => {
      const gameDate = new Date(game.date)
      return gameDate >= start && gameDate <= end
    })

    setFilteredGames(filtered)
  }

  // Calculate statistics from filtered games
  const gamesCount = filteredGames.length
  const average = gamesCount > 0
    ? Math.round(filteredGames.reduce((sum, game) => sum + game.score, 0) / gamesCount)
    : 0
  const highScore = gamesCount > 0
    ? Math.max(...filteredGames.map(game => game.score))
    : 0
  const lowScore = gamesCount > 0
    ? Math.min(...filteredGames.map(game => game.score))
    : 0

  // Calculate strikes and spares totals
  let totalStrikes = 0
  let totalSpares = 0

  filteredGames.forEach(game => {
    if (game.frame_scores && Array.isArray(game.frame_scores)) {
      totalStrikes += calculateStrikes(game.frame_scores)
      totalSpares += calculateSpares(game.frame_scores)
    }
  })

  // Calculate games in different score ranges
  const perfectGames = filteredGames.filter(g => g.score === 300).length
  const under100 = filteredGames.filter(g => g.score < 100).length

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateRange({ ...dateRange, startDate: e.target.value })
  }

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateRange({ ...dateRange, endDate: e.target.value })
  }

  const resetDateRange = () => {
    if (games.length > 0) {
      setDateRange({
        startDate: new Date(games[games.length - 1].date).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
      })
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center py-12">Loading analytics...</div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Detailed statistics about your bowling performance
        </p>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Date Range Filter</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              id="start-date"
              value={dateRange.startDate}
              onChange={handleStartDateChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
            />
          </div>
          <div>
            <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              id="end-date"
              value={dateRange.endDate}
              onChange={handleEndDateChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={resetDateRange}
              className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Reset to All Time
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Showing {gamesCount} {gamesCount === 1 ? 'game' : 'games'} in the selected date range
        </p>
      </div>

      {gamesCount === 0 ? (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No data yet</h3>
          <p className="text-gray-500">Add some games to see your analytics!</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-2xl">📊</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Average</dt>
                      <dd className="text-2xl font-semibold text-gray-900">{average}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-2xl">🎯</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">High Score</dt>
                      <dd className="text-2xl font-semibold text-gray-900">{highScore}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-2xl">📉</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Low Score</dt>
                      <dd className="text-2xl font-semibold text-gray-900">{lowScore}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-2xl">🎳</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Games</dt>
                      <dd className="text-2xl font-semibold text-gray-900">{gamesCount}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Strikes and Spares */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-2xl">⚡</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Strikes</dt>
                      <dd className="text-2xl font-semibold text-gray-900">{totalStrikes}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-2xl">🎯</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Spares</dt>
                      <dd className="text-2xl font-semibold text-gray-900">{totalSpares}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {gamesCount > 0 && (
              <>
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="text-2xl">⚡</div>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Avg Strikes/Game</dt>
                          <dd className="text-2xl font-semibold text-gray-900">
                            {totalStrikes > 0 ? (totalStrikes / gamesCount).toFixed(1) : '0'}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="text-2xl">🎯</div>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Avg Spares/Game</dt>
                          <dd className="text-2xl font-semibold text-gray-900">
                            {totalSpares > 0 ? (totalSpares / gamesCount).toFixed(1) : '0'}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Additional Statistics */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-2xl">⭐</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Perfect Games (300)</dt>
                      <dd className="text-2xl font-semibold text-gray-900">{perfectGames}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-2xl">📉</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Games Under 100</dt>
                      <dd className="text-2xl font-semibold text-gray-900">{under100}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
