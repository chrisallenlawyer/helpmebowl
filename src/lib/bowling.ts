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
  const completedFrames = gameState.slice(0, currentFrame).filter(f => f.score !== null)
  if (completedFrames.length === 0) return 300

  const lastCompletedFrame = completedFrames[completedFrames.length - 1]
  const baseScore = lastCompletedFrame.score || 0
  const framesRemaining = 10 - currentFrame

  // If we're in frame 10, calculate based on what's already there
  if (currentFrame === 9) {
    const frame10 = gameState[9]
    if (frame10.isStrike) {
      // Strike in frame 10: can get up to 30 more points (strike + strike)
      return baseScore + 30
    } else if (frame10.isSpare) {
      // Spare in frame 10: can get up to 20 more points (spare + strike)
      return baseScore + 20
    } else if (frame10.firstRoll !== null && frame10.secondRoll !== null) {
      // Open frame 10: score is already complete
      return baseScore
    } else if (frame10.firstRoll !== null) {
      // One roll in frame 10: can spare and get strike bonus = 20
      const pinsDown = 10 - frame10.firstRoll
      return baseScore + frame10.firstRoll + pinsDown + 10
    } else {
      // No rolls yet: can get 30 (strike + strike + strike)
      return baseScore + 30
    }
  }

  // For frames 1-9, calculate max assuming all remaining are strikes
  // Each strike after frame 1 adds 30 points (10 + next 2 balls)
  // In frame 10, a strike gives 10 + next 2 balls (max 30 total for frame 10)
  
  let maxAdditional = 0
  const framesToCalculate = framesRemaining

  if (framesToCalculate > 0) {
    // Each complete strike frame adds 30 points
    // The last frame (frame 10) can add up to 30 points
    maxAdditional = (framesToCalculate - 1) * 30 + 30
  }

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
  if (frameIndex > 0 && nextFrames.length > 0) {
    const prevFrame = nextFrames[0]
    previousCumulative = prevFrame.score || 0
  }

  if (frame.isStrike) {
    framePoints = 10
    // Add next two rolls as bonus
    let bonusRolls = 0
    let rollsNeeded = 2

    for (let i = 0; i < nextFrames.length && rollsNeeded > 0; i++) {
      const nextFrame = nextFrames[i]
      if (!nextFrame) continue
      
      if (nextFrame.firstRoll !== null) {
        bonusRolls += nextFrame.firstRoll
        rollsNeeded--
        if (nextFrame.isStrike && rollsNeeded > 0) {
          // If it's a strike, we still need one more roll
          // Check if there's a frame after this one
          const nextNextFrame = i + 1 < nextFrames.length ? nextFrames[i + 1] : null
          if (nextNextFrame && nextNextFrame.firstRoll !== null) {
            bonusRolls += nextNextFrame.firstRoll
            rollsNeeded--
          } else if (frameIndex === 8 && nextFrame.isStrike && nextFrame.secondRoll !== null) {
            // Special case: frame 9 strike, frame 10 strike, need frame 10 second roll
            bonusRolls += nextFrame.secondRoll
            rollsNeeded--
          }
        } else if (rollsNeeded > 0 && nextFrame.secondRoll !== null) {
          bonusRolls += nextFrame.secondRoll
          rollsNeeded--
        }
      }
    }
    framePoints += bonusRolls
  } else if (frame.isSpare) {
    framePoints = 10
    // Add next roll as bonus
    if (nextFrames.length > 0 && nextFrames[0].firstRoll !== null) {
      framePoints += nextFrames[0].firstRoll
    }
  } else if (frame.isOpen) {
    // Open frame: just the pins knocked down
    framePoints = (frame.firstRoll || 0) + (frame.secondRoll || 0)
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

  frames.forEach((frame, index) => {
    gameState[index] = { ...frame }
  })

  // Calculate scores from the end backwards (frame 10 to frame 1)
  for (let i = 9; i >= 0; i--) {
    const frame = gameState[i]
    if (!frame) continue
    
    const nextFrames = gameState.slice(i + 1)

    if (frame.firstRoll !== null) {
      if (frame.firstRoll === 10) {
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

      // Calculate score if frame is complete enough
      if (frame.isStrike || frame.isSpare || (frame.isOpen && frame.secondRoll !== null)) {
        // For frame 10, need to check if it's complete
        if (i === 9) {
          if (frame.isStrike && frame.secondRoll !== null && frame.thirdRoll !== null) {
            // Strike in frame 10 with both bonus rolls
            const result = calculateFrameScore(frame, [], i)
            frame.frameScore = result.frameScore
            frame.score = result.cumulativeScore
          } else if (frame.isSpare && frame.thirdRoll !== null) {
            // Spare in frame 10 with bonus roll
            const result = calculateFrameScore(frame, [], i)
            frame.frameScore = result.frameScore
            frame.score = result.cumulativeScore
          } else if (frame.isOpen && frame.secondRoll !== null) {
            // Open frame 10 (no bonus roll needed)
            const result = calculateFrameScore(frame, [], i)
            frame.frameScore = result.frameScore
            frame.score = result.cumulativeScore
          }
        } else {
          // Frames 1-9
          if (frame.isStrike || frame.isSpare || frame.isOpen) {
            const result = calculateFrameScore(frame, nextFrames, i)
            frame.frameScore = result.frameScore
            frame.score = result.cumulativeScore
          }
        }
      }
    }
  }

  return gameState
}

