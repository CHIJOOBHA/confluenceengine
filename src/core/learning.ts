/**
 * ROKI - DAILY LEARNING
 *
 * Built from every reviewed trade and every scored prediction (all kept forever):
 *  1. Rule scorecards: live results per rule and market, against what 5 years of
 *     testing said to expect, with the agreed review points (20 and 40 trades).
 *  2. Checks: each one is a finding from testing, re-measured on live trades.
 *  3. Journal: one entry per day - result, why trades won or lost, lessons.
 * Roki never changes a rule by itself: a proposal appears only when the agreed
 * condition is met (live average below zero after 40+ counted trades), and the
 * owner decides.
 */

import type { Market, PaperTrade, StrategyId } from "./brain.js";
import type { Prediction } from "./engineRunner.js";
import type { Verdict } from "./review.js";

/** Average result per trade after costs found in testing (percent of the trade). */
export const EXPECTED: Partial<Record<StrategyId, Partial<Record<Market, number>>>> = {
  GAPFADE: { "IN index": 0.05, "US stock": 0.13 },
  XFADE: { "IN index": 0.08, "IN stock": 0.15, crypto: 0.15 },
  BIGGAP: { "US stock": 0.6 },
  BREAKOUT: { crypto: 0.3 },
};

export const PRED_EXPECTED: Record<string, [number, number, string]> = {
  N_H: [0.71, 0.76, "Night before: will yesterday's high break?"],
  N_L: [0.71, 0.76, "Night before: will yesterday's low break?"],
  O_G: [0.77, 0.78, "At the open: will the gap fill?"],
  O_C: [0.72, 0.75, "At the open: which side of yesterday's close will it end?"],
};

export type ScoreStatus = "early" | "on_track" | "watch" | "propose";

export interface RuleScore {
  strategy: StrategyId;
  market: Market;
  n: number;
  wins: number;
  totalInr: number;
  avgPct: number;
  expectedPct: number | null;
  /** How far live is from testing, in units of normal luck for this many trades. */
  z: number | null;
  status: ScoreStatus;
  note: string;
}

export interface Check {
  id: string;
  title: string;
  fromTesting: string;
  live: string;
  n: number;
  status: "early" | "agrees" | "differs";
}

export interface JournalDay {
  date: string;
  trades: number;
  wins: number;
  totalInr: number;
  best: PaperTrade | null;
  worst: PaperTrade | null;
  mix: Partial<Record<Verdict, number>>;
  predRight: number;
  predScored: number;
  lessons: string[];
}

