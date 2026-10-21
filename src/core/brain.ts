/**
 * CONFLUENCE ENGINE - THE BRAIN
 *
 * Rule-based signals and probability model, ported from the tested research
 * engine (Market Prediction Ledger). Pure functions only: no network, no I/O,
 * so the same code can be backtested and run live.
 *
 * Every rule here was tested on 5 years of daily data (2021-2026) with costs,
 * chosen on 2021-24 and judged on 2024-26. See the "findings" table in the
 * ledger for the evidence. Rules that failed (breakout of the opening range,
 * weekly Fibonacci grid, following the predicted close side) are not here.
 */

export type Market = "IN index" | "IN stock" | "US index" | "US stock" | "commodity" | "crypto";

export interface DailyBar {
  date: string; // YYYY-MM-DD in the exchange's own time zone
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface IntradayBar {
  t: number; // bar start, epoch milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export type StrategyId = "GAPFADE" | "GAPFADE30" | "XFADE" | "XFADE_SKIPDAY" | "BIGGAP" | "BREAKOUT";

export interface StrategyInfo {
  description: string;
  activeMarkets: Market[]; // everywhere else the rule runs as a shadow (logged, never traded)
}

export const STRATEGIES: Record<StrategyId, StrategyInfo> = {
  GAPFADE: {
    description: "Open more than 0.5 ADR away from yesterday's close: trade back toward yesterday's close. Target = yesterday's close; exit at session close; 1 ADR safety stop.",
    activeMarkets: ["IN index", "US stock"],
  },
  GAPFADE30: {
    description: "Same as GAPFADE but enter 30 minutes after the open (entry-timing test).",
    activeMarkets: [],
  },
  XFADE: {
    description: "Yesterday closed in its top 10% (sell at the open) or bottom 10% (buy at the open); exit at session close; 1 ADR safety stop.",
    activeMarkets: ["IN index", "IN stock", "crypto"],
  },
  XFADE_SKIPDAY: {
    description: "XFADE signal on a skip day (quiet market, small previous day, Friday or Sunday). Logged only, to keep checking that skipping helps.",
    activeMarkets: [],
  },
  BIGGAP: {
    description: "Gap above 0.75 ADR in the direction of the 50-day trend, market not quiet: fade it at the open; exit at session close; 1 ADR safety stop.",
    activeMarkets: ["US stock"],
  },
  BREAKOUT: {
    description: "Price crosses yesterday's high (buy) or low (sell) from the open's side: go with it; exit at session close; 1 ADR safety stop. Chosen on 2021-24, confirmed on 2024-26 and on 2 years of hourly bars: works in crypto only (stock markets fade breakouts).",
    activeMarkets: ["crypto"],
  },
};

export interface SessionContext {
  date: string;
  pdo: number;
  pdh: number;
  pdl: number;
  pdc: number;
  adr: number; // 10-day average daily range of completed sessions before this one
  clv: number; // where yesterday closed inside its range (0 = low, 1 = high)
  ma50: number;
  vol: number; // ADR / 60-day average range: < 0.8 quiet, > 1.2 wild
  prevRangeRatio: number; // yesterday's range / ADR of the 10 days before it
  weekday: number; // 0 = Sunday ... 6 = Saturday, for the session date
}

export interface Signal {
  strategy: StrategyId;
  mode: "active" | "shadow";
  side: 1 | -1; // 1 = BUY, -1 = SELL
  entryDelayBars: number; // 0 = at the open; 6 = 30 minutes later on 5-minute bars
  target: number | null;
  stopDistance: number; // in price units (1 ADR)
  trigger?: number | null; // enter only when price crosses this level (BREAKOUT)
  reason: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Context for `date`, built only from sessions completed before it. */
export function buildContext(history: DailyBar[], date: string): SessionContext | null {
  const prev = history.filter((b) => b.date < date);
  if (prev.length < 61) return null;
  const y = prev[prev.length - 1];
  const ranges = prev.map((b) => b.high - b.low);
  const adr = mean(ranges.slice(-10));
  const adrBeforeY = mean(ranges.slice(-11, -1));
  const range60 = mean(ranges.slice(-60));
  const yr = y.high - y.low;
  return {
    date,
    pdo: y.open,
    pdh: y.high,
    pdl: y.low,
    pdc: y.close,
    adr,
    clv: yr > 0 ? (y.close - y.low) / yr : 0.5,
    ma50: mean(prev.slice(-50).map((b) => b.close)),
    vol: adr / range60,
    prevRangeRatio: yr / adrBeforeY,
    weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
  };
}

const modeFor = (strategy: StrategyId, market: Market): "active" | "shadow" =>
  STRATEGIES[strategy].activeMarkets.includes(market) ? "active" : "shadow";

/** Signals for a session once its opening price is known. */
export function signalsAtOpen(market: Market, ctx: SessionContext, open: number): Signal[] {
  const out: Signal[] = [];
  const gap = (open - ctx.pdc) / ctx.adr; // signed gap in ADR
  const trendUp = ctx.pdc > ctx.ma50;

  if (market !== "crypto" && Math.abs(gap) > 0.5) {
    const side: 1 | -1 = gap > 0 ? -1 : 1;
    out.push({ strategy: "GAPFADE", mode: modeFor("GAPFADE", market), side, entryDelayBars: 0, target: ctx.pdc, stopDistance: ctx.adr,
      reason: `Gap ${gap.toFixed(2)} ADR; fade back toward yesterday's close ${ctx.pdc.toFixed(2)}` });
    out.push({ strategy: "GAPFADE30", mode: "shadow", side, entryDelayBars: 6, target: ctx.pdc, stopDistance: ctx.adr,
      reason: "Entry-timing test: same gap fade, 30 minutes after the open" });
    if (Math.abs(gap) > 0.75 && ctx.vol >= 0.8 && (gap > 0) === trendUp) {
      out.push({ strategy: "BIGGAP", mode: modeFor("BIGGAP", market), side, entryDelayBars: 0, target: null, stopDistance: ctx.adr,
        reason: `Big gap ${gap.toFixed(2)} ADR in the 50-day trend's direction, volatility ${ctx.vol.toFixed(2)}` });
    }
  }

  // BREAKOUT: wait for price to cross yesterday's high/low from the open's side
  if (open < ctx.pdh) out.push({ strategy: "BREAKOUT", mode: modeFor("BREAKOUT", market), side: 1, entryDelayBars: 0, target: null, stopDistance: ctx.adr, trigger: ctx.pdh,
    reason: `Buy if price crosses yesterday's high ${ctx.pdh.toFixed(2)}` });
  if (open > ctx.pdl) out.push({ strategy: "BREAKOUT", mode: modeFor("BREAKOUT", market), side: -1, entryDelayBars: 0, target: null, stopDistance: ctx.adr, trigger: ctx.pdl,
    reason: `Sell if price crosses yesterday's low ${ctx.pdl.toFixed(2)}` });

  if (ctx.clv > 0.9 || ctx.clv < 0.1) {
    const side: 1 | -1 = ctx.clv > 0.9 ? -1 : 1;
    const skipReasons: string[] = [];
    if (ctx.vol < 0.8) skipReasons.push("quiet market");
    if (ctx.prevRangeRatio < 0.6) skipReasons.push("small previous day");
    if (ctx.weekday === 5) skipReasons.push("Friday");
    if (ctx.weekday === 0) skipReasons.push("Sunday");
    const skip = skipReasons.length > 0;
    out.push({
      strategy: skip ? "XFADE_SKIPDAY" : "XFADE",
      mode: skip ? "shadow" : modeFor("XFADE", market),
      side, entryDelayBars: 0, target: null, stopDistance: ctx.adr,
      reason: `Yesterday closed at ${(ctx.clv * 100).toFixed(0)}% of its range` + (skip ? `; skip day (${skipReasons.join(", ")})` : ""),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Probability model: walk-forward distance tables
// ---------------------------------------------------------------------------

const BINS = {
  clv: [-0.01, 0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1.01],
  dLevel: [-9, 0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1.1, 9],
  gap: [0, 0.05, 0.1, 0.15, 0.25, 0.35, 0.5, 0.75, 1, 9],
  dC: [-9, -1, -0.6, -0.4, -0.25, -0.12, 0, 0.12, 0.25, 0.4, 0.6, 1, 9],
};

interface Row { clv: number; dH: number; dL: number; g: number; dC: number; E1: boolean; E2: boolean; E3: boolean; E4: boolean }

function historyRows(history: DailyBar[]): Row[] {
  const rows: Row[] = [];
  for (let i = 11; i < history.length; i++) {
    const p = history[i - 1], b = history[i];
    const adr = mean(history.slice(i - 10, i).map((x) => x.high - x.low));
    const pr = p.high - p.low;
    if (!(adr > 0) || !(pr > 0)) continue;
    const dC = (b.open - p.close) / adr;
    rows.push({
      clv: (p.close - p.low) / pr,
      dH: (p.high - b.open) / adr,
      dL: (b.open - p.low) / adr,
      g: Math.abs(dC),
      dC,
      E1: b.high >= p.high,
      E2: b.low <= p.low,
      E3: dC >= 0 ? b.low <= p.close : b.high >= p.close,
      E4: b.close > p.close,
    });
  }
  return rows;
}

/** Interval (a, b] like pandas.cut. */
function binIndex(edges: number[], v: number): number {
  for (let i = 0; i < edges.length - 1; i++) if (v > edges[i] && v <= edges[i + 1]) return i;
  return -1;
}

function binProb(rows: Row[], key: keyof Row, ev: keyof Row, edges: number[], v: number): number | null {
  const k = binIndex(edges, v);
  if (k < 0) return null;
  let n = 0, hits = 0;
  for (const r of rows) {
    if (binIndex(edges, r[key] as number) === k) { n++; if (r[ev]) hits++; }
  }
  return n >= 10 ? (hits + 1) / (n + 2) : null;
}

export interface Odds {
  highBreaks: number | null; // yesterday's high gets taken out today
  lowBreaks: number | null;
  gapFills: number | null; // only once the open is known
  closesAbovePDC: number | null;
}

/** Night-before odds (open unknown) from history before ctx.date. */
export function nightOdds(history: DailyBar[], ctx: SessionContext): Odds {
  const rows = historyRows(history.filter((b) => b.date < ctx.date));
  return {
    highBreaks: binProb(rows, "clv", "E1", BINS.clv, ctx.clv),
    lowBreaks: binProb(rows, "clv", "E2", BINS.clv, ctx.clv),
    gapFills: null,
    closesAbovePDC: null,
  };
}

/** Odds once the opening price is known. */
export function openOdds(history: DailyBar[], ctx: SessionContext, open: number): Odds {
  const rows = historyRows(history.filter((b) => b.date < ctx.date));
  const dC = (open - ctx.pdc) / ctx.adr;
  return {
    highBreaks: binProb(rows, "dH", "E1", BINS.dLevel, (ctx.pdh - open) / ctx.adr),
    lowBreaks: binProb(rows, "dL", "E2", BINS.dLevel, (open - ctx.pdl) / ctx.adr),
    gapFills: binProb(rows, "g", "E3", BINS.gap, Math.abs(dC) + 1e-9),
    closesAbovePDC: binProb(rows, "dC", "E4", BINS.dC, dC === 0 ? 1e-9 : dC),
  };
}

// ---------------------------------------------------------------------------
// Trade management
// ---------------------------------------------------------------------------

export interface PaperTrade {
  id: string; // session|instrument|strategy
  session: string;
  instrument: string;
  market: Market;
  strategy: StrategyId;
  mode: "active" | "shadow";
  side: 1 | -1;
  entryTime: number | null;
  entry: number | null;
  target: number | null;
  stop: number | null;
  status: "pending" | "open" | "closed" | "skipped";
  exitTime: number | null;
  exit: number | null;
  reason: string;
  retPct: number | null; // after costs
  pnlInr: number | null; // on NOTIONAL_INR
  mtmPct: number | null;
  entryDelayBars: number;
  stopDistance: number;
  trigger?: number | null; // BREAKOUT entry level
  // live mirror (Indian active trades only, when live is switched on)
  brokerOrderId?: string;
  brokerStopOrderId?: string;
  brokerExitOrderId?: string;
  brokerQty?: number;
  brokerNote?: string;
  brokerSymbol?: string; // the option bought, e.g. NIFTY-Oct2026-22800-PE
  brokerSecurityId?: string;
  brokerSegment?: "NSE_EQ" | "NSE_FNO" | "BSE_FNO" | "BSE_EQ";
  brokerEntryPrice?: number; // premium paid per unit
  brokerExitPrice?: number; // premium received per unit
}

export const COST: Record<Market, number> = {
  "IN index": 0.0003, "IN stock": 0.0006, "US index": 0.0002, "US stock": 0.0002, commodity: 0.0003, crypto: 0.001,
};
export const NOTIONAL_INR = 100000;

export function newTrade(instrument: string, market: Market, session: string, s: Signal): PaperTrade {
  return {
    id: `${session}|${instrument}|${s.strategy}${s.trigger != null ? (s.side === 1 ? "_UP" : "_DOWN") : ""}`, session, instrument, market, strategy: s.strategy, mode: s.mode, side: s.side,
    entryTime: null, entry: null, target: s.target, stop: null, status: "pending", exitTime: null, exit: null,
    reason: s.reason, retPct: null, pnlInr: null, mtmPct: null, entryDelayBars: s.entryDelayBars, stopDistance: s.stopDistance, trigger: s.trigger ?? null,
  };
}

/**
 * Advance a trade through the session's bars (first bar = opening bar).
 * Fills pending entries at the entry bar's open, then checks the stop before the
 * target inside each bar (conservative), then exits at the last bar's close when
 * `sessionOver` is true. Idempotent: call it on every cycle with all bars so far.
 */
export function advanceTrade(t: PaperTrade, bars: IntradayBar[], sessionOver: boolean): PaperTrade {
  const { entryDelayBars, stopDistance } = t;
  if (t.status === "closed" || t.status === "skipped" || bars.length === 0) return t;
  const tr = { ...t };
  if (tr.status === "pending" && tr.trigger != null) {
    const lvl = tr.trigger;
    const i = bars.findIndex((b) => (tr.side === 1 ? b.high >= lvl : b.low <= lvl));
    if (i < 0) return sessionOver ? { ...tr, status: "skipped", reason: tr.reason + "; level never crossed" } : tr;
    const px = tr.side === 1 ? Math.max(lvl, bars[i].open) : Math.min(lvl, bars[i].open);
    tr.entry = px;
    tr.entryTime = bars[i].t;
    tr.stop = px - tr.side * stopDistance;
    tr.status = "open";
  }
  if (tr.status === "pending") {
    if (bars.length <= entryDelayBars) return tr;
    const eb = bars[entryDelayBars];
    if (entryDelayBars > 0 && tr.target !== null && ((tr.side === 1 && eb.open >= tr.target) || (tr.side === -1 && eb.open <= tr.target))) {
      return { ...tr, status: "skipped", reason: tr.reason + "; target already reached before entry time" };
    }
    tr.entry = eb.open;
    tr.entryTime = eb.t;
    tr.stop = eb.open - tr.side * stopDistance;
    tr.status = "open";
  }
  const cost = COST[tr.market];
  const fin = (px: number, at: number, why: string) => {
    const r = (tr.side * (px - tr.entry!)) / tr.entry! - cost;
    return { ...tr, status: "closed" as const, exit: px, exitTime: at, reason: `${tr.reason}; closed: ${why}`, retPct: r * 100, pnlInr: r * NOTIONAL_INR, mtmPct: null };
  };
  const from = bars.findIndex((b) => b.t >= tr.entryTime!);
  for (let i = Math.max(0, from); i < bars.length; i++) {
    const b = bars[i];
    const hitStop = tr.side === 1 ? b.low <= tr.stop! : b.high >= tr.stop!;
    const hitTarget = tr.target !== null && (tr.side === 1 ? b.high >= tr.target : b.low <= tr.target);
    if (hitStop) return fin(tr.stop!, b.t, "safety stop");
    if (hitTarget) return fin(tr.target!, b.t, "target (yesterday's close)");
  }
  const last = bars[bars.length - 1];
  if (sessionOver) return fin(last.close, last.t, "session close");
  tr.mtmPct = ((tr.side * (last.close - tr.entry!)) / tr.entry! - cost) * 100;
  return tr;
}
