/**
 * Simulated trading days against a FAKE Dhan broker: checks the live executor's
 * order flow (option buying) without sending anything real.
 * Run: npx tsx scripts/live-sim.ts
 */
import { mirrorLive, Broker } from "../src/core/liveExecutor.js";
import { PaperTrade } from "../src/core/brain.js";

let n = 0; const log: string[] = []; const st: Record<string, { status: string; avgPrice: number | null }> = {};
type Opt = { rejectBuy?: boolean; failSell?: boolean; backstopHit?: boolean; premium?: number };
const fake = (o: Opt = {}): Broker => ({
  isConfigured: () => true,
  resolveOption: async (_s, type, price) => ({ securityId: "42", exchangeSegment: "NSE_FNO", tradingSymbol: `NIFTY-Oct2026-${Math.round(price / 50) * 50}-${type}`, lotSize: 65, strike: Math.round(price / 50) * 50, optionType: type }),
  marketOrder: async (ri, side, q) => {
    if (side === "SELL" && o.failSell) { log.push(`  SELL ${q} ${ri.tradingSymbol} -> FAILED`); return { ok: false, message: "simulated exchange error" }; }
    const id = `o${++n}`; st[id] = { status: side === "BUY" && o.rejectBuy ? "REJECTED" : "TRADED", avgPrice: side === "BUY" ? (o.premium ?? 140) : 175 };
    log.push(`  ${side} ${q} ${ri.tradingSymbol} -> ${id} ${st[id].status}`); return { ok: true, orderId: id, message: "accepted" };
  },
  stopOrder: async (ri, side, q, trig) => { const id = `s${++n}`; st[id] = { status: o.backstopHit ? "TRADED" : "PENDING", avgPrice: o.backstopHit ? trig : null }; log.push(`  STOP ${side} ${q} ${ri.tradingSymbol} @${trig} -> ${id}`); return { ok: true, orderId: id, message: "accepted" }; },
  orderState: async (id) => st[id] ?? { status: null, avgPrice: null },
  cancel: async (id) => { log.push(`  CANCEL ${id}`); if (st[id]) st[id].status = "CANCELLED"; return true; },
});
const ist = (hm: string, day = "2026-10-22") => Date.parse(`${day}T${hm}:00+05:30`);
const trade = (over: Partial<PaperTrade> = {}): PaperTrade => ({
  id: "2026-10-22|NIFTY|XFADE", session: "2026-10-22", instrument: "NIFTY", market: "IN index", strategy: "XFADE", mode: "active", side: -1,
  entryTime: ist("09:15"), entry: 22800, target: null, stop: 23130, status: "open", exitTime: null, exit: null, reason: "test", retPct: null,
  pnlInr: null, mtmPct: null, entryDelayBars: 0, stopDistance: 330, ...over });
const gate = { envEnabled: true, ownerEnabled: true, killSwitch: false };
async function day(title: string, steps: [string, Partial<PaperTrade>, typeof gate?][], b: Broker) {
  log.length = 0; const store: Record<string, PaperTrade> = {};
  for (const [hm, over, g] of steps) {
    const paper = { ...(store["2026-10-22|NIFTY|XFADE"] || trade()), ...trade(over), ...Object.fromEntries(Object.entries(store["2026-10-22|NIFTY|XFADE"] || {}).filter(([k]) => k.startsWith("broker"))) } as PaperTrade;
    log.push(`${hm} (paper: ${paper.status})`);
    const up = await mirrorLive([paper], store, g || gate, b, ist(hm), () => {}, 0);
    store[paper.id] = { ...paper, ...(up.find((u) => u.id === paper.id) || {}) };
    log.push(`  note: ${store[paper.id].brokerNote ?? "-"}`);
  }
  console.log(`\n## ${title}\n${log.join("\n")}`);
}
(async () => {
  await day("Normal day: sell signal -> buy PE at 9:20, hold, flatten at 3:10", [["09:20", {}], ["12:00", {}], ["15:12", {}], ["15:20", {}]], fake());
  await day("Brain closes the trade at its target at 11:05", [["09:20", {}], ["11:05", { status: "closed", exit: 22600 }]], fake());
  await day("Buy signal -> CE", [["09:20", { side: 1, stop: 22470 }]], fake());
  await day("Broker rejects the buy", [["09:20", {}], ["15:12", {}]], fake({ rejectBuy: true }));
  await day("Sell fails: backstop must be put back, retried next run", [["09:20", {}], ["15:12", {}], ["15:17", {}]], fake({ failSell: true }));
  await day("Backstop already hit at the broker", [["09:20", {}], ["15:12", {}]], fake({ backstopHit: true }));
  await day("Premium too expensive (Rs 300 x 65 = Rs 19,500)", [["09:20", {}]], fake({ premium: 300 }));
  await day("Entry 40 minutes old: not sent", [["09:55", {}]], fake());
  await day("Kill switch while holding: sold", [["09:20", {}], ["10:30", {}, { ...gate, killSwitch: true }]], fake());
  await day("Live switched off on the server: nothing sent", [["09:20", {}, { ...gate, envEnabled: false }]], fake());
  await day("Shadow trade: never sent", [["09:20", { mode: "shadow" }]], fake());
})();
