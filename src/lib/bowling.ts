/**
 * Bowling score calculation utilities
 */

export interface Frame {
  firstRoll: number | null
  secondRoll: number | null
  thirdRoll?: number | null // Only for frame 10
  isStrike: boolean
  isSpare: boolean
  isOpen: boolean
  score: number | null // Cumulative score up to this frame
  frameScore: number | null // Points just for this frame (without bonuses)
}

export type GameState = Frame[]

/**
 * Calculate the maximum possible score from the current game state
 * Assumes all remaining frames are strikes
 */
export function calculateMaxScore(gameState: GameState, currentFrame: number): number {
  // Find the last completed frame's score
  let baseScore = 0
  for (let i = 0; i < currentFrame; i++) {
    if (gameState[i] && gameState[i].score !== null) {
      baseScore = gameState[i].score || 0
    }
  }

  // If we're in frame 10, calculate based on what's already there
  if (currentFrame === 9) {
    const frame10 = gameState[9]
    if (frame10.score !== null) {
      // Frame 10 is complete
      return frame10.score
    } else if (frame10.isStrike && frame10.secondRoll !== null && frame10.thirdRoll !== null && frame10.thirdRoll !== undefined) {
      // Frame 10 strike complete
      return baseScore + 10 + frame10.secondRoll + frame10.thirdRoll
    } else if (frame10.isStrike && frame10.secondRoll !== null) {
      // Strike + one bonus roll, assume max on third (strike = 10)
      return baseScore + 10 + frame10.secondRoll + 10
    } else if (frame10.isStrike) {
      // Just strike, assume max on both bonuses (strike + strike = 20)
      return baseScore + 30
    } else if (frame10.isSpare && frame10.thirdRoll !== null && frame10.thirdRoll !== undefined) {
      // Frame 10 spare complete
      return baseScore + 10 + frame10.thirdRoll
    } else if (frame10.isSpare) {
      // Spare with one bonus roll, assume max (strike = 10)
      return baseScore + 20
    } else if (frame10.firstRoll !== null && frame10.secondRoll !== null) {
      // Open frame 10: score is already complete
      return baseScore + frame10.firstRoll + frame10.secondRoll
    } else if (frame10.firstRoll !== null) {
      // One roll in frame 10: can spare (10 total) and get strike bonus (10) = 20
      return baseScore + (10 - frame10.firstRoll) + frame10.firstRoll + 10
    } else {
      // No rolls yet: can get 30 (strike + strike + strike)
      return baseScore + 30
    }
  }

  // For frames 1-9, calculate max assuming all remaining are strikes
  // Each strike frame (1-9) adds 30 points (10 + next 2 strikes)
  // Frame 10 can add up to 30 points (strike + strike + strike)
  
  const framesRemaining = 10 - currentFrame
  
  if (framesRemaining === 0) {
    return baseScore
  }

  // Each complete strike frame (1-9) is worth 30 points
  // Frame 10 is also worth 30 if all strikes
  const maxAdditional = framesRemaining * 30

  return baseScore + maxAdditional
}

/**
 * Calculate the score for a frame, given the next frames for bonus calculation
 */
