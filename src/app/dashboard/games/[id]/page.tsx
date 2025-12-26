'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  type Frame,
  type GameState,
  getGameStateFromFrames,
  calculateMaxScore,
  validateRoll,
} from '@/lib/bowling'
import { calculateStrikes, calculateSpares } from '@/lib/bowling-stats'

export const dynamic = 'force-dynamic'

export default function GameDetailPage() {
  const router = useRouter()
  const params = useParams()
  const gameId = params.id as string
  const supabase = createClient()
  
  const [game, setGame] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editingFrames, setEditingFrames] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [frames, setFrames] = useState<Frame[]>(
    Array(10).fill(null).map(() => ({
      firstRoll: null,
      secondRoll: null,
      thirdRoll: null,
      isStrike: false,
      isSpare: false,
      isOpen: false,
      score: null,
      frameScore: null,
    }))
  )
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [formData, setFormData] = useState({
    date: '',
    location_name: '',
    location_address: '',
    notes: '',
    balls_used: [] as string[],
    oil_pattern: '',
  })
  const [newBallName, setNewBallName] = useState('')

  useEffect(() => {
    loadGame()
  }, [gameId])

  useEffect(() => {
    if (frames && frames.length === 10) {
      const newGameState = getGameStateFromFrames(frames)
      setGameState(newGameState)
    }
  }, [frames])

  const loadGame = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .eq('user_id', user.id)
        .single()

      if (error) throw error
      if (!data) {
        setError('Game not found')
        return
      }

      setGame(data)
      setFormData({
        date: data.date.split('T')[0],
        location_name: data.location_name || '',
        location_address: data.location_address || '',
        notes: data.notes || '',
        balls_used: data.balls_used || [],
        oil_pattern: data.oil_pattern || '',
      })

      // Load frame scores if available
      if (data.frame_scores && Array.isArray(data.frame_scores)) {
        const loadedFrames: Frame[] = data.frame_scores.map((fs: any) => ({
          firstRoll: fs.first ?? null,
          secondRoll: fs.second ?? null,
          thirdRoll: fs.third ?? null,
          isStrike: fs.first === 10,
          isSpare: fs.first !== null && fs.second !== null && fs.first !== 10 && fs.first + fs.second === 10,
          isOpen: fs.first !== null && fs.second !== null && fs.first !== 10 && fs.first + fs.second < 10,
          score: fs.score ?? null,
          frameScore: null,
        }))
        setFrames(loadedFrames)
      }
    } catch (error: any) {
      setError(error.message || 'Failed to load game')
    } finally {
      setLoading(false)
    }
  }

  const handleRollChange = (
    frameIndex: number,
    rollNumber: 1 | 2 | 3,
    value: string
  ) => {
    let numValue: number | null = null

    if (value === '') {
      numValue = null
    } else if (value === 'X') {
      numValue = 10
    } else if (value === '/') {
      if (rollNumber === 2 && frames[frameIndex].firstRoll !== null) {
        numValue = 10 - frames[frameIndex].firstRoll!
      } else {
        return
      }
    } else {
      const parsed = parseInt(value)
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
        numValue = parsed
      } else {
        return
      }
    }

    setFrames(prevFrames => {
      const newFrames = [...prevFrames]
      const frame = { ...newFrames[frameIndex] }
      
      if (rollNumber === 1) {
        frame.firstRoll = numValue
        if (numValue === 10 && frameIndex < 9) {
          frame.secondRoll = null
        }
      } else if (rollNumber === 2) {
        if (frame.firstRoll === null) return prevFrames
        if (frameIndex === 9 && frame.firstRoll === 10) {
          if (numValue !== null && (numValue < 0 || numValue > 10)) {
            return prevFrames
          }
        } else if (numValue !== null && !validateRoll(numValue, frameIndex, 2, frame.firstRoll)) {
          return prevFrames
        }
        frame.secondRoll = numValue
        if (frameIndex === 9 && frame.firstRoll !== null && numValue !== null && frame.firstRoll + numValue < 10) {
          frame.thirdRoll = null
        }
      } else if (rollNumber === 3) {
        if (frameIndex !== 9) return prevFrames
        if (frame.secondRoll === null) return prevFrames
        if (numValue !== null && (numValue < 0 || numValue > 10)) {
          return prevFrames
        }
        frame.thirdRoll = numValue
      }

      newFrames[frameIndex] = frame
      return newFrames
    })
  }

  const getBall1Value = (frame: Frame): string => {
    if (frame.firstRoll === null) return ''
    if (frame.firstRoll === 10) return 'X'
    return frame.firstRoll.toString()
  }

  const getBall2Value = (frame: Frame): string => {
    if (frame.secondRoll === null) return ''
    if (frame.firstRoll !== null && frame.firstRoll + frame.secondRoll === 10) return '/'
    return frame.secondRoll.toString()
  }

  const getCurrentScore = (): number => {
    if (!gameState) return game?.score || 0
    const lastScoredFrame = gameState
      .slice()
      .reverse()
      .find(f => f.score !== null)
    return lastScoredFrame?.score || 0
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Recalculate game state from frames if editing frames
      let finalGameState = gameState
      let finalScore = game?.score || 0
      
      if (editingFrames && frames) {
        finalGameState = getGameStateFromFrames(frames)
        const lastScoredFrame = finalGameState
          .slice()
          .reverse()
          .find(f => f.score !== null)
        finalScore = lastScoredFrame?.score || 0
      }

      const updateData: any = {
        date: formData.date,
        location_name: formData.location_name || null,
        location_address: formData.location_address || null,
        notes: formData.notes || null,
        balls_used: formData.balls_used.length > 0 ? formData.balls_used : null,
        oil_pattern: formData.oil_pattern || null,
        updated_at: new Date().toISOString(),
      }

      // Update score and frame_scores if frames were edited
      if (editingFrames && finalGameState) {
        updateData.score = finalScore
        updateData.frame_scores = finalGameState.map(f => ({
          first: f.firstRoll,
          second: f.secondRoll,
          third: f.thirdRoll,
          score: f.score,
        }))
      }

      const { error } = await supabase
        .from('games')
        .update(updateData)
        .eq('id', gameId)
        .eq('user_id', user.id)

      if (error) throw error

      setEditing(false)
      setEditingFrames(false)
      await loadGame()
    } catch (error: any) {
      setError(error.message || 'Failed to update game')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this game? This action cannot be undone.')) {
      return
    }

    setDeleting(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { error } = await supabase
        .from('games')
        .delete()
        .eq('id', gameId)
        .eq('user_id', user.id)

      if (error) throw error

      router.push('/dashboard/games')
    } catch (error: any) {
      setError(error.message || 'Failed to delete game')
      setDeleting(false)
    }
  }

  const addBall = () => {
    if (newBallName.trim() && !formData.balls_used.includes(newBallName.trim())) {
      setFormData({
        ...formData,
        balls_used: [...formData.balls_used, newBallName.trim()],
      })
      setNewBallName('')
    }
  }

  const removeBall = (ballName: string) => {
    setFormData({
      ...formData,
      balls_used: formData.balls_used.filter(b => b !== ballName),
    })
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        <div className="text-center py-12">Loading...</div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error || 'Game not found'}
        </div>
        <Link
          href="/dashboard/games"
          className="text-indigo-600 hover:text-indigo-900"
        >
          ← Back to games
        </Link>
      </div>
    )
  }

  const strikes = calculateStrikes(gameState || (game.frame_scores as any))
  const spares = calculateSpares(gameState || (game.frame_scores as any))

  return (
    <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/games"
          className="text-sm text-indigo-600 hover:text-indigo-900 mb-4 inline-block"
        >
          ← Back to games
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Game Details</h1>
            <p className="mt-1 text-sm text-gray-500">
              Score: <span className="text-2xl font-bold text-indigo-600">{game.score}</span>
            </p>
            {gameState && (
              <div className="mt-2 flex gap-4 text-sm">
                <span className="text-gray-600">
                  <span className="font-semibold">Strikes:</span> {strikes}
                </span>
                <span className="text-gray-600">
                  <span className="font-semibold">Spares:</span> {spares}
                </span>
              </div>
            )}
          </div>
          {!editing && !editingFrames && (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Edit Details
              </button>
              {game.frame_scores && (
                <button
                  onClick={() => setEditingFrames(true)}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Edit Frames
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Frame Editing */}
      {editingFrames && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Frames</h2>
          
          {/* Current Score Display */}
          {gameState && (
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-4 sm:p-6 mb-6 text-white shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="text-sm sm:text-base opacity-90">Current Score</div>
                  <div className="text-3xl sm:text-5xl font-bold">{getCurrentScore()}</div>
                </div>
              </div>
            </div>
          )}

          {/* Frames Grid */}
          <div className="bg-gray-50 rounded-lg p-4 sm:p-6 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 sm:gap-4">
              {frames.map((frame, frameIndex) => (
                <div
                  key={frameIndex}
                  className="border-2 rounded-lg p-2 sm:p-4 border-gray-200 bg-white"
                >
                  <div className="text-xs font-semibold text-gray-600 mb-1 sm:mb-2">
                    Frame {frameIndex + 1}
                    {frameIndex === 9 && <span className="block text-[10px] sm:text-xs">(10th)</span>}
                  </div>

                  {frameIndex === 9 ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-medium">Ball 1</label>
                        <select
                          value={getBall1Value(frame)}
                          onChange={(e) => handleRollChange(frameIndex, 1, e.target.value)}
                          className="w-full text-center text-black font-bold text-lg sm:text-xl px-2 py-2 sm:py-2.5 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
                        >
                          <option value="">-</option>
                          {[...Array(10)].map((_, i) => (
                            <option key={i} value={i}>
                              {i}
                            </option>
                          ))}
                          <option value="X">X</option>
                        </select>
                      </div>
                      {frame.firstRoll !== null && (
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500 font-medium">Ball 2</label>
                          {frame.firstRoll === 10 ? (
                            <select
                              value={frame.secondRoll === null ? '' : frame.secondRoll === 10 ? 'X' : frame.secondRoll.toString()}
                              onChange={(e) => handleRollChange(frameIndex, 2, e.target.value)}
                              className="w-full text-center text-black font-bold text-lg sm:text-xl px-2 py-2 sm:py-2.5 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
                            >
                              <option value="">-</option>
                              {[...Array(11)].map((_, i) => (
                                <option key={i} value={i}>
                                  {i}
                                </option>
                              ))}
                              <option value="X">X</option>
                            </select>
                          ) : (
                            <select
                              value={getBall2Value(frame)}
                              onChange={(e) => handleRollChange(frameIndex, 2, e.target.value)}
                              className="w-full text-center text-black font-bold text-lg sm:text-xl px-2 py-2 sm:py-2.5 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
                            >
                              <option value="">-</option>
                              {[...Array(11 - frame.firstRoll)].map((_, i) => (
                                <option key={i} value={i}>
                                  {i}
                                </option>
                              ))}
                              <option value="/">/</option>
                            </select>
                          )}
                        </div>
                      )}
                      {(frame.isStrike || frame.isSpare) && (
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500 font-medium">Ball 3</label>
                          <select
                            value={frame.thirdRoll === null || frame.thirdRoll === undefined ? '' : frame.thirdRoll === 10 ? 'X' : frame.thirdRoll.toString()}
                            onChange={(e) => handleRollChange(frameIndex, 3, e.target.value)}
                            disabled={frame.secondRoll === null}
                            className="w-full text-center text-black font-bold text-lg sm:text-xl px-2 py-2 sm:py-2.5 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed min-h-[44px]"
                          >
                            <option value="">-</option>
                            {[...Array(11)].map((_, i) => (
                              <option key={i} value={i}>
                                {i}
                              </option>
                            ))}
                            <option value="X">X</option>
                          </select>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-medium">Ball 1</label>
                        <select
                          value={getBall1Value(frame)}
                          onChange={(e) => handleRollChange(frameIndex, 1, e.target.value)}
                          className={`w-full text-center text-black font-bold text-lg sm:text-xl px-2 py-2 sm:py-2.5 border rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px] ${
                            frame.firstRoll === 10
                              ? 'bg-indigo-100 border-indigo-300'
                              : 'border-gray-300'
                          }`}
                        >
                          <option value="">-</option>
                          {[...Array(10)].map((_, i) => (
                            <option key={i} value={i}>
                              {i}
                            </option>
                          ))}
                          <option value="X">X</option>
                        </select>
                      </div>
                      {frame.firstRoll !== null && frame.firstRoll < 10 && (
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500 font-medium">Ball 2</label>
                          <select
                            value={getBall2Value(frame)}
                            onChange={(e) => handleRollChange(frameIndex, 2, e.target.value)}
                            className={`w-full text-center text-black font-bold text-lg sm:text-xl px-2 py-2 sm:py-2.5 border rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px] ${
                              frame.isSpare
                                ? 'bg-purple-100 border-purple-300'
                                : 'border-gray-300'
                            }`}
                          >
                            <option value="">-</option>
                            {[...Array(11 - frame.firstRoll)].map((_, i) => (
                              <option key={i} value={i}>
                                {i}
                              </option>
                            ))}
                            <option value="/">/</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {frame.score !== null && (
                    <div className="mt-1 sm:mt-2 text-center">
                      <div className="text-base sm:text-xl font-bold text-gray-900">
                        {frame.score}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setEditingFrames(false)
                loadGame()
              }}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Game Details Editing */}
      {editing && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Game Details</h2>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  id="edit-date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
                />
              </div>
              <div>
                <label htmlFor="edit-location_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Location Name
                </label>
                <input
                  type="text"
                  id="edit-location_name"
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  placeholder="e.g., AMF Lanes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="edit-location_address" className="block text-sm font-medium text-gray-700 mb-1">
                  Location Address
                </label>
                <input
                  type="text"
                  id="edit-location_address"
                  value={formData.location_address}
                  onChange={(e) => setFormData({ ...formData, location_address: e.target.value })}
                  placeholder="e.g., 123 Main St, City, State"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="edit-oil_pattern" className="block text-sm font-medium text-gray-700 mb-1">
                  Oil Pattern
                </label>
                <input
                  type="text"
                  id="edit-oil_pattern"
                  value={formData.oil_pattern}
                  onChange={(e) => setFormData({ ...formData, oil_pattern: e.target.value })}
                  placeholder="e.g., House Shot, Sport Shot, THS"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Balls Used
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newBallName}
                      onChange={(e) => setNewBallName(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addBall()
                        }
                      }}
                      placeholder="Enter ball name"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
                    />
                    <button
                      onClick={addBall}
                      className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Add
                    </button>
                  </div>
                  {formData.balls_used.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.balls_used.map((ball, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800"
                        >
                          {ball}
                          <button
                            onClick={() => removeBall(ball)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="edit-notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  id="edit-notes"
                  rows={4}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add any additional notes about this game..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditing(false)
                  loadGame()
                }}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Details Display */}
      {!editing && !editingFrames && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Date</label>
                <p className="text-base text-gray-900">
                  {format(new Date(game.date), 'MMMM d, yyyy')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Location</label>
                <p className="text-base text-gray-900">
                  {game.location_name || 'Not specified'}
                </p>
              </div>
              {game.location_address && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-1">Address</label>
                  <p className="text-base text-gray-900">{game.location_address}</p>
                </div>
              )}
              {game.oil_pattern && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Oil Pattern</label>
                  <p className="text-base text-gray-900">{game.oil_pattern}</p>
                </div>
              )}
              {game.balls_used && Array.isArray(game.balls_used) && game.balls_used.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Balls Used</label>
                  <div className="flex flex-wrap gap-2">
                    {game.balls_used.map((ball: string, index: number) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800"
                      >
                        {ball}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {game.notes && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-1">Notes</label>
                  <p className="text-base text-gray-900 whitespace-pre-wrap">{game.notes}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Source</label>
                <p className="text-base text-gray-900">
                  {game.score_source === 'ocr' ? '📸 Photo' : '✍️ Manual'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
