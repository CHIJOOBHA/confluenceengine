/**
 * Builds the data package for one day's Roki video, straight from the engine on real prices.
 * Run: NODE_USE_ENV_PROXY=1 npx tsx scripts/video-data.ts <india|global> <YYYY-MM-DD> <out.json> [startDate]
 * Everything a script may say comes from this file, and the script checker compares against it.
 */
import fs from "fs";
import { runCycle, emptyState } from "../src/core/engineRunner.js";
import { INSTRUMENTS, sessionBounds, START_DATE } from "../src/core/instruments.js";
import { fetchDaily, fetchIntraday } from "../src/services/marketData.js";
import { buildLearning } from "../src/core/learning.js";
import { buildResearch } from "../src/core/research.js";
import type { PaperTrade } from "../src/core/brain.js";

const [group, date, out, start] = [process.argv[2] as "india" | "global", process.argv[3], process.argv[4], process.argv[5] || START_DATE];
const MARKETS = group === "india" ? ["IN index", "IN stock"] : ["US index", "US stock", "commodity", "crypto"];
const inGroup = (m: string) => MARKETS.includes(m);
const sum = (xs: PaperTrade[]) => xs.reduce((s, t) => s + (t.pnlInr ?? 0), 0);

(async () => {
  const state = emptyState();
  await runCycle(state, Date.now(), undefined, INSTRUMENTS, start);
  const trades = Object.values(state.trades), preds = Object.values(state.predictions);
  const closed = trades.filter((t) => t.status === "closed");
  const counted = closed.filter((t) => t.mode === "active");
  const day = closed.filter((t) => t.session === date && inGroup(t.market));
  const dayCounted = day.filter((t) => t.mode === "active").sort((a, b) => (b.pnlInr ?? 0) - (a.pnlInr ?? 0));
  const dayPreds = preds.filter((p) => p.session === date && inGroup(p.market) && (p.result === "hit" || p.result === "miss"));
  const L = buildLearning(trades, preds);
  const R = buildResearch(trades, preds);
  const groupCounted = counted.filter((t) => inGroup(t.market));
  const scoredAll = preds.filter((p) => p.result === "hit" || p.result === "miss");

  // charts: the best and worst counted trades of the day, and the group's lead market
  const want = new Set<string>();
  if (dayCounted[0]) want.add(dayCounted[0].instrument);
  if (dayCounted.length > 1) want.add(dayCounted[dayCounted.length - 1].instrument);
  want.add(group === "india" ? "NIFTY" : "BTC");
  const charts: Record<string, unknown> = {};
  for (const name of want) {
    const inst = INSTRUMENTS.find((i) => i.name === name)!;
    const { start: s, end: e } = sessionBounds(inst, date);
    const bars = (await fetchIntraday(inst.symbol, "5d", "5m")).bars.filter((b) => b.t >= s && b.t < e);
    const daily = (await fetchDaily(inst.symbol, "3mo")).bars;
    const prev = daily.filter((b) => b.date < date).pop();
    const lv = state.levels.find((l) => l.instrument === name);
    const tradesHere = day.filter((t) => t.instrument === name && t.mode === "active").map((t) => ({ side: t.side, entry: t.entry, entryTime: t.entryTime, exit: t.exit, exitTime: t.exitTime, pnlInr: t.pnlInr, strategy: t.strategy }));
    charts[name] = { name, market: inst.market, bars, pdh: prev?.high, pdl: prev?.low, pdc: prev?.close, pdo: prev?.open, adr: lv?.adr ?? null, trades: tradesHere };
    await new Promise((r) => setTimeout(r, 800));
  }

  const pkg = {
    group, date, builtAt: new Date().toISOString(),
    day: {
      counted: dayCounted, learning: day.filter((t) => t.mode === "shadow"),
      totalInr: sum(dayCounted), wins: dayCounted.filter((t) => (t.pnlInr ?? 0) > 0).length,
      predictions: dayPreds.map((p) => ({ instrument: p.instrument, question: p.question, p: p.p, result: p.result, actual: p.actual })),
      predRight: dayPreds.filter((p) => p.result === "hit").length,
      study: R.studies.find((s) => s.date === date) ?? null,
    },
    sinceStart: {
      firstDay: counted.map((t) => t.session).sort()[0] ?? null,
      groupTotalInr: sum(groupCounted), groupTrades: groupCounted.length, groupWins: groupCounted.filter((t) => (t.pnlInr ?? 0) > 0).length,
      allTotalInr: sum(counted), allTrades: counted.length, allWins: counted.filter((t) => (t.pnlInr ?? 0) > 0).length,
      predRight: scoredAll.filter((p) => p.result === "hit").length, predScored: scoredAll.length,
    },
    research: R.items, scores: L.scores, checks: L.checks, proposals: L.proposals,
    charts,
  };
  fs.writeFileSync(out, JSON.stringify(pkg, null, 1));
  console.log(group, date, "counted", dayCounted.length, "total", Math.round(pkg.day.totalInr), "preds", pkg.day.predRight + "/" + dayPreds.length, "charts", [...want].join(","));
})();
