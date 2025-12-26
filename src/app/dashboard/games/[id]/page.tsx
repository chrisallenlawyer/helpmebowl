'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

export default function GameDetailPage() {
  const router = useRouter()
  const params = useParams()
  const gameId = params.id as string
  const supabase = createClient()
  
  const [game, setGame] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    date: '',
    location_name: '',
    location_address: '',
    notes: '',
  })

  useEffect(() => {
    loadGame()
  }, [gameId])

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
      })
    } catch (error: any) {
      setError(error.message || 'Failed to load game')
    } finally {
      setLoading(false)
    }
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

      const { error } = await supabase
        .from('games')
        .update({
          date: formData.date,
          location_name: formData.location_name || null,
          location_address: formData.location_address || null,
          notes: formData.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId)
        .eq('user_id', user.id)

      if (error) throw error

      setEditing(false)
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

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto">
        <div className="text-center py-12">Loading...</div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto">
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

  return (
    <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto">
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
          </div>
          {!editing && (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Edit
              </button>
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

      <div className="bg-white shadow rounded-lg p-6">
        {editing ? (
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
                  setFormData({
                    date: game.date.split('T')[0],
                    location_name: game.location_name || '',
                    location_address: game.location_address || '',
                    notes: game.notes || '',
                  })
                  setError(null)
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
        ) : (
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
        )}
      </div>
    </div>
  )
}

