/**
 * ROKI - BRAIN CHECK (no silent changes)
 *
 * The brain's behaviour is summed up in one fingerprint: every rule, cost, paper size,
 * expectation and data-guard limit, plus what the rules and odds actually DO on a fixed,
 * made-up market (so a changed threshold inside the code shows up even if no constant
 * changed). The approved fingerprint lives in brainLock.ts.
 *
 * If the running brain doesn't match the approved one, Roki opens no new trades and says
 * so on the Overview page; predictions are still made and scored, open trades still close.
 * A change becomes official only by running `npx tsx scripts/brain-approve.ts "what changed"`,
 * which updates brainLock.ts and adds a line to research/brain-changes.md, so every change
 * to the brain is a visible, dated, explained commit. A GitHub check runs this on every push.
 */

import { advanceTrade, buildContext, COST, DailyBar, IntradayBar, Market, newTrade, nightOdds, openOdds, signalsAtOpen, STRATEGIES } from "./brain.js";
import { MARKETS } from "./markets.js";
import { EXPECTED, PRED_EXPECTED } from "./learning.js";
import { MAX_DAILY_MOVE } from "./dataGuard.js";
import { BRAIN_LOCK } from "./brainLock.js";

/** Deterministic made-up market: gaps, trends, quiet spells and extreme closes. */
function syntheticMarket(seed: number, n = 520): DailyBar[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out: DailyBar[] = [];
  let px = 1000, d = Date.UTC(2020, 0, 1);
  for (let i = 0; i < n; i++) {
    const wd = new Date(d).getUTCDay();
    if (wd === 0 || wd === 6) { d += 86400000; i--; continue; }
    const vol = 0.006 + 0.012 * rnd();
    const open = px * (1 + (rnd() - 0.5) * vol * 2.2);
    const hi = Math.max(open, px) * (1 + vol * rnd()), lo = Math.min(open, px) * (1 - vol * rnd());
    const close = lo + (hi - lo) * (rnd() < 0.15 ? (rnd() < 0.5 ? 0.02 : 0.98) : rnd());
    out.push({ date: new Date(d).toISOString().slice(0, 10), open, high: hi, low: lo, close });
    px = close; d += 86400000;
  }
  return out;
}

function intradayFor(b: DailyBar, startMs: number): IntradayBar[] {
  const bars: IntradayBar[] = [];
  const path = [b.open, b.open + (b.high - b.open) * 0.6, b.high, (b.high + b.low) / 2, b.low, b.close];
  for (let i = 0; i < 60; i++) {
    const k = (i / 59) * (path.length - 1), j = Math.min(path.length - 2, Math.floor(k));
    const p = path[j] + (path[j + 1] - path[j]) * (k - j), q = i ? bars[i - 1].close : b.open;
    bars.push({ t: startMs + i * 300000, open: q, high: Math.max(p, q), low: Math.min(p, q), close: p });
  }
  return bars;
}

function hash(str: string): string {
  // FNV-1a, two 32-bit lanes; works the same in Node and the browser
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
}

const r6 = (x: unknown): unknown =>
  typeof x === "number" ? Math.round(x * 1e6) / 1e6 : Array.isArray(x) ? x.map(r6) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).sort().map(([k, v]) => [k, r6(v)])) : x;

let cached: string | null = null;

/** The running brain's fingerprint (computed once per process). */
export function brainFingerprint(): string {
  if (cached) return cached;
  const parts: unknown[] = [STRATEGIES, COST, MARKETS, EXPECTED, PRED_EXPECTED, MAX_DAILY_MOVE];
  const markets: Market[] = ["IN index", "IN stock", "US stock", "commodity", "crypto"];
  markets.forEach((m, mi) => {
    const hist = syntheticMarket(17 + mi * 101);
    for (let i = 320; i < hist.length; i += 3) {
      const b = hist[i], ctx = buildContext(hist.slice(0, i), b.date);
      if (!ctx) continue;
      const sigs = signalsAtOpen(m, ctx, b.open);
      const trades = sigs.map((s) => {
        const t = advanceTrade(newTrade("X", m, b.date, s), intradayFor(b, Date.parse(`${b.date}T04:00:00Z`)), true);
        return [t.status, t.entry, t.exit, t.retPct, t.pnl];
      });
      parts.push([m, b.date, sigs.map((s) => [s.strategy, s.mode, s.side, s.target, s.stopDistance, s.trigger ?? null, s.entryDelayBars]), trades]);
      if (i % 15 === 2) parts.push([nightOdds(hist.slice(0, i), ctx), openOdds(hist.slice(0, i), ctx, b.open)]);
    }
  });
  cached = hash(JSON.stringify(r6(parts)));
  return cached;
}

export interface BrainStatus { fingerprint: string; approved: string; approvedAt: string; note: string; ok: boolean }

export function brainStatus(): BrainStatus {
  const fp = brainFingerprint();
  return { fingerprint: fp, approved: BRAIN_LOCK.fingerprint, approvedAt: BRAIN_LOCK.approvedAt, note: BRAIN_LOCK.note, ok: fp === BRAIN_LOCK.fingerprint };
}
