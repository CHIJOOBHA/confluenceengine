/**
 * ROKI - DATA GUARD
 *
 * Garbage in, garbage out: before the brain uses a market's prices, they must look
 * like real prices. If anything is impossible or wildly out of line, the market is
 * skipped for this cycle (no new calls, no new trades, open trades wait for the next
 * good cycle) and the reason is written to the engine notes. Roki never "fixes" a
 * bad price by guessing; it waits for good data.
 *
 * Why: Yahoo has served broken bars before (silver's SI=F had 12% flat bars, which is
 * why silver uses SLV). A single bad print could fake a gap, trigger a breakout or a
 * stop, and then be "learned" from.
 */

import type { DailyBar, IntradayBar, Market } from "./brain.js";

/** Largest believable move from one close to the next, per market (well beyond real-world extremes, below data errors). */
export const MAX_DAILY_MOVE: Record<Market, number> = {
  "IN index": 0.15, // Indian market-wide circuit breakers halt trading at 10/15/20%
  "IN stock": 0.25, // large caps carry no fixed band but rarely move 20% in a day
  "US index": 0.15, // US market-wide halts at 7/13/20%
  "US stock": 0.4,
  commodity: 0.3,
  crypto: 0.5,
};

export interface GuardResult { ok: boolean; problems: string[] }

const bad = (x: number) => !Number.isFinite(x) || x <= 0;

function barProblem(b: { open: number; high: number; low: number; close: number }): string | null {
  if (bad(b.open) || bad(b.high) || bad(b.low) || bad(b.close)) return "a price is zero, negative or missing";
  const tol = 1e-6 * b.high;
  if (b.high + tol < b.low) return "high below low";
  if (b.open > b.high + tol || b.open < b.low - tol) return "open outside the bar's range";
  if (b.close > b.high + tol || b.close < b.low - tol) return "close outside the bar's range";
  return null;
}

/** Checks the last `lookback` daily bars and today's intraday bars. */
export function guardData(market: Market, daily: DailyBar[], intraday: IntradayBar[], lookback = 30): GuardResult {
  const problems: string[] = [];
  const lim = MAX_DAILY_MOVE[market];

  const recent = daily.slice(-lookback);
  for (let i = 0; i < recent.length; i++) {
    const p = barProblem(recent[i]);
    if (p) problems.push(`daily ${recent[i].date}: ${p}`);
    if (i > 0) {
      const mv = Math.abs(recent[i].close / recent[i - 1].close - 1);
      // A real shock (XRP +73% on 13 Jul 2023) is confirmed when the next day opens near the new level;
      // a bad print snaps back. So a big move counts as a problem only if it is the latest bar or it reversed.
      const next = recent[i + 1];
      const confirmed = next && Math.abs(next.open / recent[i].close - 1) < lim / 2;
      if (mv > lim && !confirmed) problems.push(`daily ${recent[i].date}: close moved ${(mv * 100).toFixed(1)}% in a day (limit ${(lim * 100).toFixed(0)}%)`);
    }
  }
  const dates = recent.map((b) => b.date);
  if (new Set(dates).size !== dates.length) problems.push("daily bars repeat a date");

  const last = intraday.slice(-400);
  for (let i = 0; i < last.length; i++) {
    const p = barProblem(last[i]);
    if (p) { problems.push(`5-minute bar ${new Date(last[i].t).toISOString()}: ${p}`); continue; }
    if (i > 0) {
      if (last[i].t <= last[i - 1].t) problems.push("5-minute bars out of time order");
      const mv = Math.abs(last[i].open / last[i - 1].close - 1);
      // between two consecutive 5-minute bars (including overnight), allow the full daily limit
      if (mv > lim) problems.push(`5-minute bar ${new Date(last[i].t).toISOString()}: jumped ${(mv * 100).toFixed(1)}% from the bar before`);
    }
  }
  return { ok: problems.length === 0, problems: problems.slice(0, 5) };
}
