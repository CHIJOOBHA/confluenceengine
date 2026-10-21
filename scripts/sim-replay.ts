/**
 * Replays recent sessions through the real brain + simulator, every 5 minutes,
 * as if the app had been running live. Uses Yahoo data cut off at each moment.
 * Run: NODE_USE_ENV_PROXY=1 npx tsx scripts/sim-replay.ts 2026-10-19 2026-10-21
 */
import { runCycle, emptyState, Fetchers } from "../src/core/engineRunner.js";
import { INSTRUMENTS } from "../src/core/instruments.js";
import { fetchDaily, fetchIntraday } from "../src/services/marketData.js";
import { runSimulator } from "../src/sim/runSim.js";
import { newAccount } from "../src/sim/paperBroker.js";

const [from, to] = [process.argv[2] || "2026-10-19", process.argv[3] || "2026-10-21"];
const insts = INSTRUMENTS.filter((i) => i.dhan);
const cache: Record<string, { d: any; i: any }> = {};
(async () => {
  for (const s of [...insts.map((i) => i.symbol)]) cache[s] = { d: await fetchDaily(s), i: await fetchIntraday(s) };
  const vixD = (await fetchDaily("^INDIAVIX")).bars;
  let now = 0;
  const fetchers: Fetchers = {
    daily: async (s) => ({ ...cache[s].d, bars: cache[s].d.bars }),
    intraday: async (s) => ({ ...cache[s].i, bars: cache[s].i.bars.filter((b: any) => b.t + 5 * 60000 <= now) }),
  };
  const state = emptyState(); const acct = newAccount(100000);
  const days = [...new Set(cache["^NSEI"].i.bars.map((b: any) => new Date(b.t + 19800000).toISOString().slice(0, 10)))].filter((d: any) => d >= from && d <= to) as string[];
  for (const day of days) {
    const vix = vixD.filter((b) => b.date < day).slice(-1)[0]?.close ?? 15;
    for (let m = 9 * 60 + 20; m <= 15 * 60 + 35; m += 5) {
      now = Date.parse(`${day}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:30+05:30`);
      const t0 = Date.now(); const ch = await runCycle(state, now, fetchers, insts, from); if (m === 9 * 60 + 20) console.log(day, "one cycle took", Date.now() - t0, "ms");
      const { notes } = await runSimulator(acct, ch, state.trades, false, now, vix, null);
      for (const n of notes) console.log(`${day} ${new Date(now + 19800000).toISOString().slice(11, 16)} ${n}`);
    }
  }
  console.log("\n== Brain trades (active, Indian)");
  for (const t of Object.values(state.trades).filter((t) => t.mode === "active" && insts.some((i) => i.name === t.instrument)))
    console.log(`${t.session} ${t.instrument} ${t.strategy} ${t.side === 1 ? "BUY" : "SELL"} ${t.status} index ret ${t.retPct?.toFixed(2) ?? "-"}% | sim: ${(acct.links[t.id] as any)?.brokerNote ?? "-"}`);
  console.log("\n== Order book");
  for (const o of acct.orders) console.log(`${new Date(o.at + 19800000).toISOString().slice(0, 16).replace("T", " ")} ${o.kind.padEnd(10)} ${o.side.padEnd(4)} ${String(o.qty).padStart(4)} ${o.symbol.padEnd(34)} ${o.status.padEnd(9)} ${o.price ?? ""} charges ${o.charges ?? 0} | ${o.note}`);
  console.log(`\n== Account: start Rs ${acct.startingCapital}, cash Rs ${acct.cash.toFixed(0)}, realised before charges Rs ${acct.realised.toFixed(0)}, charges Rs ${acct.charges.toFixed(0)}, open positions ${Object.keys(acct.positions).length}`);
})();
