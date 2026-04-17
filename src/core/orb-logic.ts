/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 *
 * This file is part of the Confluence Engine and is protected by 
 * intellectual property laws. Unauthorized copying or distribution 
 * is strictly prohibited.
 */

export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

export interface FibonacciLevels {
  level5: number;
  level4: number;
  level3: number;
  level2: number;
  level1: number; // High (1.0)
  level0: number; // Low (0.0)
  levelMinus1: number;
  levelMinus2: number;
  levelMinus3: number;
  levelMinus4: number;
  levelMinus5: number;
}

/**
 * Calculates the Opening Range Breakout (ORB) Fibonacci Extension levels.
 * Based on the previous day's first 30-minute candle (9:15 AM to 9:45 AM IST).
 * 
 * Mapping:
 * Fib 0.0 = Low of 30min candle
 * Fib 1.0 = High of 30min candle
 */
export function calculateORBLevels(data: OHLCV, tenDayATR: number = 100): FibonacciLevels | null {
  const { high, low } = data;
  const range = high - low;

  // Anomaly Scrubber: If range is > 400% of 10-day ATR, abort.
  if (range > tenDayATR * 4) {
    console.error(`[ANOMALY] 30m Range (${range}) exceeds 400% of ATR (${tenDayATR}). Aborting trade.`);
    return null;
  }

  return {
    level5: low + (5 * range),
    level4: low + (4 * range),
    level3: low + (3 * range),
    level2: low + (2 * range),
    level1: high,
    level0: low,
    levelMinus1: low - (1 * range),
    levelMinus2: low - (2 * range),
    levelMinus3: low - (3 * range),
    levelMinus4: low - (4 * range),
    levelMinus5: low - (5 * range),
  };
}
