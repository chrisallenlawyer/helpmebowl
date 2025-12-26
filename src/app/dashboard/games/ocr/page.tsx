'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createWorker } from 'tesseract.js'
import { getGameStateFromFrames, type Frame, type GameState } from '@/lib/bowling'

export const dynamic = 'force-dynamic'

interface DetectedBowler {
  name?: string
  frameScores: (number | null)[]
  totalScore: number | null
  confidence: number
}

export default function OCRPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [detectedBowlers, setDetectedBowlers] = useState<DetectedBowler[]>([])
  const [selectedBowlerIndex, setSelectedBowlerIndex] = useState<number | null>(null)
  const [extractedFrames, setExtractedFrames] = useState<Frame[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    location_name: '',
    location_address: '',
    notes: '',
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
      processImage(file)
    }
  }

  const handleCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (err) {
      setError('Unable to access camera. Please use file upload instead.')
    }
  }

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const video = videoRef.current
      
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0)
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            setImagePreview(url)
            processImage(blob)
            
            // Stop camera
            if (video.srcObject) {
              const tracks = (video.srcObject as MediaStream).getTracks()
              tracks.forEach(track => track.stop())
            }
            video.srcObject = null
          }
        })
      }
    }
  }

  const processImage = async (imageFile: File | Blob) => {
    setProcessing(true)
    setError(null)
    setDetectedBowlers([])
    setSelectedBowlerIndex(null)
    setExtractedFrames(null)

    try {
      const worker = await createWorker('eng')
      
      // Perform OCR
      const { data: { text, confidence } } = await worker.recognize(imageFile)
      await worker.terminate()

      // Parse the OCR text to find bowling scores
      const bowlers = parseBowlingScores(text)
      
      if (bowlers.length === 0) {
        setError('No bowling scores detected in the image. Please try again with a clearer photo.')
      } else {
        setDetectedBowlers(bowlers)
        // Auto-select if only one bowler
        if (bowlers.length === 1) {
          setSelectedBowlerIndex(0)
          extractFramesFromBowler(bowlers[0])
        }
      }
    } catch (err: any) {
      setError(`OCR processing failed: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const parseBowlingScores = (text: string): DetectedBowler[] => {
    const bowlers: DetectedBowler[] = []
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    
    // Try to find patterns that look like bowling scores
    // Common patterns: numbers in sequence (10 frames), totals at end
    
    // Look for sequences of numbers that could be frame scores
    const framePattern = /\b([0-9]{1,3})\b/g
    const numbers: number[] = []
    let match
    
    while ((match = framePattern.exec(text)) !== null) {
      const num = parseInt(match[1])
      if (num >= 0 && num <= 300) {
        numbers.push(num)
      }
    }

    // Try to identify bowler score sequences
    // A complete game should have around 10-11 numbers (10 frames + total)
    // Look for sequences of 10-12 numbers in a row
    for (let i = 0; i < numbers.length - 9; i++) {
      const sequence = numbers.slice(i, i + 11) // 10 frames + total
      const frames = sequence.slice(0, 10)
      const total = sequence[10] || null

      // Validate: frame scores should generally increase and total should match sum pattern
      if (frames.every(f => f >= 0 && f <= 300)) {
        // Check if this looks like a valid score sequence
        // Frame scores typically increase (cumulative) or are consistent ranges
        const isValid = frames.some(f => f > 0) && (!total || (total >= frames[frames.length - 1] && total <= 300))
        
        if (isValid) {
          bowlers.push({
            frameScores: frames,
            totalScore: total,
            confidence: 0.7, // Base confidence
          })
        }
      }
    }

    // If we didn't find good sequences, try finding individual frame-like numbers
    if (bowlers.length === 0) {
      // Look for potential frame scores (usually 2-3 digit numbers)
      const potentialFrames = numbers.filter(n => n >= 10 && n <= 300)
      if (potentialFrames.length >= 10) {
        // Take first 10 as frames, next as total
        bowlers.push({
          frameScores: potentialFrames.slice(0, 10),
          totalScore: potentialFrames[10] || null,
          confidence: 0.5,
        })
      }
    }

    return bowlers.length > 0 ? bowlers : [{
      frameScores: numbers.slice(0, 10).map(n => n || null),
      totalScore: numbers[10] || null,
      confidence: 0.3,
    }]
  }

  const extractFramesFromBowler = (bowler: DetectedBowler) => {
    // Convert detected frame scores to Frame objects
    // Since OCR gives us cumulative scores, we need to convert to individual frame scores
    const frames: Frame[] = Array(10).fill(null).map(() => ({
      firstRoll: null,
      secondRoll: null,
      thirdRoll: null,
      isStrike: false,
      isSpare: false,
      isOpen: false,
      score: null,
      frameScore: null,
    }))

    // Try to extract individual rolls from the frame scores
    // This is a simplified version - full implementation would parse the OCR text more carefully
    for (let i = 0; i < 10; i++) {
      if (bowler.frameScores[i] !== null) {
        frames[i].score = bowler.frameScores[i] as number
        // We'll need to infer frame data from cumulative scores
        // For now, set a placeholder
        frames[i].firstRoll = 0 // Placeholder - would need more sophisticated parsing
        frames[i].secondRoll = 0
      }
    }

    setExtractedFrames(frames)
  }

  const handleBowlerSelect = (index: number) => {
    setSelectedBowlerIndex(index)
    extractFramesFromBowler(detectedBowlers[index])
  }

  const handleSave = async () => {
    if (selectedBowlerIndex === null || !extractedFrames) {
      setError('Please select a bowler first')
      return
    }

    const bowler = detectedBowlers[selectedBowlerIndex!]
    if (!bowler.totalScore || bowler.totalScore === 0) {
      setError('Invalid score detected. Please verify the score.')
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

      // Upload photo to Supabase Storage
      let photoUrl = null
      if (imagePreview) {
        setUploadingPhoto(true)
        const response = await fetch(imagePreview)
        const blob = await response.blob()
        const fileExt = blob.type.split('/')[1] || 'jpg'
        const fileName = `${user.id}/${Date.now()}.${fileExt}`
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('score-photos')
          .upload(fileName, blob, {
            contentType: blob.type,
            upsert: false,
          })

        if (uploadError) {
          console.error('Photo upload error:', uploadError)
          // Continue without photo if upload fails
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('score-photos')
            .getPublicUrl(fileName)
          photoUrl = publicUrl
        }
        setUploadingPhoto(false)
      }

      // Convert extracted frames to game state
      const gameState = extractedFrames ? getGameStateFromFrames(extractedFrames) : null
      const finalScore = bowler.totalScore || (gameState?.[9]?.score || 0)

      // Save game to database
      const { error } = await supabase.from('games').insert({
        user_id: user.id,
        score: finalScore,
        date: formData.date,
        location_name: formData.location_name || null,
        location_address: formData.location_address || null,
        notes: formData.notes || null,
        score_source: 'ocr',
        score_photo_url: photoUrl,
        ocr_confidence: bowler.confidence,
        frame_scores: gameState ? gameState.map(f => ({
          first: f.firstRoll,
          second: f.secondRoll,
          third: f.thirdRoll,
          score: f.score,
        })) : null,
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
    <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/games"
          className="text-sm text-indigo-600 hover:text-indigo-900 mb-4 inline-block"
        >
          ← Back to games
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">OCR Score Recognition</h1>
        <p className="mt-1 text-sm text-gray-500">Take or upload a photo of your bowling score</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Image Upload/Camera Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        {!imagePreview ? (
          <div className="space-y-4">
            <div className="flex gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700"
              >
                Upload Photo
              </button>
              <button
                onClick={handleCameraCapture}
                className="flex-1 bg-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-700"
              >
                Take Photo
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            {videoRef.current?.srcObject && (
              <div className="space-y-2">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full rounded-lg"
                />
                <button
                  onClick={capturePhoto}
                  className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700"
                >
                  Capture Photo
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <img
              src={imagePreview}
              alt="Score preview"
              className="w-full rounded-lg border"
            />
            <button
              onClick={() => {
                setImagePreview(null)
                setDetectedBowlers([])
                setSelectedBowlerIndex(null)
                setExtractedFrames(null)
              }}
              className="w-full bg-gray-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-700"
            >
              Take Different Photo
            </button>
          </div>
        )}
      </div>

      {/* Processing Indicator */}
      {processing && (
        <div className="bg-blue-50 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          Processing image... This may take a moment.
        </div>
      )}

      {/* Bowler Selection */}
      {detectedBowlers.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Select Your Score ({detectedBowlers.length} {detectedBowlers.length === 1 ? 'bowler' : 'bowlers'} detected)
          </h2>
          <div className="space-y-3">
            {detectedBowlers.map((bowler, index) => (
              <button
                key={index}
                onClick={() => handleBowlerSelect(index)}
                className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                  selectedBowlerIndex === index
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-gray-900">
                      Bowler {index + 1}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Frames: {bowler.frameScores.filter(f => f !== null).length}/10
                    </div>
                    {bowler.totalScore && (
                      <div className="text-lg font-bold text-indigo-600 mt-2">
                        Total: {bowler.totalScore}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    Confidence: {Math.round(bowler.confidence * 100)}%
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Game Details Form */}
      {selectedBowlerIndex !== null && (
        <>
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Game Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ocr-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  id="ocr-date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
                />
              </div>
              <div>
                <label htmlFor="ocr-location_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Location Name
                </label>
                <input
                  type="text"
                  id="ocr-location_name"
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  placeholder="e.g., AMF Lanes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="ocr-location_address" className="block text-sm font-medium text-gray-700 mb-1">
                  Location Address
                </label>
                <input
                  type="text"
                  id="ocr-location_address"
                  value={formData.location_address}
                  onChange={(e) => setFormData({ ...formData, location_address: e.target.value })}
                  placeholder="e.g., 123 Main St, City, State"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="ocr-notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  id="ocr-notes"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add any additional notes about this game..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-black"
                />
              </div>
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
              disabled={saving || uploadingPhoto}
              className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadingPhoto ? 'Uploading photo...' : saving ? 'Saving...' : 'Save Game'}
            </button>
          </div>
        </>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

