/**
 * ROKI - TRADE REVIEW
 *
 * For every closed trade: why Roki took it (the rule and the numbers that
 * triggered it), what the price did after entry (best and worst moment, the
 * kind of day it was), why it ended in profit or loss, and what that teaches.
 * Built only from the session's real 5-minute bars, so it can be checked.
 */

import type { IntradayBar, PaperTrade, SessionContext } from "./brain.js";
import { COST, NOTIONAL_INR } from "./brain.js";

export type Verdict =
  | "target" // reached yesterday's close as planned
  | "won_close" // held to the close and the move went Roki's way
  | "stopped" // the safety stop (1 average day's range) was hit
  | "gave_back" // was clearly in profit, ended in a loss
  | "costs" // barely moved; charges decided it
  | "wrong_way"; // went against Roki and never paid

export interface TradeReview {
  v: 1;
  verdict: Verdict;
  won: boolean;
  why: string; // why the trade was taken
  happened: string; // what the price did
  because: string; // why it ended in profit or loss
  lesson: string; // what it teaches
  best: { inr: number; adr: number; at: number }; // best moment after entry
  worst: { inr: number; adr: number; at: number }; // worst moment after entry
  dayRangeAdr: number; // today's range in average days
  trendDay: boolean; // range > 1.5 average days, closing near one end
  againstTrend: boolean; // the day's move from the open ran against the trade
  touchedPdc: boolean;
  wentAgainstFirst: boolean;
}

const f = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: v < 10 ? 4 : 2 });
const r = (v: number) => `₹${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) + " IST";
const side = (t: PaperTrade) => (t.side === 1 ? "bought" : "sold");

function whyTaken(t: PaperTrade, ctx: SessionContext, open: number): string {
  const gap = (open - ctx.pdc) / ctx.adr;
  const dir = gap > 0 ? "above" : "below";
  switch (t.strategy) {
    case "GAPFADE":
    case "GAPFADE30":
      return `${t.instrument} opened at ${f(open)}, ${dir} yesterday's close (${f(ctx.pdc)}) by ${Math.abs(gap).toFixed(2)}× a normal day's move. ` +
        `Big gaps come back toward yesterday's close more often than chance, so Roki ${side(t)} ${t.strategy === "GAPFADE30" ? "30 minutes after the open (a timing test)" : "at the open"}, aiming for ${f(ctx.pdc)}.`;
    case "BIGGAP":
      return `${t.instrument} opened ${dir} yesterday's close by ${Math.abs(gap).toFixed(2)}× a normal day's move, in the direction of its 50-day trend, in a lively market. ` +
        `In US stocks such gaps usually fade by the close, so Roki ${side(t)} at the open and held to the close.`;
    case "XFADE":
    case "XFADE_SKIPDAY":
      return `Yesterday ${t.instrument} closed at ${(ctx.clv * 100).toFixed(0)}% of its range (${ctx.clv > 0.5 ? "right at its high" : "right at its low"}). ` +
        `After closes that extreme, the next day usually drifts back, so Roki ${side(t)} at the open (${f(open)}) and held to the close.` +
        (t.strategy === "XFADE_SKIPDAY" ? " It was a skip day, so this trade was kept for learning only." : "");
    case "BREAKOUT":
      return `${t.instrument} crossed yesterday's ${t.side === 1 ? "high" : "low"} (${f(t.trigger ?? 0)}). In crypto, moves that break yesterday's levels tend to keep going, ` +
        `so Roki ${side(t)} at ${f(t.entry ?? 0)} and held to the end of the day.`;
    default:
      return t.reason;
  }
}

