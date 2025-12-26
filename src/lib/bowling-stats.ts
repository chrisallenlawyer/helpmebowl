/**
 * Bowling statistics utilities
 */

import { Frame } from './bowling'

/**
 * Calculate the number of strikes in a game from frame scores
 */
export function calculateStrikes(frameScores: Frame[] | null | undefined): number {
  if (!frameScores || !Array.isArray(frameScores)) return 0
  
  let strikes = 0
  for (let i = 0; i < 10; i++) {
    const frame = frameScores[i]
    if (frame && frame.isStrike) {
      strikes++
    }
  }
  
  return strikes
}

/**
 * Calculate the number of spares in a game from frame scores
 */
export function calculateSpares(frameScores: Frame[] | null | undefined): number {
  if (!frameScores || !Array.isArray(frameScores)) return 0
  
  let spares = 0
  for (let i = 0; i < 10; i++) {
    const frame = frameScores[i]
    if (frame && frame.isSpare) {
      spares++
    }
  }
  
  return spares
}

