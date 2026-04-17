/**
 * CONFLUENCE ENGINE - SHARED TYPES
 */

export interface AgentReport {
  agentId: string;
  bias: "Bullish" | "Bearish" | "Neutral";
  intensity: number;
  reasoning: string;
  keyLevels?: number[];
}

export interface ApexSignal {
  pod: string;
  signal: "Risk-On" | "Risk-Off" | "Neutral" | "Bearish" | "Bullish";
  score: number; // -5 to +5
  reasoning: string;
}

export interface BFSISectorReport {
  sector: "BFSI";
  bias: "Bullish" | "Bearish" | "Neutral";
  conviction: number;
  volatilityScore: number;
  reasoning: string;
  keyLevels?: number[];
  triggerFibLogic: boolean;
}

export interface LogEntry {
  time: string;
  msg: string;
  type: "system" | "agent" | "market" | "success" | "error";
}

export type MarketStrategy = "BREAKOUT" | "MEAN_REVERSION" | "WAIT";

export interface EngineState {
  currentTime: string;
  isMarketOpen: boolean;
  phase: string;
  agentReports: AgentReport[];
  bfsiReport: BFSISectorReport | null;
  apexSignals: ApexSignal[];
  marketBiasScore: number; // -10 to +10
  consensus: MarketStrategy;
  fibLevels: any; // Using any for simplicity in types, but kept as FibonacciLevels in core
  lastHash: string;
  logs: LogEntry[];
  isSimulating: boolean;
  isBrokerConnected: boolean;
  isSafetyOn: boolean;
  brokerMode: "LIVE" | "PAPER_TRADING";
}