/** Review a closed trade from the session's 5-minute bars (first bar = the open). */
export function reviewTrade(t: PaperTrade, bars: IntradayBar[], ctx: SessionContext): TradeReview | null {
  if (t.status !== "closed" || t.entry === null || t.exit === null || !t.entryTime || !t.exitTime || !bars.length || !(ctx.adr > 0)) return null;
  const open = bars[0].open;
  const held = bars.filter((b) => b.t >= t.entryTime! && b.t <= t.exitTime!);
  if (!held.length) return null;
  const pnlAt = (px: number) => ((t.side * (px - t.entry!)) / t.entry!) * NOTIONAL_INR;
  let best = { inr: -Infinity, adr: 0, at: held[0].t }, worst = { inr: Infinity, adr: 0, at: held[0].t };
  let firstMove: "for" | "against" | null = null;
  const step = 0.25 * ctx.adr;
  for (const b of held) {
    const good = t.side === 1 ? b.high : b.low, bad = t.side === 1 ? b.low : b.high;
    if (pnlAt(good) > best.inr) best = { inr: pnlAt(good), adr: (t.side * (good - t.entry!)) / ctx.adr, at: b.t };
    if (pnlAt(bad) < worst.inr) worst = { inr: pnlAt(bad), adr: (t.side * (bad - t.entry!)) / ctx.adr, at: b.t };
    if (!firstMove) {
      const upFor = t.side * (good - t.entry!) >= step, upAgainst = t.side * (t.entry! - bad) >= step;
      if (upAgainst) firstMove = "against"; else if (upFor) firstMove = "for";
    }
  }
  const hi = Math.max(...bars.map((b) => b.high)), lo = Math.min(...bars.map((b) => b.low));
  const close = bars[bars.length - 1].close;
  const dayRangeAdr = (hi - lo) / ctx.adr;
  const closePos = hi > lo ? (close - lo) / (hi - lo) : 0.5;
  const dayDir = Math.sign(close - open);
  const againstTrend = dayDir !== 0 && dayDir !== t.side;
  const trendDay = dayRangeAdr > 1.5 && (closePos > 0.75 || closePos < 0.25);
  const touchedPdc = lo <= ctx.pdc && hi >= ctx.pdc;
  const pnl = t.pnlInr ?? 0, won = pnl > 0;
  const costInr = COST[t.market] * NOTIONAL_INR;
  const exitWhy = t.reason.split("; closed: ")[1] || "";

  let verdict: Verdict;
  if (won && exitWhy.startsWith("target")) verdict = "target";
  else if (won) verdict = "won_close";
  else if (exitWhy.startsWith("safety stop")) verdict = "stopped";
  else if (best.inr >= Math.max(3 * costInr, 0.3 * ctx.adr / t.entry * NOTIONAL_INR)) verdict = "gave_back";
  else if (Math.abs(pnl) <= 2 * costInr) verdict = "costs";
  else verdict = "wrong_way";

  const happened =
    `Best moment: ${best.inr >= 0 ? "+" : "−"}${r(best.inr)} at ${clock(best.at)}. Worst moment: ${worst.inr >= 0 ? "+" : "−"}${r(worst.inr)} at ${clock(worst.at)}. ` +
    `${firstMove === "against" ? "The price went against Roki first. " : firstMove === "for" ? "The price went Roki's way first. " : "The price hardly moved after entry. "}` +
    `The day's range was ${dayRangeAdr.toFixed(1)}× a normal day${trendDay ? `, a one-way trend day closing near its ${closePos > 0.5 ? "high" : "low"}` : ""}` +
    `${touchedPdc ? ", and it did touch yesterday's close." : ", and it never touched yesterday's close."}`;

  const ruleIsFade = t.strategy !== "BREAKOUT";
  const because: Record<Verdict, string> = {
    target: `The gap came back to yesterday's close (${f(ctx.pdc)}) at ${clock(t.exitTime)}, exactly what the rule bets on. Result +${r(pnl)} after costs.`,
    won_close: `The day drifted Roki's way and it closed the trade at ${clock(t.exitTime)} with +${r(pnl)} after costs.`,
    stopped: `The price kept going against Roki by a full normal day's move, so the safety stop closed it at ${f(t.exit)}. ` +
      (trendDay && againstTrend ? `It was a strong one-way day ${ruleIsFade ? "in the direction Roki was betting against" : "that reversed"}.` : "The move against it never paused."),
    gave_back: `It was up as much as +${r(best.inr)}, but Roki holds to the close by design and the price turned back. It ended −${r(pnl)}.`,
    costs: `The price barely moved, so the charges (about ${r(costInr)} a trade) decided the result: −${r(pnl)}.`,
    wrong_way: `The price moved against Roki${againstTrend ? " and kept going that way into the close" : ""}; the best it ever showed was +${r(Math.max(0, best.inr))}. It ended −${r(pnl)}.`,
  };

  const lessonFor = (): string => {
    if (t.mode === "shadow") return "Learning-only: this rule hasn't proved itself in this market, so the result is recorded but not counted.";
    switch (verdict) {
      case "target": return "This is the rule's edge: big gaps return to yesterday's close 6–8 points more often than distance alone predicts. One win proves nothing on its own; it counts as part of the long record.";
      case "won_close": return "A win like this is expected about half the time or a bit more. The rule only pays over many trades, so Roki keeps the size the same every day.";
      case "stopped": return ruleIsFade
        ? "Fades lose on strong one-way days. Roki tested filters to spot these days in advance; none held up on new data, so these losses are accepted as the rule's cost."
        : "Breakouts often fail and snap back. In crypto the rule pays only over many trades, so occasional stops are expected.";
      case "gave_back": return "Roki holds to the close on purpose: in testing, taking profit early or using tight stops cut the winners more than it saved, so some trades that were up end down.";
      case "costs": return "On quiet days the move is smaller than the charges. That is why Roki skips quiet markets for the extreme-close rule.";
      case "wrong_way": return againstTrend
        ? "The day kept going in yesterday's direction. Roki's edge is small (a few tenths of a percent per trade), so runs of days like this happen and are survived by keeping each trade small."
        : "The price went against Roki and never recovered. Losses like this are part of every rule's record; Roki reviews each rule after 20 counted trades.";
    }
  };

  return {
    v: 1, verdict, won,
    why: whyTaken(t, ctx, open),
    happened,
    because: because[verdict],
    lesson: lessonFor(),
    best: { inr: Math.round(best.inr), adr: +best.adr.toFixed(2), at: best.at },
    worst: { inr: Math.round(worst.inr), adr: +worst.adr.toFixed(2), at: worst.at },
    dayRangeAdr: +dayRangeAdr.toFixed(2), trendDay, againstTrend, touchedPdc, wentAgainstFirst: firstMove === "against",
  };
}
