/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import { AgentReport, BFSISectorReport, ApexSignal, EngineState, MarketStrategy } from "../types";
import { FibonacciLevels } from "./orb-logic";

/**
 * Synthesizer (Main Brain)
 * Coordinates agents, seed logic, and execution timing.
 */
export class Synthesizer {
  private reports: AgentReport[] = [];
  private lastHash: string = "0";

  /**
   * Evaluates the pre-market bias based on Apex Pods and Domestic Sector Reports.
   * Returns a score from -10 to +10.
   */
  public evaluatePreMarketBias(apexSignals: ApexSignal[], bfsiReport: BFSISectorReport | null): number {
    let score = 0;

    // Global Macro & Commodities (Apex Pods)
    apexSignals.forEach(signal => {
      score += signal.score;
    });

    // Domestic Sector (BFSI)
    if (bfsiReport) {
      const bfsiScore = bfsiReport.bias === "Bullish" ? 2 : bfsiReport.bias === "Bearish" ? -2 : 0;
      score += bfsiScore * (bfsiReport.conviction / 10);
    }

    // Clamp score between -10 and 10
    return Math.max(-10, Math.min(10, score));
  }

  /**
   * Calculates the consensus based on a weighted voting algorithm.
   * Quorum: 2/3 agents must agree on direction for BREAKOUT.
   */
  public calculateConsensus(reports: AgentReport[]): MarketStrategy {
    const bullishCount = reports.filter(r => r.bias === "Bullish").length;
    const bearishCount = reports.filter(r => r.bias === "Bearish").length;
    const neutralCount = reports.filter(r => r.bias === "Neutral").length;

    const total = reports.length;
    const quorum = (2 / 3) * total;

    if (bullishCount >= quorum || bearishCount >= quorum) {
      return "BREAKOUT";
    }

    if (neutralCount >= 1 || (bullishCount > 0 && bearishCount > 0)) {
      return "MEAN_REVERSION";
    }

    return "WAIT";
  }

  /**
   * Determines if the engine should be active based on IST time.
   */
  public getMarketStatus(date: Date): { isOpen: boolean; phase: string } {
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + istOffset);
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const timeInMinutes = hours * 60 + minutes;

    // 8:00 AM IST = 480 mins
    // 9:15 AM IST = 555 mins
    // 9:46 AM IST = 586 mins
    // 3:30 PM IST = 930 mins

    if (timeInMinutes < 480) return { isOpen: false, phase: "PRE_WAKE" };
    if (timeInMinutes < 555) return { isOpen: true, phase: "PRE_MARKET_POLLING" };
    if (timeInMinutes < 586) return { isOpen: true, phase: "ORB_FORMATION" };
    if (timeInMinutes < 930) return { isOpen: true, phase: "TRADING_ACTIVE" };
    
    return { isOpen: false, phase: "MARKET_CLOSED" };
  }
}
