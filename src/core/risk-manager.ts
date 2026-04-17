/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

/**
 * Risk Manager
 * Handles dynamic position sizing and drawdown protection.
 */
export class RiskManager {
  private maxDailyRisk: number = 5000; // Fixed ₹ risk per trade
  private niftyLotSize: number = 25; // Standard Nifty lot size

  /**
   * Calculates the dynamic lot size based on the 30-minute range.
   * Formula: Position Size = Max Risk / (Entry - Stop Loss)
   */
  public calculatePositionSize(entry: number, stopLoss: number): number {
    const riskPerUnit = Math.abs(entry - stopLoss);
    if (riskPerUnit === 0) return 0;

    const totalUnits = this.maxDailyRisk / riskPerUnit;
    const lots = Math.floor(totalUnits / this.niftyLotSize);

    // Ensure at least 1 lot if risk allows, but respect max risk
    return Math.max(0, lots);
  }

  public getMaxRisk(): number {
    return this.maxDailyRisk;
  }
}
