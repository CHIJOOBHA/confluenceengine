/**
 * ROKI - RESEARCH PLAN
 *
 * The questions Roki is working on, each measured from its own live record:
 * status (planned / collecting / finished), progress toward the agreed sample,
 * the finding so far, and what moved on the latest day. The daily video script
 * is written from this, so every claim about Roki's research is checkable.
 */

import type { Market, PaperTrade, StrategyId } from "./brain.js";
import type { Prediction } from "./engineRunner.js";
import { EXPECTED } from "./learning.js";

export type ResearchStatus = "planned" | "collecting" | "finished";

export interface ResearchItem {
  id: string;
  question: string;
  why: string;
  method: string;
  status: ResearchStatus;
  done: number;
  need: number;
  today: number; // how much of `done` came from the latest day
  finding: string;
  next: string; // what happens when it finishes / what comes next
}

export interface DayStudy { date: string; title: string; text: string }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const p2 = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}%`;
const share = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function ruleQuestion(id: string, question: string, why: string, trades: PaperTrade[], strategies: StrategyId[], markets: Market[], latest: string): ResearchItem {
  const xs = trades.filter((t) => t.mode === "active" && t.status === "closed" && t.retPct !== null && strategies.includes(t.strategy) && markets.includes(t.market));
  const exp = mean(strategies.flatMap((s) => markets.map((m) => EXPECTED[s]?.[m])).filter((v): v is number => v !== undefined));
  const avg = mean(xs.map((t) => t.retPct!));
  const need = 20;
  const status: ResearchStatus = xs.length === 0 ? "planned" : xs.length < need ? "collecting" : "finished";
  const finding = !xs.length ? "No trades yet." :
    status === "finished"
      ? `After ${xs.length} trades the live average is ${p2(avg)} a trade against ${p2(exp)} in testing: ${avg >= exp - 0.3 ? "in line with testing" : "clearly worse than testing"}.`
      : `${xs.length} of ${need} trades. So far ${p2(avg)} a trade against ${p2(exp)} in testing. Too early to judge.`;
  return {
    id, question, why, method: `Compare the live average per trade, after costs, with the 5-year tested average (${p2(exp)}). First verdict at ${need} trades.`,
    status, done: xs.length, need, today: xs.filter((t) => t.session === latest).length, finding,
    next: status === "finished" ? "Keep collecting; at 40 trades a pause is suggested if it is still below zero." : `At ${need} trades Roki gives its first verdict on this rule.`,
  };
}

export function buildResearch(trades: PaperTrade[], predictions: Prediction[]): { items: ResearchItem[]; latest: string | null; studies: DayStudy[] } {
  const closed = trades.filter((t) => t.status === "closed");
  const latest = closed.filter((t) => t.mode === "active").map((t) => t.session).sort().pop() ?? null;
  const L = latest ?? "";
  const items: ResearchItem[] = [
    ruleQuestion("crypto_breakout", "Does the crypto breakout rule hold up with real money flows?", "It is the only rule that goes with the move instead of fading it, and the newest one (added 21 October).", trades, ["BREAKOUT"], ["crypto"], L),
    ruleQuestion("india_index", "Do gap fades and extreme-close fades work live on Nifty, Sensex and Bank Nifty?", "These are the rules behind the Indian options account.", trades, ["GAPFADE", "XFADE"], ["IN index"], L),
    ruleQuestion("india_stock", "Does the extreme-close fade work live on Indian stocks?", "It was the strongest rule on Indian stocks in testing.", trades, ["XFADE"], ["IN stock"], L),
    ruleQuestion("us_stock", "Do gap fades and big-gap fades work live on US stocks?", "Big-gap fade had the best tested record of all rules.", trades, ["GAPFADE", "BIGGAP"], ["US stock"], L),
  ];

  // Winners go against first?
  const winners = closed.filter((t) => t.mode === "active" && t.review?.won);
  const wAgainst = winners.filter((t) => t.review!.wentAgainstFirst).length;
  items.push({
    id: "against_first", question: "Do winning trades usually go against Roki first?", why: "If yes, wide stops are right; if not, Roki could use tighter ones and lose less on bad days.",
    method: "Count winners whose price moved a quarter of a normal day against the entry before moving in Roki's favour. Testing said about half.",
    status: winners.length === 0 ? "planned" : winners.length < 20 ? "collecting" : "finished", done: winners.length, need: 20,
    today: winners.filter((t) => t.session === L).length,
    finding: winners.length ? `${wAgainst} of ${winners.length} winners went against Roki first (${share(wAgainst, winners.length)}); testing said about 50%.` : "No winners yet.",
    next: winners.length >= 20 ? "If clearly below half, Roki will test tighter stops on past data before changing anything." : "Verdict at 20 winners.",
  });

  // Late entry test
  const g = closed.filter((t) => t.strategy === "GAPFADE"), g30 = closed.filter((t) => t.strategy === "GAPFADE30");
  const pairs = g30.filter((t) => g.some((x) => x.session === t.session && x.instrument === t.instrument));
  const avgPair = (xs: PaperTrade[]) => mean(xs.map((t) => t.retPct ?? 0));
  const gMatched = pairs.map((t) => g.find((x) => x.session === t.session && x.instrument === t.instrument)!);
  items.push({
    id: "late_entry", question: "Is it better to enter a gap fade 30 minutes after the open?", why: "In testing, waiting improved the average on a small sample (180 trades).",
    method: "Every gap fade is also traded 30 minutes later as a learning-only copy; compare the two on the same days.",
    status: pairs.length === 0 ? "planned" : pairs.length < 20 ? "collecting" : "finished", done: pairs.length, need: 20, today: pairs.filter((t) => t.session === L).length,
    finding: pairs.length ? `On ${pairs.length} matching days: at the open ${p2(avgPair(gMatched))} a trade, 30 minutes later ${p2(avgPair(pairs))}.` : "No matching days yet.",
    next: "If the later entry wins clearly at 20 days, Roki proposes switching the entry time.",
  });

  // Skip days
  const sk = closed.filter((t) => t.strategy === "XFADE_SKIPDAY"), xf = closed.filter((t) => t.strategy === "XFADE");
  const nSk = Math.min(sk.length, xf.length);
  items.push({
    id: "skip_days", question: "Is skipping quiet days, small days, Fridays and Sundays still the right call?", why: "Skipping removed 44% of extreme-close trades and doubled the average in testing.",
    method: "Skipped trades are still recorded as learning-only; compare their average with normal days.",
    status: nSk === 0 ? "planned" : nSk < 20 ? "collecting" : "finished", done: nSk, need: 20, today: sk.filter((t) => t.session === L).length,
    finding: sk.length && xf.length ? `Skip days ${p2(mean(sk.map((t) => t.retPct!)))} a trade (${sk.length}) vs normal days ${p2(mean(xf.map((t) => t.retPct!)))} (${xf.length}).` : "Not enough trades of both kinds yet.",
    next: "Verdict when both have 20 trades.",
  });

  // Gold gaps vs stock gaps
  const gapT = closed.filter((t) => (t.strategy === "GAPFADE") && t.review);
  const gold = gapT.filter((t) => t.market === "commodity"), stocks = gapT.filter((t) => t.market === "IN index" || t.market === "US stock" || t.market === "IN stock");
  const fill = (xs: PaperTrade[]) => xs.filter((t) => t.review!.touchedPdc).length;
  items.push({
    id: "gold_gaps", question: "Do big gaps in gold and oil come back like gaps in stocks?", why: "Testing found gold's big gaps rarely fill (about 22–25%), unlike stocks (about 30–34%).",
    method: "On every big-gap day, record whether the price touched yesterday's close, by market.",
    status: gold.length === 0 ? "planned" : gold.length < 20 ? "collecting" : "finished", done: gold.length, need: 20, today: gold.filter((t) => t.session === L).length,
    finding: `${gold.length ? `Commodities: ${fill(gold)} of ${gold.length} big gaps came back (${share(fill(gold), gold.length)}).` : "No big-gap days in commodities yet."} ${stocks.length ? `Stocks and indices: ${fill(stocks)} of ${stocks.length} (${share(fill(stocks), stocks.length)}).` : ""}`.trim(),
    next: "If commodity gaps keep failing to fill, Roki keeps gap fades out of commodities for good.",
  });

  // Prediction accuracy
  const scored = predictions.filter((p) => p.result === "hit" || p.result === "miss");
  const right = scored.filter((p) => p.result === "hit").length;
  items.push({
    id: "predictions", question: "Are Roki's predictions as accurate live as in five years of testing?", why: "Testing said 71–82% depending on the question; live markets can differ.",
    method: "Score every call against the real session; compare each question's hit rate with its tested range.",
    status: scored.length === 0 ? "planned" : scored.length < 100 ? "collecting" : "finished", done: scored.length, need: 100,
    today: scored.filter((p) => p.session === L).length,
    finding: scored.length ? `${right} of ${scored.length} calls right (${share(right, scored.length)}).` : "No scored calls yet.",
    next: "At 100 calls, Roki compares each question with its tested range.",
  });

  items.push({
    id: "options_model", question: "How close are the options account's prices to the real market?", why: "Buying options turned the index edge into losses in testing; the account must price options honestly.",
    method: "Compare modelled option prices with NSE and BSE closing prices each week.", status: "planned", done: 0, need: 4, today: 0,
    finding: "Checked once on past data: at-the-money prices within about 13–14%, profit-or-loss direction right about 9 times in 10.",
    next: "Weekly comparison starts once the options account has its first trades.",
  });

  // Daily studies: how far did each day's big gaps come back?
  const days = [...new Set(gapT.map((t) => t.session))].sort().reverse();
  const studies: DayStudy[] = days.map((d) => {
    const xs = gapT.filter((t) => t.session === d);
    const uniq = [...new Map(xs.map((t) => [t.instrument, t])).values()];
    const f = uniq.filter((t) => t.review!.touchedPdc);
    return {
      date: d, title: "How far did today's big gaps come back?",
      text: `${uniq.length} market${uniq.length > 1 ? "s" : ""} opened far from yesterday's close; ${f.length} came all the way back to it (${share(f.length, uniq.length)})${f.length ? `: ${f.map((t) => t.instrument).join(", ")}` : ""}. Testing says about 3 in 10 for stocks and indices.`,
    };
  });

  return { items, latest, studies };
}
