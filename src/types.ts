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

export interface Trade {
  time: string;
  symbol: string;
  type: "BUY" | "SELL";
  qty: number;
  price: number;
  status: string;
  pnl?: number;
}

export interface Lesson {
  index: number;
  timestamp: string;
  tradeId: string;
  outcome: "WIN" | "LOSS";
  reasonForLoss: string;
  agentCorrection: string;
  confidence: number;
  previousHash: string;
  hash: string;
}

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
  trades: Trade[];
  lessons: Lesson[];
  isSimulating: boolean;
  isBrokerConnected: boolean;
  isSafetyOn: boolean;
  brokerMode: "LIVE" | "PAPER_TRADING";
}
