'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  type Frame,
  type GameState,
  getGameStateFromFrames,
  calculateMaxScore,
  validateRoll,
} from '@/lib/bowling'

// This is a client component that requires authentication, so it should not be statically generated
export const dynamic = 'force-dynamic'

export default function FrameByFramePage() {
  const router = useRouter()
  const supabase = createClient()
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
  const [currentFrame, setCurrentFrame] = useState(0)
  const [gameState, setGameState] = useState<GameState>(frames)
  const [maxScore, setMaxScore] = useState(300)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const newGameState = getGameStateFromFrames(frames)
    setGameState(newGameState)
    
    // Find the first incomplete frame
    let incompleteFrame = 10
    for (let i = 0; i < 10; i++) {
      const frame = newGameState[i]
      if (frame.firstRoll === null) {
        incompleteFrame = i
        break
      }
      if (i === 9) {
        // Frame 10 special handling
        if (frame.isStrike && (frame.secondRoll === null || frame.thirdRoll === null)) {
          incompleteFrame = i
          break
        } else if (frame.isSpare && frame.thirdRoll === null) {
          incompleteFrame = i
          break
        } else if (!frame.isStrike && !frame.isSpare && frame.secondRoll === null) {
          incompleteFrame = i
          break
        }
      } else {
        if (frame.isStrike || (frame.firstRoll !== null && frame.secondRoll !== null)) {
          continue
        } else if (frame.firstRoll !== null && frame.secondRoll === null) {
          incompleteFrame = i
          break
        }
      }
    }
    setCurrentFrame(incompleteFrame)
    setMaxScore(calculateMaxScore(newGameState, incompleteFrame))
  }, [frames])

  const handleRollChange = (
    frameIndex: number,
    rollNumber: 1 | 2 | 3,
    value: string
  ) => {
    const numValue = value === '' ? null : parseInt(value)
    
    if (numValue !== null && (numValue < 0 || numValue > 10)) {
      return
    }

    setFrames(prevFrames => {
      const newFrames = [...prevFrames]
      const frame = { ...newFrames[frameIndex] }
      
      if (rollNumber === 1) {
        frame.firstRoll = numValue
        if (numValue === 10 && frameIndex < 9) {
          // Strike in frames 1-9: clear second roll
          frame.secondRoll = null
        }
      } else if (rollNumber === 2) {
        if (frame.firstRoll === null) return prevFrames
        if (numValue !== null && !validateRoll(numValue, frameIndex, 2, frame.firstRoll)) {
          return prevFrames
        }
        frame.secondRoll = numValue
        // If frame 10 and not a strike/spare yet, no third roll
        if (frameIndex === 9 && frame.firstRoll + (numValue || 0) < 10) {
          frame.thirdRoll = null
        }
      } else if (rollNumber === 3) {
        // Only frame 10 can have a third roll
        if (frameIndex !== 9) return prevFrames
        if (frame.secondRoll === null) return prevFrames
        frame.thirdRoll = numValue
      }

      newFrames[frameIndex] = frame
      return newFrames
    })
  }

  const getCurrentScore = (): number => {
    const lastScoredFrame = gameState
      .slice()
      .reverse()
      .find(f => f.score !== null)
    return lastScoredFrame?.score || 0
  }

  const isGameComplete = (): boolean => {
    const frame10 = gameState[9]
    if (frame10.firstRoll === null) return false
    if (frame10.isStrike || frame10.isSpare) {
      return frame10.thirdRoll !== null
    }
    return frame10.secondRoll !== null
  }

  const handleSave = async () => {
    if (!isGameComplete()) {
      setError('Please complete the game before saving')
      return
    }

    const finalScore = getCurrentScore()
    if (finalScore === 0) {
      setError('Cannot save a game with 0 score')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { error } = await supabase.from('games').insert({
        user_id: user.id,
        score: finalScore,
        date: new Date().toISOString(),
        score_source: 'manual',
        frame_scores: gameState.map(f => ({
          first: f.firstRoll,
          second: f.secondRoll,
          third: f.thirdRoll,
          score: f.score,
        })),
      })

      if (error) throw error

      router.push('/dashboard/games')
    } catch (error: any) {
      setError(error.message || 'Failed to save game')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/games"
          className="text-sm text-indigo-600 hover:text-indigo-900 mb-4 inline-block"
        >
          ← Back to games
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Frame-by-Frame Scoring</h1>
        <p className="mt-1 text-sm text-gray-500">Enter your game frame by frame</p>
      </div>

      {/* Current Score Display */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-4 sm:p-6 mb-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="text-sm sm:text-base opacity-90">Current Score</div>
            <div className="text-3xl sm:text-5xl font-bold">{getCurrentScore()}</div>
          </div>
          <div className="text-right">
            <div className="text-sm sm:text-base opacity-90">Maximum Possible</div>
            <div className="text-2xl sm:text-4xl font-bold">{maxScore}</div>
            {maxScore < 300 && (
              <div className="text-xs sm:text-sm opacity-75 mt-1">
                {300 - maxScore} points lost
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Frames Grid */}
      <div className="bg-white shadow rounded-lg p-3 sm:p-6 mb-6 overflow-x-auto">
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 sm:gap-4 min-w-max sm:min-w-0">
          {frames.map((frame, frameIndex) => {
            const isCurrent = frameIndex === currentFrame
            const isComplete = frameIndex < 9
              ? (frame.isStrike || (frame.firstRoll !== null && frame.secondRoll !== null))
              : (frame.isStrike
                  ? (frame.secondRoll !== null && frame.thirdRoll !== null)
                  : frame.isSpare
                  ? (frame.thirdRoll !== null)
                  : (frame.secondRoll !== null))

            return (
              <div
                key={frameIndex}
                className={`border-2 rounded-lg p-2 sm:p-4 min-w-[80px] sm:min-w-0 ${
                  isCurrent
                    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                    : isComplete
                    ? 'border-gray-300 bg-gray-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="text-xs font-semibold text-gray-600 mb-1 sm:mb-2">
                  Frame {frameIndex + 1}
                  {frameIndex === 9 && <span className="block text-[10px] sm:text-xs">(10th)</span>}
                </div>

                {/* Frame 10 has different layout */}
                {frameIndex === 9 ? (
                  <div className="space-y-1 sm:space-y-2">
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={frame.firstRoll ?? ''}
                        onChange={(e) => handleRollChange(frameIndex, 1, e.target.value)}
                        className="w-full text-center text-black font-bold text-base sm:text-lg px-1 sm:px-2 py-1.5 sm:py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="1"
                      />
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={frame.secondRoll ?? ''}
                        onChange={(e) => handleRollChange(frameIndex, 2, e.target.value)}
                        disabled={frame.firstRoll === null}
                        className="w-full text-center text-black font-bold text-base sm:text-lg px-1 sm:px-2 py-1.5 sm:py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="2"
                      />
                    </div>
                    {(frame.isStrike || frame.isSpare) && (
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={frame.thirdRoll ?? ''}
                        onChange={(e) => handleRollChange(frameIndex, 3, e.target.value)}
                        disabled={frame.secondRoll === null}
                        className="w-full text-center text-black font-bold text-base sm:text-lg px-1 sm:px-2 py-1.5 sm:py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="3"
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={frame.firstRoll ?? ''}
                      onChange={(e) => handleRollChange(frameIndex, 1, e.target.value)}
                      className={`flex-1 text-center text-black font-bold text-base sm:text-lg px-1 sm:px-2 py-1.5 sm:py-2 border rounded ${
                        frame.firstRoll === 10
                          ? 'bg-indigo-100 border-indigo-300'
                          : 'border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                      }`}
                      placeholder="1"
                    />
                    {/* Show second input unless first roll is a strike (10 pins) */}
                    {frame.firstRoll !== 10 && (
                      <input
                        type="number"
                        min="0"
                        max={10 - (frame.firstRoll || 0)}
                        value={frame.secondRoll ?? ''}
                        onChange={(e) => handleRollChange(frameIndex, 2, e.target.value)}
                        disabled={frame.firstRoll === null}
                        className={`flex-1 text-center text-black font-bold text-base sm:text-lg px-1 sm:px-2 py-1.5 sm:py-2 border rounded ${
                          frame.isSpare
                            ? 'bg-purple-100 border-purple-300'
                            : 'border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed'
                        }`}
                        placeholder="2"
                      />
                    )}
                    {/* Show X indicator when first roll is a strike */}
                    {frame.firstRoll === 10 && (
                      <div className="flex-1 flex items-center justify-center bg-indigo-100 border border-indigo-300 rounded font-bold text-indigo-700 text-base sm:text-lg py-1.5 sm:py-2">
                        X
                      </div>
                    )}
                  </div>
                )}

                {/* Display frame score */}
                {frame.score !== null && (
                  <div className="mt-1 sm:mt-2 text-center">
                    <div className="text-base sm:text-xl font-bold text-gray-900">
                      {frame.score}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <Link
          href="/dashboard/games"
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={!isGameComplete() || saving}
          className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Game'}
        </button>
      </div>
    </div>
  )
}

