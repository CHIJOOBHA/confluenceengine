/**
 * CONFLUENCE ENGINE - RUNNER
 *
 * One engine cycle: download real prices, score finished calls, make new calls,
 * open / manage / settle paper trades. Safe to run as often as you like: every
 * step is keyed by session and instrument, so a repeat run changes nothing that
 * is already decided.
 */

import {
  DailyBar, IntradayBar, PaperTrade, buildContext, signalsAtOpen, nightOdds, openOdds, newTrade, advanceTrade, Market,
} from "./brain";
import { INSTRUMENTS, Instrument, START_DATE, sessionBounds, nextSession, nightCallGraceMs, sessionTz } from "./instruments";
import { fetchDaily, fetchIntraday, dateIn } from "../services/marketData";

export type Question = "N_H" | "N_L" | "O_G" | "O_C";

export interface Prediction {
  key: string; // session|instrument|question
  session: string;
  instrument: string;
  market: Market;
  question: Question;
  p: number | null;
  call: string;
  result: "pending" | "no-call" | "hit" | "miss";
  actual: string;
  madeAt: string;
}

export interface LevelRow {
  key: string;
  session: string; // next session
  instrument: string;
  market: Market;
  pdh: number; pdc: number; pdl: number; adr: number; clv: number;
  highBreaks: number | null; lowBreaks: number | null;
  gapFillBand: string;
  triggers: string;
  lastPrice: number | null;
}

export interface BrainState {
  trades: Record<string, PaperTrade>;
  predictions: Record<string, Prediction>;
  levels: LevelRow[];
  lastRun: string | null;
  notes: string[];
}

export const QUESTION_TEXT: Record<Question, [string, string]> = {
  N_H: ["High breaks", "High holds"],
  N_L: ["Low breaks", "Low holds"],
  O_G: ["Gap fills", "Gap stays open"],
  O_C: ["Closes above yesterday's close", "Closes below yesterday's close"],
};

function makePrediction(session: string, inst: Instrument, q: Question, p: number | null, now: number): Prediction {
  const [yes, no] = QUESTION_TEXT[q];
  let call = "No data";
  let result: Prediction["result"] = "no-call";
  if (p !== null) {
    if (p >= 0.6) { call = `${yes} (${Math.round(p * 100)}%)`; result = "pending"; }
    else if (p <= 0.4) { call = `${no} (${Math.round((1 - p) * 100)}%)`; result = "pending"; }
    else call = `No call (${Math.round(p * 100)}%)`;
  }
  return { key: `${session}|${inst.name}|${q}`, session, instrument: inst.name, market: inst.market, question: q, p, call, result, actual: "", madeAt: new Date(now).toISOString() };
}

function outcome(q: Question, b: DailyBar, prev: DailyBar): boolean {
  if (q === "N_H") return b.high >= prev.high;
  if (q === "N_L") return b.low <= prev.low;
  if (q === "O_G") return b.open >= prev.close ? b.low <= prev.close : b.high >= prev.close;
  return b.close > prev.close;
}

export interface CycleChanges {
  trades: PaperTrade[]; // trades created or changed this cycle
  predictions: Prediction[];
}

export interface Fetchers {
  daily: (symbol: string) => Promise<{ tz: string; bars: DailyBar[] }>;
  intraday: (symbol: string) => Promise<{ tz: string; bars: IntradayBar[] }>;
}

