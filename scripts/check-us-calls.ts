/** Walk-forward: Indian night-before calls with and without the overnight US move, using the engine's own code. */
import { buildContext, nightOdds, usMoveFrom } from "../src/core/brain.js";
import { fetchDaily } from "../src/services/marketData.js";
(async () => {
  const sp = (await fetchDaily("^GSPC", "10y")).bars; const us = usMoveFrom(sp);
  for (const sym of ["^NSEI", "^BSESN", "^NSEBANK"]) {
    const d = (await fetchDaily(sym, "10y")).bars;
    const tally = { old: { n: 0, ok: 0, b: 0, m: 0 }, neu: { n: 0, ok: 0, b: 0, m: 0 } };
    for (let i = 600; i < d.length; i += 1) {
      const ctx = buildContext(d.slice(0, i), d[i].date); if (!ctx) continue;
      const hist = d.slice(0, i), y = d[i - 1], b = d[i];
      const brk = [b.high >= y.high, b.low <= y.low];
      for (const [k, o] of [["old", nightOdds(hist, ctx)], ["neu", nightOdds(hist, ctx, us)]] as const) {
        [o.highBreaks, o.lowBreaks].forEach((p, j) => {
          if (p === null) return; const t = tally[k]; t.m++; t.b += (p - (brk[j] ? 1 : 0)) ** 2;
          if (p >= 0.6 || p <= 0.4) { t.n++; if ((p >= 0.5) === brk[j]) t.ok++; }
        });
      }
    }
    const f = (t: typeof tally.old) => `calls ${t.n}, right ${(100 * t.ok / t.n).toFixed(1)}%, Brier ${(t.b / t.m).toFixed(3)}`;
    console.log(sym.padEnd(9), "before:", f(tally.old), "| with US move:", f(tally.neu));
    await new Promise((r) => setTimeout(r, 1000));
  }
})();
