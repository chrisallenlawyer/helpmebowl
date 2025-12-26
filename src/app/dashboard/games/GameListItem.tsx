'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'

interface Game {
  id: string
  score: number
  date: string
  location_name: string | null
  location_address: string | null
  notes: string | null
  score_source: 'manual' | 'ocr'
}

export default function GameListItem({ game }: { game: Game }) {
  const router = useRouter()
  const supabase = createClient()
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true)
      return
    }

    setDeleting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('games')
        .delete()
        .eq('id', game.id)
        .eq('user_id', user.id)

      if (error) throw error

      router.refresh()
    } catch (error: any) {
      alert(`Failed to delete game: ${error.message}`)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <li>
      <div className="px-4 py-4 sm:px-6 hover:bg-gray-50">
        <div className="flex items-center justify-between">
          <Link
            href={`/dashboard/games/${game.id}`}
            className="flex-1 flex items-center"
          >
            <div className="flex items-center flex-1">
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
          </Link>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              {game.score_source === 'ocr' ? '📸 Photo' : '✍️ Manual'}
            </span>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setShowDeleteConfirm(false)
                  }}
                  className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-red-600 hover:text-red-900 px-2 py-1 font-medium disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Confirm'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 hover:text-red-900 p-1 disabled:opacity-50"
                title="Delete game"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
            <Link
              href={`/dashboard/games/${game.id}`}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className="h-5 w-5"
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
            </Link>
          </div>
        </div>
        {game.notes && (
          <div className="mt-2">
            <p className="text-sm text-gray-600">{game.notes}</p>
          </div>
        )}
      </div>
    </li>
  )
}