const defaultFetchers: Fetchers = {
  daily: (s) => fetchDaily(s, "5y"),
  intraday: (s) => fetchIntraday(s, "5d", "5m"),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run one cycle over every instrument. Mutates `state` and returns what changed. */
export async function runCycle(
  state: BrainState,
  now: number = Date.now(),
  fetchers: Fetchers = defaultFetchers,
  instruments: Instrument[] = INSTRUMENTS,
  startDate: string = START_DATE,
): Promise<CycleChanges> {
  const changedTrades = new Map<string, PaperTrade>();
  const changedPreds = new Map<string, Prediction>();
  const levels: LevelRow[] = [];
  const notes: string[] = [];

  const putTrade = (t: PaperTrade) => {
    const before = state.trades[t.id];
    if (!before || JSON.stringify(before) !== JSON.stringify(t)) { state.trades[t.id] = t; changedTrades.set(t.id, t); }
  };
  const putPred = (p: Prediction) => { state.predictions[p.key] = p; changedPreds.set(p.key, p); };
  const addPred = (p: Prediction) => { if (!state.predictions[p.key]) putPred(p); };

  for (const inst of instruments) {
    let daily: DailyBar[]; let intraday: IntradayBar[];
    try {
      daily = (await fetchers.daily(inst.symbol)).bars;
      intraday = (await fetchers.intraday(inst.symbol)).bars;
    } catch (e) {
      notes.push(`${inst.name}: no data this cycle (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    if (fetchers === defaultFetchers) await sleep(250);

    const done = daily.filter((b) => now >= sessionBounds(inst, b.date).end);
    if (done.length < 300) { notes.push(`${inst.name}: not enough history`); continue; }
    const barsOf = (date: string) => {
      const { start, end } = sessionBounds(inst, date);
      return intraday.filter((b) => b.t >= start && b.t < end);
    };
    const isDone = (date: string) => done.some((b) => b.date === date);

    // 1. Sessions that have started (first 5-minute bar printed): at-open calls and new signals
    const started = daily.filter((b) => now >= sessionBounds(inst, b.date).start + 5 * 60000 && b.date >= startDate).slice(-3);
    for (const b of started) {
      const ctx = buildContext(done, b.date);
      if (!ctx || !(ctx.adr > 0)) continue;
      const sb = barsOf(b.date);
      const open = sb.length ? sb[0].open : b.open;
      if (inst.market !== "crypto") {
        const odds = openOdds(done, ctx, open);
        addPred(makePrediction(b.date, inst, "O_G", odds.gapFills, now));
        addPred(makePrediction(b.date, inst, "O_C", odds.closesAbovePDC, now));
      }
      for (const s of signalsAtOpen(inst.market, ctx, open)) {
        const t = newTrade(inst.name, inst.market, b.date, s);
        if (!state.trades[t.id]) putTrade(t);
      }
    }

    // 2. Manage this instrument's unfinished trades
    for (const t of Object.values(state.trades)) {
      if (t.instrument !== inst.name || t.status === "closed" || t.status === "skipped") continue;
      putTrade(advanceTrade(t, barsOf(t.session), isDone(t.session)));
    }

    // 3. Score calls for finished sessions
    for (const p of Object.values(state.predictions)) {
      if (p.instrument !== inst.name || p.actual) continue;
      const i = done.findIndex((b) => b.date === p.session);
      if (i < 1) continue;
      const b = done[i], prev = done[i - 1];
      const ok = outcome(p.question, b, prev);
      const scored: Prediction = { ...p, actual: `O ${b.open.toFixed(2)} H ${b.high.toFixed(2)} L ${b.low.toFixed(2)} C ${b.close.toFixed(2)}` };
      if (p.result === "pending" && p.p !== null) scored.result = (p.p >= 0.5) === ok ? "hit" : "miss";
      putPred(scored);
    }

    // 4. Next session: night-before calls (only before it starts) and levels
    const last = done[done.length - 1];
    const nxt = nextSession(inst, last.date);
    const ctxN = buildContext(done, nxt);
    if (ctxN) {
      const odds = nightOdds(done, ctxN);
      if (now < sessionBounds(inst, nxt).start + nightCallGraceMs(inst)) {
        addPred(makePrediction(nxt, inst, "N_H", odds.highBreaks, now));
        addPred(makePrediction(nxt, inst, "N_L", odds.lowBreaks, now));
      }
      const trig: string[] = [];
      if (inst.market !== "crypto") trig.push(`GAPFADE if it opens above ${(ctxN.pdc + 0.5 * ctxN.adr).toFixed(2)} (sell) or below ${(ctxN.pdc - 0.5 * ctxN.adr).toFixed(2)} (buy)`);
      if (ctxN.clv > 0.9 || ctxN.clv < 0.1) trig.push(`XFADE ${ctxN.clv > 0.9 ? "SELL" : "BUY"} at the open (skipped on quiet / small-previous-day / Friday / Sunday sessions)`);
      levels.push({
        key: `${nxt}|${inst.name}`, session: nxt, instrument: inst.name, market: inst.market,
        pdh: ctxN.pdh, pdc: ctxN.pdc, pdl: ctxN.pdl, adr: ctxN.adr, clv: ctxN.clv,
        highBreaks: odds.highBreaks, lowBreaks: odds.lowBreaks,
        gapFillBand: inst.market === "crypto" ? "" : `${(ctxN.pdc - 0.25 * ctxN.adr).toFixed(2)} to ${(ctxN.pdc + 0.25 * ctxN.adr).toFixed(2)}`,
        triggers: trig.join("; ") || "none",
        lastPrice: intraday.length ? intraday[intraday.length - 1].close : last.close,
      });
    }
  }

  state.levels = levels;
  state.lastRun = new Date(now).toISOString();
  state.notes = notes;
  return { trades: [...changedTrades.values()], predictions: [...changedPreds.values()] };
}

export function emptyState(): BrainState {
  return { trades: {}, predictions: {}, levels: [], lastRun: null, notes: [] };
}

/** Session date of an instant for an instrument (used by the dashboard). */
export function todayFor(inst: Instrument, now = Date.now()): string {
  return dateIn(sessionTz(inst), now);
}
