/**
 * ROKI - SHARED TYPES (dashboard view of the brain)
 */

import type { PaperTrade, Market, StrategyInfo, StrategyId } from "./core/brain";
import type { Prediction, LevelRow } from "./core/engineRunner";

export type { PaperTrade, Market, Prediction, LevelRow };

export interface EngineView {
  lastRun: string | null;
  notes: string[];
  lastError: string | null;
  running: boolean;
  levels: LevelRow[];
  predictions: Prediction[];
  trades: PaperTrade[];
  brief: { text: string; at: string; model: string } | null;
  killSwitch: boolean;
  liveEnabled: boolean;
  envLive: boolean;
  brokerConfigured: boolean;
  claudeConfigured: boolean;
  claudeModel: string;
  store: "firestore" | "file";
  risk: { riskPerTradeInr: number; maxLiveTradesPerDay: number; dailyLossLimitInr: number; maxCapitalPerTradeInr: number; optionLots: number; maxPremiumPerTradeInr: number; optionBackstopPct: number };
  strategies: Record<StrategyId, StrategyInfo>;
  instruments: { name: string; market: Market; live: boolean }[];
}
