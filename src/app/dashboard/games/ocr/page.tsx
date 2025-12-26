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
  individualBalls?: Array<{ first: number | 'X' | null; second: number | '/' | null; third?: number | 'X' | '/' | null }>
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
    
    // Track which ball results lines have been used to avoid matching the same line to multiple bowlers
    const usedBallResultsLineIndices = new Set<number>()
    
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
      console.log(`Processing cumulative score line at index ${lineIndex}:`, scores)
      
      // Try to find bowler name from previous lines (before the ball results row)
      let bowlerName: string | undefined = undefined
      for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 5); i--) {
        const prevLine = lines[i].trim()
        console.log(`  Checking line ${i} for name: "${prevLine}"`)
        // Look for lines that look like names (letters, maybe some numbers for lane/pin)
        if (/^[A-Z][A-Z\s]+$/i.test(prevLine.replace(/[^A-Z\s]/gi, '')) && prevLine.replace(/[^A-Z]/gi, '').length > 2 && prevLine.length < 30) {
          bowlerName = prevLine.split(/\s+/)[0].replace(/[^A-Z]/gi, '') // Take first word as name
          if (bowlerName && bowlerName.length > 1) {
            console.log(`  Found bowler name: ${bowlerName}`)
            break
          }
        }
      }
      
      // Look for the individual ball results row (the line immediately before cumulative totals)
      // This should contain X, /, and numbers representing individual balls
      // Skip name lines (mostly letters) and look for lines with bowling score characters
      // Search up to 6 lines back to find the ball results line
      // Also check if the ball results might be split across multiple lines
      let ballResultsLine: string | null = null
      let ballResultsLineIndex: number | null = null
      
      // First, try to find a single line with bowling score characters
      for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 7); i--) {
        // Skip if this line has already been used for another bowler
        if (usedBallResultsLineIndices.has(i)) {
          console.log(`  Skipping line ${i} (already used for another bowler)`)
          continue
        }
        
        const candidateLine = lines[i].trim()
        console.log(`  Checking line ${i} for ball results: "${candidateLine}"`)
        // Skip lines that are mostly letters (names) or are very short
        const letterCount = (candidateLine.match(/[A-Za-z]/g) || []).length
        const digitCount = (candidateLine.match(/\d/g) || []).length
        const hasStrikeOrSpare = /[Xx\/]/.test(candidateLine)
        
        // If it has bowling characters (X, /, digits) and not mostly letters, it's likely the ball results
        // Look for longer lines that contain multiple bowling score patterns (likely the full ball results)
        // Prefer lines with more bowling characters (X, /, digits) and fewer letters
        const bowlingCharCount = (candidateLine.match(/[Xx\/\d-]/g) || []).length
        const isLikelyBallResults = (hasStrikeOrSpare || digitCount > 3) && 
                                    letterCount < candidateLine.length * 0.5 && 
                                    candidateLine.length >= 5 &&
                                    bowlingCharCount >= 5 // At least 5 bowling-related characters
        
        if (isLikelyBallResults) {
          // Check if there are more lines above that might be part of the same ball results
          // Sometimes OCR splits the ball results across multiple lines
          // We'll collect lines going backwards until we hit something that doesn't look like ball results
          const collectedLines: Array<{ index: number; line: string }> = []
          collectedLines.push({ index: i, line: candidateLine })
          usedBallResultsLineIndices.add(i)
          
          // Try to combine with previous lines if they also look like ball results
          // Look back up to 5 lines to find the complete ball results sequence
          for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
            if (usedBallResultsLineIndices.has(j)) break
            
            const prevLine = lines[j].trim()
            if (prevLine.length === 0) continue
            
            const prevLetterCount = (prevLine.match(/[A-Za-z]/g) || []).length
            const prevDigitCount = (prevLine.match(/\d/g) || []).length
            const prevHasStrikeOrSpare = /[Xx\/]/.test(prevLine)
            const prevHasDash = /[-—]/.test(prevLine)
            const prevBowlingCharCount = (prevLine.match(/[Xx\/\d-]/g) || []).length
            
            // Check if it's likely a name - skip those
            const looksLikeName = /^[A-Z][A-Z\s]+$/i.test(prevLine.replace(/[^A-Z\s]/gi, '')) && 
                                 prevLine.replace(/[^A-Z]/gi, '').length > 2 && 
                                 prevLine.length < 30
            
            // Check if it's likely a cumulative score line (just numbers, usually 2-3 digit scores)
            // Cumulative scores are typically just numbers without bowling symbols
            const looksLikeCumulativeScore = !prevHasStrikeOrSpare && !prevHasDash &&
                                            /^\d+(\s+\d+)*$/.test(prevLine) &&
                                            prevDigitCount >= 2 &&
                                            prevLetterCount === 0
            
            // Only combine if it looks like ball results (has X, /, or - which are bowling-specific)
            // Don't combine cumulative score lines or names
            const looksLikeBallResults = (prevHasStrikeOrSpare || prevHasDash) && 
                                        prevLetterCount < prevLine.length * 0.4
            
            if (looksLikeBallResults && !looksLikeName && !looksLikeCumulativeScore) {
              collectedLines.unshift({ index: j, line: prevLine }) // Add to beginning
              usedBallResultsLineIndices.add(j)
              console.log(`    Combining line ${j}: "${prevLine}"`)
            } else {
              // If we hit something that doesn't look like ball results, stop
              if (looksLikeCumulativeScore) {
                console.log(`    Stopping at line ${j} (looks like cumulative score): "${prevLine}"`)
              }
              break
            }
          }
          
          // Combine all collected lines
          ballResultsLine = collectedLines.map(l => l.line).join(' ')
          ballResultsLineIndex = collectedLines[0].index
          console.log(`  Found ball results line for ${bowlerName || 'unknown'} (combined from ${collectedLines.length} lines, starting at ${ballResultsLineIndex}): "${ballResultsLine}"`)
          break
        }
      }
      
      if (!ballResultsLine) {
        console.log(`  No ball results line found for ${bowlerName || 'unknown'}`)
      }
      
      // Parse individual ball results if available
      let individualBalls: Array<{ first: number | 'X' | null; second: number | '/' | null; third?: number | 'X' | '/' | null }> = []
      
      if (ballResultsLine) {
        console.log(`Parsing ball results line for bowler: "${ballResultsLine}"`)
        
        // More flexible token extraction - handle various formats
        // Match: X (strike), numbers, / (spare), - (miss/gutter)
        // Examples: "X 9/ 8- X 7/ 9-" or "X9/8-X7/9-" or "X  9/  8-  X" or "X818119" or "8/8-8-7/9/8/719-9/ X81"
        let tokens: string[] = []
        
        // First, try to split by common separators (spaces, slashes, dashes)
        let workingLine = ballResultsLine.trim().toUpperCase()
        
        // Replace common patterns first: handle spares like "9/" or "7/"
        // Also handle patterns like "8/8-8-7/9/8/719-9/" where numbers and slashes are concatenated
        // Add spaces around slashes and dashes to help with tokenization
        workingLine = workingLine.replace(/(\d+)\//g, ' $1/ ') // "8/" becomes " 8/ "
        workingLine = workingLine.replace(/(\d+)-/g, ' $1- ') // "8-" becomes " 8- "
        workingLine = workingLine.replace(/X(\d)/g, 'X $1') // "X8" becomes "X 8"
        workingLine = workingLine.replace(/(\d)X/g, '$1 X') // "8X" becomes "8 X"
        
        // Split by whitespace and filter empty
        let initialTokens = workingLine.split(/\s+/).filter(t => t.length > 0)
        
        // Now process each token - if it contains concatenated digits, try to split intelligently
        for (const token of initialTokens) {
          if (token === 'X' || token === '/' || token === '-' || token === '—') {
            tokens.push(token)
          } else if (token.includes('/')) {
            // Spare pattern like "9/" or "81/" - extract the number and the slash
            const spareMatch = token.match(/^(\d+)\/$/)
            if (spareMatch) {
              tokens.push(spareMatch[1])
              tokens.push('/')
            } else {
              tokens.push(token)
            }
          } else if (/^\d+$/.test(token)) {
            // It's all digits - need to split intelligently
            // For bowling, we need pairs: first ball (0-10), second ball (0-10)
            // But if we see a number > 10, it might be two numbers concatenated
            const num = parseInt(token)
            if (num <= 10) {
              // Single digit or two-digit number <= 10, push as is
              tokens.push(token)
            } else {
              // Multiple digits concatenated - split into individual digits
              // For bowling, each digit typically represents a single ball (0-9 pins)
              // We'll split them all individually and let the frame parser handle pairing
              const digits = token.split('')
              tokens.push(...digits)
            }
          } else {
            // Try to extract X, digits, /, - from mixed token
            const mixedPattern = /([Xx]|\d+|[/-])/g
            const mixedMatches = token.match(mixedPattern)
            if (mixedMatches) {
              tokens.push(...mixedMatches.map(m => m.toUpperCase()))
            } else {
              tokens.push(token)
            }
          }
        }
        
        console.log(`Extracted tokens:`, tokens)
        
        // Try to match tokens to frames
        let tokenIndex = 0
        for (let frame = 0; frame < 10 && tokenIndex < tokens.length; frame++) {
            const token = tokens[tokenIndex]
            
            if (token === 'X') {
              // Strike
              individualBalls.push({ first: 'X', second: null })
              tokenIndex++
            } else {
              // Check if token contains a spare (e.g., "9/", "7/")
              const spareMatch = token.match(/^(\d+)\/$/)
              if (spareMatch) {
                // Spare: first ball + "/"
                const firstNum = parseInt(spareMatch[1])
                if (firstNum >= 0 && firstNum <= 9) {
                  individualBalls.push({ first: firstNum, second: '/' })
                  tokenIndex++
                } else {
                  tokenIndex++
                  individualBalls.push({ first: null, second: null })
                }
              } else {
                // Try to parse as first ball number
                const firstNum = parseInt(token.replace(/[^\d]/g, ''))
                if (!isNaN(firstNum) && firstNum >= 0 && firstNum <= 10) {
                  tokenIndex++
                  
                  // Check next token for second ball
                  if (tokenIndex < tokens.length) {
                    const nextToken = tokens[tokenIndex]
                    
                    if (nextToken === '/') {
                      // Spare
                      individualBalls.push({ first: firstNum, second: '/' })
                      tokenIndex++
                    } else if (nextToken === '-' || nextToken === '—') {
                      // Gutter ball (second ball is 0)
                      individualBalls.push({ first: firstNum, second: 0 })
                      tokenIndex++
                    } else {
                      const secondNum = parseInt(nextToken.replace(/[^\d]/g, ''))
                      if (!isNaN(secondNum) && secondNum >= 0 && secondNum <= 10) {
                        // Open frame with two numbers
                        individualBalls.push({ first: firstNum, second: secondNum })
                        tokenIndex++
                      } else {
                        // Only first ball found
                        individualBalls.push({ first: firstNum, second: null })
                      }
                    }
                  } else {
                    // Only first ball found
                    individualBalls.push({ first: firstNum, second: null })
                  }
                } else {
                  // Skip invalid token
                  tokenIndex++
                  individualBalls.push({ first: null, second: null })
                }
              }
            }
            
            // Handle 10th frame third roll if it's a strike or spare
            if (frame === 9 && (individualBalls[9]?.first === 'X' || individualBalls[9]?.second === '/')) {
              if (tokenIndex < tokens.length) {
                const thirdToken = tokens[tokenIndex]
                if (thirdToken === 'X') {
                  individualBalls[9].third = 'X'
                  tokenIndex++
                } else {
                  const thirdNum = parseInt(thirdToken.replace(/[^\d]/g, ''))
                  if (!isNaN(thirdNum) && thirdNum >= 0 && thirdNum <= 10) {
                    individualBalls[9].third = thirdNum
                    tokenIndex++
                  } else if (thirdToken === '/') {
                    individualBalls[9].third = '/'
                    tokenIndex++
                  }
                }
              }
            }
          }
          
        console.log(`Parsed individual balls:`, individualBalls)
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

    // Helper function to infer rolls from cumulative scores
    // Work forwards, using the actual scoring rules to determine what rolls must have been
    const inferRollsFromCumulative = () => {
      console.log('inferRollsFromCumulative called for bowler:', bowler.name, 'frameScores:', bowler.frameScores)
      
      // Calculate points added each frame (handle OCR errors where cumulative decreases)
      const framePoints: number[] = []
      for (let i = 0; i < 10; i++) {
        if (bowler.frameScores[i] !== null) {
          const cumulativeScore = bowler.frameScores[i] as number
          const previousScore = i > 0 && bowler.frameScores[i - 1] !== null 
            ? bowler.frameScores[i - 1] as number 
            : 0
          const points = cumulativeScore - previousScore
          
          // If points are negative or suspiciously high, use a heuristic
          // (OCR error - cumulative score went down, which shouldn't happen)
          if (points < 0 || points > 30) {
            // Use the cumulative score directly as an estimate, or skip
            // For now, treat negative as 0 and cap at 30
            framePoints[i] = Math.max(0, Math.min(30, points < 0 ? 0 : points))
          } else {
            framePoints[i] = points
          }
        } else {
          framePoints[i] = 0
        }
      }
      
      console.log('Calculated framePoints:', framePoints)

      // Work forwards frame by frame, using actual bowling scoring rules
      // We need to distinguish between strikes and spares by looking ahead
      for (let i = 0; i < 9; i++) {
        const points = framePoints[i]
        
        // Skip if points are 0 or invalid
        if (points <= 0) {
          continue
        }
        
        // In bowling, frame points are:
        // - Strike: 10 + next two rolls (10-30 total)
        // - Spare: 10 + next one roll (10-20 total)
        // - Open: sum of two rolls (0-9 total)
        
        if (points >= 20) {
          // Must be a strike (10 + bonus of at least 10 from next two rolls)
          frames[i].firstRoll = 10
          frames[i].isStrike = true
        } else if (points > 10 && points < 20) {
          // Could be strike (10 + bonus from next two rolls) or spare (10 + next one roll)
          // Look at next frame to help decide
          const nextFramePoints = i + 1 < 10 ? framePoints[i + 1] : 0
          const bonus = points - 10
          
          // If next frame is open (points < 10), check if bonus matches next frame's first roll
          // This would indicate a spare (10 + next first roll)
          // Example: this frame = 18 (spare 10 + next first roll 8), next frame = 8 (8+0 open frame)
          if (nextFramePoints > 0 && nextFramePoints < 10) {
            // Next frame is open
            // Try to estimate what the next frame's first roll might be
            // For an open frame, first roll is typically > 0 and < 10
            // If bonus matches a reasonable first roll value, it's likely a spare
            const estimatedNextFirstRoll = Math.ceil(nextFramePoints * 0.6) // Estimate first roll
            
            // If bonus is close to the estimated first roll or matches the open frame total,
            // it's more likely a spare than a strike
            if (bonus >= 1 && bonus <= 9 && (Math.abs(bonus - estimatedNextFirstRoll) <= 2 || bonus === nextFramePoints)) {
              // Likely a spare - bonus matches next frame's first roll
              // Estimate first roll for this frame (must be < 10 to leave pins for spare)
              const firstRoll = bonus // Use bonus as first roll estimate
              frames[i].firstRoll = firstRoll
              frames[i].secondRoll = 10 - firstRoll // Complete the spare
              frames[i].isSpare = true
            } else {
              // More likely a strike with bonus
              frames[i].firstRoll = 10
              frames[i].isStrike = true
            }
          } else {
            // Next frame is not open or doesn't exist, default to strike
            frames[i].firstRoll = 10
            frames[i].isStrike = true
          }
        } else if (points === 10) {
          // Could be spare or strike with 0+0 bonus (rare)
          // Default to spare (more common)
          frames[i].firstRoll = 5
          frames[i].secondRoll = 5
          frames[i].isSpare = true
        } else if (points < 10 && points > 0) {
          // Open frame - split pins (try to make it reasonable)
          // Prefer first roll to be slightly higher than second for better UX
          const firstRoll = Math.max(0, Math.min(9, Math.ceil(points * 0.55)))
          const secondRoll = Math.max(0, points - firstRoll)
          frames[i].firstRoll = firstRoll
          frames[i].secondRoll = secondRoll
          frames[i].isOpen = true
        }
      }

      // Handle frame 10 separately
      const frame10Points = framePoints[9]
      if (frame10Points > 0) {
        if (frame10Points >= 20) {
          // Strike or spare with bonus (third roll)
          frames[9].firstRoll = 10
          frames[9].isStrike = true
          const remaining = frame10Points - 10
          if (remaining >= 10) {
            frames[9].secondRoll = 10
            frames[9].thirdRoll = Math.max(0, remaining - 10)
          } else {
            const secondRoll = Math.floor(remaining / 2)
            frames[9].secondRoll = secondRoll
            frames[9].thirdRoll = remaining - secondRoll
          }
        } else if (frame10Points >= 10 && frame10Points < 20) {
          if (frame10Points === 10) {
            // Spare
            frames[9].firstRoll = 5
            frames[9].secondRoll = 5
            frames[9].isSpare = true
            frames[9].thirdRoll = 0
          } else {
            // Strike with bonus
            frames[9].firstRoll = 10
            frames[9].isStrike = true
            const remaining = frame10Points - 10
            frames[9].secondRoll = Math.floor(remaining / 2)
            frames[9].thirdRoll = remaining - (frames[9].secondRoll || 0)
          }
        } else if (frame10Points < 10) {
          // Open frame
          const firstRoll = Math.max(0, Math.min(9, Math.ceil(frame10Points * 0.6)))
          frames[9].firstRoll = firstRoll
          frames[9].secondRoll = frame10Points - firstRoll
          frames[9].isOpen = true
        }
      }
    }

    // Process all 10 frames - always set cumulative scores from bowler.frameScores
    for (let i = 0; i < 10; i++) {
      // Set cumulative score for this frame
      if (bowler.frameScores[i] !== null) {
        const cumulativeScore = bowler.frameScores[i] as number
        const previousScore = i > 0 && bowler.frameScores[i - 1] !== null 
          ? bowler.frameScores[i - 1] as number 
          : 0
        
        frames[i].score = cumulativeScore
        frames[i].frameScore = cumulativeScore - previousScore
      }
    }

    // If we have individual ball data from OCR and it's complete, use it
    // Otherwise, infer from cumulative scores
    const hasCompleteIndividualBalls = bowler.individualBalls && bowler.individualBalls.length >= 10 &&
      bowler.individualBalls.every(ball => ball.first !== null)
    
    console.log('hasCompleteIndividualBalls:', hasCompleteIndividualBalls, 'individualBalls:', bowler.individualBalls)
    
    if (hasCompleteIndividualBalls) {
      // Use OCR individual ball data
      for (let i = 0; i < 10 && i < bowler.individualBalls!.length; i++) {
        const ball = bowler.individualBalls![i]
        
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
          
          // Handle 10th frame third roll
          if (i === 9 && ball.third !== null && ball.third !== undefined) {
            if (ball.third === 'X') {
              frames[i].thirdRoll = 10
            } else if (ball.third === '/') {
              frames[i].thirdRoll = 10 - (frames[i].secondRoll || 0)
            } else {
              frames[i].thirdRoll = ball.third as number
            }
          }
        }
      }
    } else {
      // Infer rolls from cumulative scores
      console.log('Calling inferRollsFromCumulative because individual balls are not complete')
      inferRollsFromCumulative()
      console.log('After inferRollsFromCumulative, frames:', frames.map(f => ({ first: f.firstRoll, second: f.secondRoll, third: f.thirdRoll })))
    }
    
    console.log('Final frames before setExtractedFrames:', frames.map((f, i) => ({
      frame: i + 1,
      firstRoll: f.firstRoll,
      secondRoll: f.secondRoll,
      thirdRoll: f.thirdRoll,
      score: f.score,
      isStrike: f.isStrike,
      isSpare: f.isSpare,
      isOpen: f.isOpen
    })))
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

