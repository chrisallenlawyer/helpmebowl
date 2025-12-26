'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createWorker } from 'tesseract.js'
import { getGameStateFromFrames, calculateMaxScore, validateRoll, type Frame, type GameState } from '@/lib/bowling'

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
  const [editingFrames, setEditingFrames] = useState(false)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [maxScore, setMaxScore] = useState(300)
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
      
      // Perform OCR with detailed output including word positions
      const { data } = await worker.recognize(imageFile)
      await worker.terminate()

      // Parse the OCR data to find bowling scores using both text and structure
      const bowlers = parseBowlingScores(data.text, data.words || [])
      
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

  const parseBowlingScores = (text: string, words: any[]): DetectedBowler[] => {
    const bowlers: DetectedBowler[] = []
    
    // Strategy: Look for rows with names followed by frame numbers (1-10) and total
    // Structure: [Name] [Frame1] [Frame2] ... [Frame10] [Total]
    
    if (words && words.length > 0) {
      // Group words by Y position (rows)
      const rows: any[][] = []
      const yTolerance = 15 // pixels - words on same row
      
      words.forEach(word => {
        const wordY = word.bbox.y0
        let foundRow = false
        for (const row of rows) {
          if (row.length > 0) {
            const rowY = row[0].bbox.y0
            if (Math.abs(wordY - rowY) < yTolerance) {
              row.push(word)
              foundRow = true
              break
            }
          }
        }
        if (!foundRow) {
          rows.push([word])
        }
      })
      
      // Sort each row by X position (left to right)
      rows.forEach(row => {
        row.sort((a, b) => a.bbox.x0 - b.bbox.x0)
      })
      
      // Sort rows by Y position (top to bottom)
      rows.sort((a, b) => {
        if (a.length === 0 || b.length === 0) return 0
        return a[0].bbox.y0 - b[0].bbox.y0
      })
      
      // Look for rows that start with text (name) followed by 10+ numbers (frames + total)
      const candidateRows: any[][] = []
      
      rows.forEach(row => {
        // Check if row has text at the start (potential name) followed by numbers
        let hasTextStart = false
        let numberCount = 0
        
        for (let i = 0; i < Math.min(5, row.length); i++) {
          const word = row[i]
          const text = word.text.trim()
          // Check if it's mostly text (not just numbers)
          if (!/^\d+$/.test(text) && text.length > 0) {
            hasTextStart = true
            break
          }
        }
        
        // Count numbers in row
        row.forEach(word => {
          const num = parseInt(word.text.trim().replace(/[^\d]/g, ''))
          if (!isNaN(num) && num >= 0 && num <= 300) {
            numberCount++
          }
        })
        
        // Row should have name-like text at start and 10-12 numbers (frames + total)
        if (hasTextStart && numberCount >= 10 && numberCount <= 12) {
          candidateRows.push(row)
        }
      })
      
      // Process candidate rows (limit to max 3 bowlers)
      candidateRows.slice(0, 3).forEach(row => {
        // Extract numbers from the row (skip the name part)
        const numbers: number[] = []
        let startIndex = 0
        
        // Find where numbers start (skip name)
        for (let i = 0; i < row.length; i++) {
          const text = row[i].text.trim()
          const num = parseInt(text.replace(/[^\d]/g, ''))
          if (!isNaN(num) && num >= 0 && num <= 300) {
            startIndex = i
            break
          }
        }
        
        // Extract numbers
        for (let i = startIndex; i < row.length; i++) {
          const text = row[i].text.trim()
          const num = parseInt(text.replace(/[^\d]/g, ''))
          if (!isNaN(num) && num >= 0 && num <= 300) {
            numbers.push(num)
          }
        }
        
        if (numbers.length >= 10) {
          // Take first 10 as frame scores, last as total if there are 11+
          const frames = numbers.slice(0, 10)
          const total = numbers.length >= 11 ? numbers[numbers.length - 1] : null
          
          // Validate: frame scores should be cumulative (monotonically increasing)
          const isCumulative = frames.every((f, i) => i === 0 || f >= frames[i - 1])
          const hasValidRange = frames.every(f => f >= 0 && f <= 300)
          const finalScoreReasonable = !total || (total >= frames[9] && total <= 300)
          
          if (hasValidRange && isCumulative && finalScoreReasonable) {
            // Validate using bowling calculator if we have frame data
            // For now, we'll validate in the edit step
            bowlers.push({
              frameScores: frames,
              totalScore: total,
              confidence: 0.8,
            })
          }
        }
      })
    }
    
    // Fallback: text-based parsing
    if (bowlers.length === 0) {
      const lines = text.split('\n').filter(line => line.trim().length > 0)
      
      lines.forEach(line => {
        // Look for lines with text followed by 10+ numbers
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 11) {
          // Check if first part is text (name)
          const firstPart = parts[0]
          if (!/^\d+$/.test(firstPart)) {
            const numbers: number[] = []
            
            // Extract numbers (skip potential name)
            for (let i = 1; i < parts.length; i++) {
              const num = parseInt(parts[i].replace(/[^\d]/g, ''))
              if (!isNaN(num) && num >= 0 && num <= 300) {
                numbers.push(num)
              }
            }
            
            if (numbers.length >= 10) {
              const frames = numbers.slice(0, 10)
              const total = numbers.length >= 11 ? numbers[numbers.length - 1] : null
              
              const isCumulative = frames.every((f, i) => i === 0 || f >= frames[i - 1])
              
              if (isCumulative) {
                bowlers.push({
                  frameScores: frames,
                  totalScore: total,
                  confidence: 0.7,
                })
              }
            }
          }
        }
      })
    }

    return bowlers.slice(0, 3) // Limit to 3 bowlers max
  }

  const extractFramesFromBowler = (bowler: DetectedBowler) => {
    // Extract cumulative scores and create Frame objects
    // Convert detected cumulative frame scores to Frame objects
    // OCR typically gives us cumulative scores: [frame1_total, frame2_total, ..., frame10_total]
    // We store the cumulative score, and calculate individual frame contributions where possible
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

    // Store cumulative scores
    for (let i = 0; i < 10; i++) {
      if (bowler.frameScores[i] !== null) {
        const cumulativeScore = bowler.frameScores[i] as number
        const previousScore = i > 0 && bowler.frameScores[i - 1] !== null 
          ? bowler.frameScores[i - 1] as number 
          : 0
        
        // Calculate this frame's contribution (points added this frame)
        const framePoints = cumulativeScore - previousScore
        
        // Store cumulative score
        frames[i].score = cumulativeScore
        frames[i].frameScore = framePoints
        
        // Try to infer frame type and rolls based on points added
        // Note: This is an approximation - we can't know exact rolls from cumulative alone
        if (framePoints >= 30) {
          // Perfect frame - strike with two strikes following
          frames[i].firstRoll = 10
          frames[i].isStrike = true
        } else if (framePoints >= 20 && framePoints < 30) {
          // Strike with bonus (20-29 points)
          frames[i].firstRoll = 10
          frames[i].isStrike = true
        } else if (framePoints === 10 && i < 9) {
          // Could be spare or open frame - default to spare
          frames[i].firstRoll = 5 // Estimate
          frames[i].secondRoll = 5
          frames[i].isSpare = true
        } else if (framePoints < 10) {
          // Open frame
          frames[i].firstRoll = Math.max(0, Math.floor(framePoints / 2))
          frames[i].secondRoll = Math.max(0, framePoints - (frames[i].firstRoll || 0))
          frames[i].isOpen = true
        } else {
          // Edge case - set as open frame
          frames[i].firstRoll = Math.max(0, Math.floor(framePoints / 2))
          frames[i].secondRoll = Math.max(0, framePoints - (frames[i].firstRoll || 0))
          frames[i].isOpen = true
        }
      }
    }

    // The main thing we preserve is the cumulative scores
    // Individual roll data is approximate, but cumulative scores are accurate
    setExtractedFrames(frames)
  }

  const handleBowlerSelect = (index: number) => {
    setSelectedBowlerIndex(index)
    extractFramesFromBowler(detectedBowlers[index])
    setEditingFrames(false)
  }

  // Update gameState when extractedFrames changes
  useEffect(() => {
    if (extractedFrames) {
      const newGameState = getGameStateFromFrames(extractedFrames)
      setGameState(newGameState)
      
      // Find first incomplete frame
      let incompleteFrame = 10
      for (let i = 0; i < 10; i++) {
        const frame = newGameState[i]
        if (frame.firstRoll === null) {
          incompleteFrame = i
          break
        }
      }
      setCurrentFrame(incompleteFrame)
      setMaxScore(calculateMaxScore(newGameState, incompleteFrame))
    }
  }, [extractedFrames])

  const handleRollChange = (
    frameIndex: number,
    rollNumber: 1 | 2 | 3,
    value: string
  ) => {
    if (!extractedFrames) return

    let numValue: number | null = null

    if (value === '') {
      numValue = null
    } else if (value === 'X') {
      numValue = 10
    } else if (value === '/') {
      if (rollNumber === 2 && extractedFrames[frameIndex].firstRoll !== null) {
        numValue = 10 - extractedFrames[frameIndex].firstRoll!
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

    setExtractedFrames(prevFrames => {
      if (!prevFrames) return prevFrames
      const newFrames = [...prevFrames]
      const frame = { ...newFrames[frameIndex] }
      
      if (rollNumber === 1) {
        frame.firstRoll = numValue
        if (numValue === 10 && frameIndex < 9) {
          frame.secondRoll = null
        }
      } else if (rollNumber === 2) {
        if (frame.firstRoll === null) return prevFrames
        if (numValue !== null && !validateRoll(numValue, frameIndex, 2, frame.firstRoll)) {
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
    if (!gameState) return 0
    const lastScoredFrame = gameState
      .slice()
      .reverse()
      .find(f => f.score !== null)
    return lastScoredFrame?.score || 0
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

      // Use current gameState if available, otherwise calculate from extracted frames
      const finalGameState = gameState || (extractedFrames ? getGameStateFromFrames(extractedFrames) : null)
      const finalScore = finalGameState?.[9]?.score || bowler.totalScore || 0

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
        frame_scores: finalGameState ? finalGameState.map(f => ({
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

      {/* Extracted Score Display and Edit */}
      {selectedBowlerIndex !== null && extractedFrames && gameState && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Detected Score</h2>
              <p className="text-sm text-gray-500">Review and edit if needed</p>
            </div>
            <button
              onClick={() => setEditingFrames(!editingFrames)}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              {editingFrames ? 'Done Editing' : 'Edit Frames'}
            </button>
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
              </div>
            </div>
          </div>

          {/* Frames Grid */}
          {editingFrames ? (
            <div className="bg-gray-50 rounded-lg p-4 sm:p-6 mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 sm:gap-4">
                {extractedFrames.map((frame, frameIndex) => {
                  const isCurrent = frameIndex === currentFrame
                  return (
                    <div
                      key={frameIndex}
                      className={`border-2 rounded-lg p-2 sm:p-4 ${
                        isCurrent
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-gray-200 bg-white'
                      }`}
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
                              className="w-full text-center text-black font-bold text-base sm:text-lg px-2 py-1.5 sm:py-2 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                                  className="w-full text-center text-black font-bold text-base sm:text-lg px-2 py-1.5 sm:py-2 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                                  className="w-full text-center text-black font-bold text-base sm:text-lg px-2 py-1.5 sm:py-2 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                                className="w-full text-center text-black font-bold text-base sm:text-lg px-2 py-1.5 sm:py-2 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                              className={`w-full text-center text-black font-bold text-base sm:text-lg px-2 py-1.5 sm:py-2 border rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
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
                                className={`w-full text-center text-black font-bold text-base sm:text-lg px-2 py-1.5 sm:py-2 border rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
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

                      {gameState[frameIndex]?.score !== null && (
                        <div className="mt-1 sm:mt-2 text-center">
                          <div className="text-base sm:text-xl font-bold text-gray-900">
                            {gameState[frameIndex].score}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
                {gameState.map((frame, index) => (
                  <div key={index} className="border border-gray-300 rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-600 mb-1">Frame {index + 1}</div>
                    <div className="text-lg font-bold text-gray-900">
                      {frame.score !== null ? frame.score : '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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