export function calculateFrameScore(
  frame: Frame,
  nextFrames: Frame[],
  frameIndex: number
): { frameScore: number; cumulativeScore: number; previousCumulative: number } {
  let framePoints = 0
  let previousCumulative = 0

  // Get previous cumulative score
  if (frameIndex > 0) {
    // Look for the previous frame in the game state
    // Since we're calculating backwards, previous frame would be at frameIndex - 1
    // But we need to get it from the full game state, so we'll calculate it differently
    // For now, we'll get it from nextFrames if available (frames before current)
    // Actually, nextFrames are frames AFTER current, so we need to track previous differently
    // Let's get previous cumulative from the frame before us in the original array
    // This will be handled in getGameStateFromFrames by calculating in order
  }

  // Frame 10 special handling
  if (frameIndex === 9) {
    if (frame.firstRoll !== null && frame.secondRoll !== null && frame.thirdRoll !== null) {
      // Frame 10 complete
      if (frame.isStrike) {
        framePoints = 10 + (frame.secondRoll || 0) + (frame.thirdRoll ?? 0)
      } else if (frame.isSpare) {
        framePoints = 10 + (frame.thirdRoll ?? 0)
      } else {
        framePoints = (frame.firstRoll || 0) + (frame.secondRoll || 0)
      }
    } else if (frame.firstRoll !== null && frame.secondRoll !== null && frame.isOpen) {
      // Frame 10 open frame (no third roll)
      framePoints = (frame.firstRoll || 0) + (frame.secondRoll || 0)
    }
    // If frame 10 is incomplete, don't calculate yet
  } else {
    // Frames 1-9
    if (frame.isStrike) {
      framePoints = 10
      // Add next two rolls as bonus
      let rollsCollected = 0
      let bonusTotal = 0

      // Collect the next 2 rolls from subsequent frames
      for (const nextFrame of nextFrames) {
        if (rollsCollected >= 2) break

        if (nextFrame.firstRoll !== null) {
          bonusTotal += nextFrame.firstRoll
          rollsCollected++

          if (rollsCollected >= 2) break

          // If it was a strike, we need one more roll from the next frame
          if (nextFrame.isStrike && rollsCollected < 2) {
            // Find the next frame after this one
            const nextFrameIndex = nextFrames.indexOf(nextFrame)
            const frameAfterNext = nextFrames[nextFrameIndex + 1]
            if (frameAfterNext && frameAfterNext.firstRoll !== null) {
              bonusTotal += frameAfterNext.firstRoll
              rollsCollected++
            } else if (frameAfterNext && frameAfterNext.secondRoll !== null && !frameAfterNext.isStrike) {
              // If next frame is not a strike, use its second roll
              bonusTotal += frameAfterNext.secondRoll
              rollsCollected++
            }
            break
          } else if (nextFrame.secondRoll !== null) {
            // Not a strike, use the second roll
            bonusTotal += nextFrame.secondRoll
            rollsCollected++
          }
        }
      }
      framePoints += bonusTotal
    } else if (frame.isSpare) {
      framePoints = 10
      // Add next roll as bonus
      if (nextFrames.length > 0 && nextFrames[0].firstRoll !== null) {
        framePoints += nextFrames[0].firstRoll
      }
    } else if (frame.isOpen && frame.firstRoll !== null && frame.secondRoll !== null) {
      // Open frame: just the pins knocked down
      framePoints = frame.firstRoll + frame.secondRoll
    }
  }

  return {
    frameScore: framePoints,
    cumulativeScore: previousCumulative + framePoints,
    previousCumulative,
  }
}

/**
 * Validate a roll (0-10 pins, or must be valid for second roll)
 */
export function validateRoll(
  roll: number,
  frameIndex: number,
  rollNumber: number,
  previousRoll: number | null
): boolean {
  if (roll < 0 || roll > 10) return false

  if (rollNumber === 1) {
    return true // First roll can be 0-10
  }

  // Second roll
  if (previousRoll === null) return false

  // In frame 10, you can exceed 10 on second roll if first was a strike
  if (frameIndex === 9 && previousRoll === 10) {
    return roll >= 0 && roll <= 10 // Can be another strike (10) or 0-9
  }

  // For frames 1-9, second roll can't exceed remaining pins
  // For frame 10, if first roll wasn't a strike, second roll can't exceed remaining pins
  if (frameIndex === 9 && previousRoll < 10) {
    return roll >= 0 && roll <= (10 - previousRoll)
  }

  if (frameIndex < 9) {
    return roll >= 0 && roll <= (10 - previousRoll)
  }

  return true
}

/**
 * Get the current game state from frame scores
 * Calculates scores in order (frame 1 to frame 10)
 */