export interface Learning {
  counted: PaperTrade[];
  scores: RuleScore[];
  checks: Check[];
  journal: JournalDay[];
  proposals: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const RULE: Record<string, string> = { GAPFADE: "Gap fade", XFADE: "Extreme-close fade", BIGGAP: "Big-gap fade", BREAKOUT: "Breakout", GAPFADE30: "Gap fade (late entry)", XFADE_SKIPDAY: "Extreme-close fade on skip days" };

export function buildLearning(trades: PaperTrade[], predictions: Prediction[]): Learning {
  const closed = trades.filter((t) => t.status === "closed" && t.retPct !== null);
  const counted = closed.filter((t) => t.mode === "active");

  // 1. Rule scorecards
  const groups = new Map<string, PaperTrade[]>();
  for (const t of counted) {
    const k = `${t.strategy}|${t.market}`;
    groups.set(k, [...(groups.get(k) || []), t]);
  }
  const scores: RuleScore[] = [...groups.entries()].map(([k, xs]) => {
    const [strategy, market] = k.split("|") as [StrategyId, Market];
    const rets = xs.map((t) => t.retPct!);
    const avg = mean(rets);
    const expected = EXPECTED[strategy]?.[market] ?? null;
    const s = Math.max(sd(rets), 0.5);
    const z = expected === null ? null : (avg - expected) / (s / Math.sqrt(xs.length));
    let status: ScoreStatus = "early";
    let note = `${xs.length} of 20 trades before the first review.`;
    if (xs.length >= 20) {
      status = z !== null && z < -2 ? "watch" : "on_track";
      note = status === "watch" ? "Clearly worse than testing; more than normal bad luck." : "Within the normal ups and downs of the tested result.";
    }
    if (xs.length >= 40 && avg < 0 && z !== null && z < -2) {
      status = "propose";
      note = "Below zero after 40+ trades: Roki suggests moving it to learning-only. You decide.";
    }
    return { strategy, market, n: xs.length, wins: xs.filter((t) => (t.pnlInr ?? 0) > 0).length, totalInr: xs.reduce((a, t) => a + (t.pnlInr ?? 0), 0), avgPct: avg, expectedPct: expected, z, status, note };
  }).sort((a, b) => b.n - a.n);

  // 2. Checks: findings from testing, re-measured live
  const reviewed = counted.filter((t) => t.review);
  const checks: Check[] = [];
  const winners = reviewed.filter((t) => t.review!.won);
  checks.push({
    id: "against_first", title: "Winners often go against Roki first",
    fromTesting: "About half of winning gap fades first moved against the entry (by 0.29 of a day's range on average). This is why Roki uses wide stops.",
    live: winners.length ? `${winners.filter((t) => t.review!.wentAgainstFirst).length} of ${winners.length} winners went against Roki first (${pct(winners.filter((t) => t.review!.wentAgainstFirst).length / winners.length)}).` : "No winners yet.",
    n: winners.length,
    status: winners.length < 20 ? "early" : Math.abs(winners.filter((t) => t.review!.wentAgainstFirst).length / winners.length - 0.5) <= 0.2 ? "agrees" : "differs",
  });
  const fadeLosses = reviewed.filter((t) => !t.review!.won && t.strategy !== "BREAKOUT");
  const trendLoss = fadeLosses.filter((t) => t.review!.trendDay || t.review!.verdict === "stopped").length;
  checks.push({
    id: "trend_days", title: "Fade trades lose most on one-way days",
    fromTesting: "Gap fades lose on trend days (range above 1.5 normal days). No filter found in testing could avoid these days in advance.",
    live: fadeLosses.length ? `${trendLoss} of ${fadeLosses.length} losing fade trades came on one-way days or hit the safety stop.` : "No losing fade trades yet.",
    n: fadeLosses.length, status: fadeLosses.length < 20 ? "early" : trendLoss / fadeLosses.length >= 0.3 ? "agrees" : "differs",
  });
  const gapFades = reviewed.filter((t) => t.strategy === "GAPFADE");
  const filled = gapFades.filter((t) => t.review!.touchedPdc).length;
  checks.push({
    id: "gap_fill", title: "Big gaps come back to yesterday's close about 3 times in 10",
    fromTesting: "When the open is more than half a normal day away from yesterday's close, the price touches that close roughly 30-34% of the time; that is the rule's target.",
    live: gapFades.length ? `${filled} of ${gapFades.length} gap-fade days touched yesterday's close (${pct(filled / gapFades.length)}).` : "No gap-fade trades yet.",
    n: gapFades.length, status: gapFades.length < 20 ? "early" : Math.abs(filled / gapFades.length - 0.32) <= 0.15 ? "agrees" : "differs",
  });
  const gave = reviewed.filter((t) => t.review!.verdict === "gave_back").length;
  checks.push({
    id: "hold_close", title: "Holding to the close costs some winners",
    fromTesting: "Taking profit early or tight stops made every rule worse in testing, so Roki holds to the close and accepts that some trades that were up end down.",
    live: reviewed.length ? `${gave} of ${reviewed.length} trades were up and then gave it back (${pct(gave / reviewed.length)}).` : "No trades yet.",
    n: reviewed.length, status: reviewed.length < 20 ? "early" : "agrees",
  });
  const skipT = closed.filter((t) => t.strategy === "XFADE_SKIPDAY"), xT = closed.filter((t) => t.strategy === "XFADE");
  checks.push({
    id: "skip_days", title: "Skip days are worse than normal days",
    fromTesting: "Extreme-close fades on quiet markets, after small days, on Fridays and Sundays lost on new data (−0.12% a trade), so Roki skips them and only records them.",
    live: skipT.length && xT.length ? `Skip days average ${mean(skipT.map((t) => t.retPct!)).toFixed(2)}% a trade (${skipT.length} trades) vs ${mean(xT.map((t) => t.retPct!)).toFixed(2)}% on normal days (${xT.length}).` : "Not enough trades of both kinds yet.",
    n: Math.min(skipT.length, xT.length),
    status: Math.min(skipT.length, xT.length) < 20 ? "early" : mean(skipT.map((t) => t.retPct!)) < mean(xT.map((t) => t.retPct!)) ? "agrees" : "differs",
  });
  for (const [q, [lo, hi, title]] of Object.entries(PRED_EXPECTED)) {
    const ps = predictions.filter((p) => p.question === q && (p.result === "hit" || p.result === "miss"));
    const right = ps.filter((p) => p.result === "hit").length, rate = ps.length ? right / ps.length : 0;
    checks.push({
      id: `pred_${q}`, title, fromTesting: `Right ${Math.round(lo * 100)}-${Math.round(hi * 100)}% of the time over 5 years of walk-forward testing.`,
      live: ps.length ? `Right ${right} of ${ps.length} (${pct(rate)}).` : "No scored calls yet.",
      n: ps.length, status: ps.length < 30 ? "early" : rate >= lo - 0.1 ? "agrees" : "differs",
    });
  }

  // 3. Journal, newest day first
  const days = [...new Set(counted.map((t) => t.session))].sort().reverse();
  const journal: JournalDay[] = days.map((date) => {
    const xs = counted.filter((t) => t.session === date);
    const sorted = [...xs].sort((a, b) => (b.pnlInr ?? 0) - (a.pnlInr ?? 0));
    const mix: Partial<Record<Verdict, number>> = {};
    for (const t of xs) if (t.review) mix[t.review.verdict] = (mix[t.review.verdict] || 0) + 1;
    const ps = predictions.filter((p) => p.session === date && (p.result === "hit" || p.result === "miss"));
    const lessons = [...new Set(xs.filter((t) => t.review && !t.review.won).map((t) => t.review!.lesson))];
    if (!lessons.length) lessons.push(...new Set(xs.filter((t) => t.review).map((t) => t.review!.lesson)));
    return {
      date, trades: xs.length, wins: xs.filter((t) => (t.pnlInr ?? 0) > 0).length, totalInr: xs.reduce((a, t) => a + (t.pnlInr ?? 0), 0),
      best: sorted[0] ?? null, worst: sorted.length > 1 ? sorted[sorted.length - 1] : null, mix,
      predRight: ps.filter((p) => p.result === "hit").length, predScored: ps.length, lessons: lessons.slice(0, 3),
    };
  });

  const proposals = scores.filter((s) => s.status === "propose").map((s) => `Move ${RULE[s.strategy] || s.strategy} in ${s.market} to learning-only: ${s.n} trades averaging ${s.avgPct.toFixed(2)}% against ${s.expectedPct?.toFixed(2)}% in testing.`);

  return { counted, scores, checks, journal, proposals };
}

/** All reviews as CSV, for keeping or sharing. */
export function reviewsCsv(trades: PaperTrade[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["day", "market", "instrument", "rule", "counted", "side", "entry", "exit", "result_inr", "result_pct", "outcome", "why_taken", "what_happened", "why_won_or_lost", "lesson"];
  const rows = trades.filter((t) => t.status === "closed").sort((a, b) => a.session.localeCompare(b.session)).map((t) => [
    t.session, t.market, t.instrument, RULE[t.strategy] || t.strategy, t.mode === "active" ? "yes" : "learning only", t.side === 1 ? "buy" : "sell",
    t.entry, t.exit, Math.round(t.pnlInr ?? 0), (t.retPct ?? 0).toFixed(3), t.review?.verdict ?? "", t.review?.why ?? "", t.review?.happened ?? "", t.review?.because ?? "", t.review?.lesson ?? "",
  ].map(esc).join(","));
  return [head.join(","), ...rows].join("\n");
}
