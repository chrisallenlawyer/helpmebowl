'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getGameStateFromFrames, calculateMaxScore, validateRoll, type Frame, type GameState } from '@/lib/bowling'

export const dynamic = 'force-dynamic'

interface DetectedBowler {
  name?: string
  frameScores: (number | null)[]
  totalScore: number | null
  confidence: number
  individualBalls?: Array<{ first: number | 'X' | null; second: number | '/' | null }>
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
      let ocrText = ''
      let ocrWords: any[] = []
      let allNumbers: number[] = []

      // Use Google Vision API (server-side, more accurate)
      const formData = new FormData()
      
      // Convert image to File if it's a string (data URL)
      if (typeof imageFile === 'string') {
        const response = await fetch(imageFile)
        const blob = await response.blob()
        formData.append('image', blob, 'image.jpg')
      } else {
        formData.append('image', imageFile)
      }

      const ocrResponse = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      })

      if (!ocrResponse.ok) {
        const errorData = await ocrResponse.json()
        if (errorData.error === 'Google Vision API key not configured' || errorData.requiresSetup) {
          throw new Error('Google Vision API is not configured. Please set up the API key in Vercel environment variables. See GOOGLE_VISION_SETUP.md for instructions.')
        } else {
          throw new Error(errorData.error || 'OCR API failed')
        }
      }

      const ocrData = await ocrResponse.json()
      ocrText = ocrData.text || ''
      ocrWords = ocrData.words || []
      
      console.log('Google Vision OCR successful')
      
      // Parse bowling scores from OCR text
      const bowlers = parseBowlingScores(ocrText, ocrWords)
      if (bowlers.length > 0) {
        setDetectedBowlers(bowlers)
        console.log('Auto-detected bowlers:', bowlers)
      } else {
        // If no bowlers detected, show an error
        setError('No bowling scores detected. Please ensure the image clearly shows the score sheet with frame scores.')
      }
    } catch (err: any) {
      setError(`OCR processing failed: ${err.message}. Please try manual entry.`)
    } finally {
      setProcessing(false)
    }
  }

  const parseBowlingScores = (text: string, words: any[]): DetectedBowler[] => {
    const bowlers: DetectedBowler[] = []
    
    // Look for pairs of lines: individual balls (top) + cumulative totals (bottom)
    // This is the most reliable pattern for bowling score sheets
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    
    // First, identify lines with exactly 10 cumulative scores (bottom rows)
    const cumulativeScoreLines: Array<{ lineIndex: number; scores: number[]; line: string }> = []
    
    lines.forEach((line, lineIndex) => {
      // Extract all numbers from the line
      const numbers: number[] = []
      const numberPattern = /\b(\d{1,3})\b/g
      let match
      
      while ((match = numberPattern.exec(line)) !== null) {
        const num = parseInt(match[1])
        if (num >= 0 && num <= 300) {
          numbers.push(num)
        }
      }
      
      // If we found exactly 10 numbers that are cumulative (increasing or mostly increasing), this is likely the cumulative totals row
      if (numbers.length === 10) {
        const isCumulative = numbers.every((f, i) => i === 0 || f >= numbers[i - 1])
        // Also allow for small decreases (OCR errors)
        const mostlyCumulative = numbers.filter((f, i) => i === 0 || f >= numbers[i - 1] - 5).length >= 8
        
        if (isCumulative || mostlyCumulative) {
          cumulativeScoreLines.push({
            lineIndex,
            scores: numbers,
            line: line.trim()
          })
        }
      }
    })
    
    // For each cumulative score line, look for the individual ball results row above it
    cumulativeScoreLines.forEach(({ lineIndex, scores }) => {
      // Try to find bowler name from previous lines (before the ball results row)
      let bowlerName: string | undefined = undefined
      for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 5); i--) {
        const prevLine = lines[i].trim()
        // Look for lines that look like names (letters, maybe some numbers for lane/pin)
        if (/^[A-Z][A-Z\s]+$/i.test(prevLine.replace(/[^A-Z\s]/gi, '')) && prevLine.replace(/[^A-Z]/gi, '').length > 2 && prevLine.length < 30) {
          bowlerName = prevLine.split(/\s+/)[0].replace(/[^A-Z]/gi, '') // Take first word as name
          if (bowlerName && bowlerName.length > 1) {
            break
          }
        }
      }
      
      // Look for the individual ball results row (the line immediately before cumulative totals)
      // This should contain X, /, and numbers representing individual balls
      const ballResultsLine = lineIndex > 0 ? lines[lineIndex - 1].trim() : null
      
      // Parse individual ball results if available
      let individualBalls: Array<{ first: number | 'X' | null; second: number | '/' | null; third?: number | 'X' | '/' | null }> = []
      
      if (ballResultsLine) {
        // Extract tokens: X for strikes, / for spares, numbers for pins
        const tokens = ballResultsLine.split(/\s+/).filter(t => t.trim().length > 0)
        
        // Try to match tokens to frames
        let tokenIndex = 0
        for (let frame = 0; frame < 10 && tokenIndex < tokens.length; frame++) {
          const token = tokens[tokenIndex].toUpperCase()
          
          if (token === 'X' || token === 'x') {
            // Strike
            individualBalls.push({ first: 'X', second: null })
            tokenIndex++
          } else {
            // First ball
            const firstNum = parseInt(token.replace(/[^\d]/g, ''))
            if (!isNaN(firstNum) && firstNum >= 0 && firstNum <= 10) {
              tokenIndex++
              if (tokenIndex < tokens.length) {
                const secondToken = tokens[tokenIndex].toUpperCase()
                if (secondToken === '/') {
                  // Spare
                  individualBalls.push({ first: firstNum, second: '/' })
                  tokenIndex++
                } else {
                  const secondNum = parseInt(secondToken.replace(/[^\d]/g, ''))
                  if (!isNaN(secondNum) && secondNum >= 0 && secondNum <= 10) {
                    // Open frame
                    individualBalls.push({ first: firstNum, second: secondNum })
                    tokenIndex++
                  } else {
                    // Only first ball found
                    individualBalls.push({ first: firstNum, second: null })
                  }
                }
              } else {
                individualBalls.push({ first: firstNum, second: null })
              }
            } else {
              // Skip invalid token
              tokenIndex++
              individualBalls.push({ first: null, second: null })
            }
          }
        }
      }
      
      // Avoid duplicates
      const isDuplicate = bowlers.some(b => 
        b.frameScores.length === scores.length &&
        b.frameScores.every((f, i) => f === scores[i])
      )
      
      if (!isDuplicate) {
        bowlers.push({
          name: bowlerName,
          frameScores: scores,
          totalScore: scores[9], // Last cumulative score is the total
          confidence: 0.95, // Very high confidence for this pattern
          individualBalls: individualBalls.length > 0 ? individualBalls : undefined, // Store individual balls if found
        })
        console.log(`Found bowler: ${bowlerName || 'Unknown'}, cumulative:`, scores, 'individual balls:', individualBalls)
      }
    })
    
    console.log('Final bowlers detected:', bowlers.length, bowlers.map(b => ({ name: b.name, frames: b.frameScores, total: b.totalScore, conf: b.confidence.toFixed(2) })))
    return bowlers.slice(0, 2) // Limit to 2 bowlers max
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

    // If we have individual ball data from OCR, use it directly (more accurate)
    if (bowler.individualBalls && bowler.individualBalls.length > 0) {
      for (let i = 0; i < 10 && i < bowler.individualBalls.length; i++) {
        const ball = bowler.individualBalls[i]
        const cumulativeScore = bowler.frameScores[i] !== null ? bowler.frameScores[i] as number : null
        
        if (ball.first === 'X') {
          frames[i].firstRoll = 10
          frames[i].isStrike = true
        } else if (ball.first !== null) {
          frames[i].firstRoll = ball.first as number
          
          if (ball.second === '/') {
            frames[i].secondRoll = 10 - (ball.first as number)
            frames[i].isSpare = true
          } else if (ball.second !== null) {
            frames[i].secondRoll = ball.second as number
            if ((ball.first as number) + (ball.second as number) < 10) {
              frames[i].isOpen = true
            }
          }
        }
        
        // Store cumulative score if available
        if (cumulativeScore !== null) {
          frames[i].score = cumulativeScore
          const previousScore = i > 0 && bowler.frameScores[i - 1] !== null 
            ? bowler.frameScores[i - 1] as number 
            : 0
          frames[i].frameScore = cumulativeScore - previousScore
        }
      }
    } else {
      // Fallback: Infer from cumulative scores (less accurate)
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
    }
    
    setExtractedFrames(frames)
  }

  const handleBowlerSelect = (index: number) => {
    setSelectedBowlerIndex(index)
    extractFramesFromBowler(detectedBowlers[index])
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
    if (selectedBowlerIndex === null || !extractedFrames || !gameState) {
      setError('Please complete the score entry first')
      return
    }

    const finalScore = gameState[9]?.score || detectedBowlers[selectedBowlerIndex!]?.totalScore
    if (!finalScore || finalScore === 0) {
      setError('Invalid score. Please verify the score.')
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
      const finalScore = finalGameState?.[9]?.score || detectedBowlers[selectedBowlerIndex]?.totalScore || 0

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
        ocr_confidence: detectedBowlers[selectedBowlerIndex!]?.confidence || 0.5,
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
            Select Your Name ({detectedBowlers.length} {detectedBowlers.length === 1 ? 'bowler' : 'bowlers'} detected)
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
                      {bowler.name || `Bowler ${index + 1}`}
                    </div>
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
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Frame-by-Frame Score</h2>
            <p className="text-sm text-gray-500">Review and edit individual frames as needed</p>
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

          {/* Frames Grid - Always editable */}
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