export function getGameStateFromFrames(frames: Frame[]): GameState {
  const gameState: GameState = Array(10).fill(null).map(() => ({
    firstRoll: null,
    secondRoll: null,
    thirdRoll: null,
    isStrike: false,
    isSpare: false,
    isOpen: false,
    score: null,
    frameScore: null,
  }))

  // Copy frame data
  frames.forEach((frame, index) => {
    gameState[index] = { ...frame }
  })

  // First, determine frame types (strike, spare, open)
  for (let i = 0; i < 10; i++) {
    const frame = gameState[i]
    if (!frame) continue

    if (frame.firstRoll !== null) {
      if (frame.firstRoll === 10 && i < 9) {
        // Strike in frames 1-9
        frame.isStrike = true
        frame.isSpare = false
        frame.isOpen = false
      } else if (i === 9 && frame.firstRoll === 10) {
        // Strike in frame 10
        frame.isStrike = true
        frame.isSpare = false
        frame.isOpen = false
      } else if (frame.secondRoll !== null) {
        if (frame.firstRoll + frame.secondRoll === 10) {
          frame.isStrike = false
          frame.isSpare = true
          frame.isOpen = false
        } else {
          frame.isStrike = false
          frame.isSpare = false
          frame.isOpen = true
        }
      }
    }
  }

  // Calculate scores from frame 1 to frame 10 (forward)
  // We need to iterate multiple times because strikes depend on later frames
  // Keep recalculating until no more scores can be calculated
  let changed = true
  while (changed) {
    changed = false

    for (let i = 0; i < 10; i++) {
      const frame = gameState[i]
      if (!frame) continue

      const nextFrames = gameState.slice(i + 1)

      // Skip if already calculated (unless a later frame changed)
      if (frame.score !== null) {
        continue
      }

      // Check if frame is complete enough to calculate score
      let canCalculateScore = false

      if (i === 9) {
        // Frame 10
        if (frame.isStrike && frame.secondRoll !== null && frame.thirdRoll !== null) {
          canCalculateScore = true
        } else if (frame.isSpare && frame.thirdRoll !== null) {
          canCalculateScore = true
        } else if (frame.isOpen && frame.firstRoll !== null && frame.secondRoll !== null) {
          canCalculateScore = true
        }
      } else {
        // Frames 1-9
        if (frame.isStrike) {
          // For a strike, we need the next 2 rolls to calculate
          let rollsAvailable = 0
          for (let j = 0; j < nextFrames.length && rollsAvailable < 2; j++) {
            const nextFrame = nextFrames[j]
            if (nextFrame.firstRoll !== null) {
              rollsAvailable++
              if (rollsAvailable >= 2) break
              
              if (nextFrame.isStrike) {
                // Next frame is also a strike, need one more roll
                if (j + 1 < nextFrames.length) {
                  // There's another frame after this one
                  const frameAfter = nextFrames[j + 1]
                  if (frameAfter.firstRoll !== null) {
                    rollsAvailable++
                  }
                } else if (i === 8) {
                  // Special case: Frame 9 strike, Frame 10 strike
                  // Need Frame 10's second roll
                  if (nextFrame.secondRoll !== null) {
                    rollsAvailable++
                  }
                }
                break
              } else if (nextFrame.secondRoll !== null) {
                rollsAvailable++
              }
            }
          }
          canCalculateScore = rollsAvailable >= 2
        } else if (frame.isSpare) {
          // For a spare, we need the next roll
          if (nextFrames.length > 0 && nextFrames[0].firstRoll !== null) {
            canCalculateScore = true
          }
        } else if (frame.isOpen && frame.firstRoll !== null && frame.secondRoll !== null) {
          // Open frame is complete when both rolls are entered
          canCalculateScore = true
        }
      }

      if (canCalculateScore) {
        let frameScore = 0

        if (i === 9) {
          // Frame 10 scoring
          if (frame.isStrike) {
            frameScore = 10 + (frame.secondRoll || 0) + (frame.thirdRoll ?? 0)
          } else if (frame.isSpare) {
            frameScore = 10 + (frame.thirdRoll ?? 0)
          } else {
            frameScore = (frame.firstRoll || 0) + (frame.secondRoll || 0)
          }
        } else {
          // Frames 1-9 scoring
          if (frame.isStrike) {
            frameScore = 10
            // Add next 2 rolls as bonus
            let rollsCollected = 0
            for (let j = 0; j < nextFrames.length && rollsCollected < 2; j++) {
              const nextFrame = nextFrames[j]
              if (nextFrame.firstRoll !== null) {
                frameScore += nextFrame.firstRoll
                rollsCollected++
                if (rollsCollected >= 2) break
                
                if (nextFrame.isStrike) {
                  // Next frame is also a strike, need one more roll
                  if (j + 1 < nextFrames.length) {
                    // There's another frame after this one
                    const frameAfterNext = nextFrames[j + 1]
                    if (frameAfterNext.firstRoll !== null) {
                      frameScore += frameAfterNext.firstRoll
                      rollsCollected++
                    }
                  } else if (i === 8) {
                    // Special case: Frame 9 strike, Frame 10 strike
                    // Need Frame 10's second roll
                    if (nextFrame.secondRoll !== null) {
                      frameScore += nextFrame.secondRoll
                      rollsCollected++
                    }
                  }
                  break
                } else if (nextFrame.secondRoll !== null) {
                  // Not a strike, use the second roll
                  frameScore += nextFrame.secondRoll
                  rollsCollected++
                }
              }
            }
          } else if (frame.isSpare) {
            frameScore = 10
            // Add next roll
            if (nextFrames.length > 0 && nextFrames[0].firstRoll !== null) {
              frameScore += nextFrames[0].firstRoll
            }
          } else if (frame.isOpen) {
            frameScore = (frame.firstRoll || 0) + (frame.secondRoll || 0)
          }
        }

        // Find the previous frame's cumulative score
        let prevCumulative = 0
        if (i > 0) {
          for (let k = i - 1; k >= 0; k--) {
            if (gameState[k].score !== null) {
              prevCumulative = gameState[k].score || 0
              break
            }
          }
        }

        frame.frameScore = frameScore
        frame.score = prevCumulative + frameScore
        changed = true
      }
    }
  }

  return gameState
}

