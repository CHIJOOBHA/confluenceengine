/**
 * Do Roki's counted rules still make money after each market's real costs?
 * Daily-bar replay of the engine's own signals (open entry, 1 ADR stop, target where the
 * rule has one, exit at the close; if stop and target both fall inside a day, the stop
 * counts first). Prints gross average per trade, then net at the old and the new costs.
 * Usage: NODE_USE_ENV_PROXY=1 npx tsx scripts/cost-check.ts
 */
import { buildContext, signalsAtOpen, STRATEGIES, Market, DailyBar } from "../src/core/brain.js";
import { INSTRUMENTS } from "../src/core/instruments.js";
import { MARKETS } from "../src/core/markets.js";
import { fetchDaily } from "../src/services/marketData.js";

const OLD: Record<Market, number> = { "IN index": 0.0003, "IN stock": 0.0006, "US index": 0.0002, "US stock": 0.0002, commodity: 0.0003, crypto: 0.001 };

type Acc = { n: number; sum: number; sq: number; nRecent: number; sumRecent: number };
const acc: Record<string, Acc> = {};

function tradeReturn(side: 1 | -1, open: number, b: DailyBar, stopD: number, target: number | null): number {
  const stop = open - side * stopD;
  const hitStop = side === 1 ? b.low <= stop : b.high >= stop;
  if (hitStop) return (side * (stop - open)) / open;
  if (target !== null) {
    const hitT = side === 1 ? b.high >= target : b.low <= target;
    if (hitT && side * (target - open) > 0) return (side * (target - open)) / open;
  }
  return (side * (b.close - open)) / open;
}

(async () => {
  for (const inst of INSTRUMENTS) {
    const d = (await fetchDaily(inst.symbol, "5y")).bars;
    for (let i = 60; i < d.length; i++) {
      const ctx = buildContext(d.slice(0, i), d[i].date); if (!ctx) continue;
      for (const s of signalsAtOpen(inst.market, ctx, d[i].open)) {
        if (s.mode !== "active" || s.trigger != null) continue; // BREAKOUT needs intraday order, checked live
        const r = tradeReturn(s.side, d[i].open, d[i], s.stopDistance, s.target);
        const k = `${s.strategy}|${inst.market}`;
        const a = (acc[k] ??= { n: 0, sum: 0, sq: 0, nRecent: 0, sumRecent: 0 });
        a.n++; a.sum += r; a.sq += r * r;
        if (d[i].date >= "2024-07-01") { a.nRecent++; a.sumRecent += r; }
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log("rule|market            trades  gross/trade  net(old cost)  net(new cost)  since Jul-24 net(new)  t(new)");
  for (const [k, a] of Object.entries(acc).sort()) {
    const m = k.split("|")[1] as Market;
    const g = a.sum / a.n, sd = Math.sqrt(a.sq / a.n - g * g), nw = g - MARKETS[m].cost;
    const t = nw / (sd / Math.sqrt(a.n));
    const pc = (x: number) => `${(x * 100 >= 0 ? "+" : "")}${(x * 100).toFixed(3)}%`.padStart(9);
    console.log(k.padEnd(22), String(a.n).padStart(6), pc(g).padStart(12), pc(g - OLD[m]).padStart(14), pc(nw).padStart(14),
      pc(a.sumRecent / Math.max(a.nRecent, 1) - MARKETS[m].cost).padStart(22), t.toFixed(2).padStart(7));
  }
  void STRATEGIES;
})();
