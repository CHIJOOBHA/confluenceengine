/**
 * Builds the data package for one day's Roki video, straight from the engine on real prices.
 * Run: NODE_USE_ENV_PROXY=1 npx tsx scripts/video-data.ts <india|global> <YYYY-MM-DD> <out.json> [startDate] [--replay] [--chart=NVDA,GOLD]
 * --replay: the day is replayed through the same rules with only the data known at the time
 * (used for the India video, which by SEBI's 30-day rule may only discuss price data 30+ days old).
 * Research, scorecards and running totals always come from the live paper record.
 * Everything a script may say comes from this file, and the script checker compares against it.
 */
import fs from "fs";
import { runCycle, emptyState } from "../src/core/engineRunner.js";
import { INSTRUMENTS, sessionBounds, START_DATE } from "../src/core/instruments.js";
import { fetchDaily, fetchIntraday } from "../src/services/marketData.js";
import { buildLearning } from "../src/core/learning.js";
import { buildResearch } from "../src/core/research.js";
import type { PaperTrade } from "../src/core/brain.js";
import { money, MARKETS as SPEC } from "../src/core/markets.js";

const args = process.argv.slice(2).filter((a) => a !== "--replay" && !a.startsWith("--chart="));
const EXTRA_CHARTS = process.argv.filter((a) => a.startsWith("--chart=")).flatMap((a) => a.slice(8).split(","));
const REPLAY = process.argv.includes("--replay");
const [group, date, out, start] = [args[0] as "india" | "global", args[1], args[2], args[3] || START_DATE];
const MARKETS = group === "india" ? ["IN index", "IN stock"] : ["US index", "US stock", "commodity", "crypto"];
const inGroup = (m: string) => MARKETS.includes(m);
// India is booked in rupees (₹1 lakh a trade); every Global market (US stocks, S&P 500, gold, silver, oil, crypto) in US dollars ($1,000 a trade).
const CCY = group === "india" ? "INR" : "USD";
const amt = (t: PaperTrade) => money(t).amount;
const sum = (xs: PaperTrade[]) => xs.reduce((s, t) => s + amt(t), 0);
const isWin = (t: PaperTrade) => (t.retPct ?? 0) > 0;
const withMoney = (t: PaperTrade) => ({ ...t, pnl: Math.round(amt(t) * 100) / 100, ccy: money(t).ccy, pnlInr: undefined });

(async () => {
  const state = emptyState();
  await runCycle(state, Date.now(), undefined, INSTRUMENTS, start);
  const trades = Object.values(state.trades), preds = Object.values(state.predictions);
  const closed = trades.filter((t) => t.status === "closed");
  const counted = closed.filter((t) => t.mode === "active");

  // The day itself: live record, or a replay with only the data available at the time
  let dayTrades = trades, dayPredsAll = preds;
  if (REPLAY) {
    const insts = INSTRUMENTS.filter((i) => inGroup(i.market));
    const cache: Record<string, { d: any; i: any }> = {};
    for (const i of insts) { cache[i.symbol] = { d: await fetchDaily(i.symbol, "5y"), i: await fetchIntraday(i.symbol, "60d", "5m") }; await new Promise((r) => setTimeout(r, 600)); }
    const asOf = Date.parse(`${date}T23:59:00Z`) + 86400000; // the morning after, so the session is complete
    const rs = emptyState();
    await runCycle(rs, asOf, { daily: async (sym) => cache[sym].d, intraday: async (sym) => ({ ...cache[sym].i, bars: cache[sym].i.bars.filter((b: any) => b.t + 300000 <= asOf) }) }, insts, date);
    dayTrades = Object.values(rs.trades); dayPredsAll = Object.values(rs.predictions);
  }
  const day = dayTrades.filter((t) => t.status === "closed" && t.session === date && inGroup(t.market));
  const dayCounted = day.filter((t) => t.mode === "active").sort((a, b) => (b.retPct ?? 0) - (a.retPct ?? 0));
  const dayPreds = dayPredsAll.filter((p) => p.session === date && inGroup(p.market) && (p.result === "hit" || p.result === "miss"));
  const L = buildLearning(trades, preds);
  const R = buildResearch(trades, preds);
  const groupCounted = counted.filter((t) => inGroup(t.market));
  const scoredAll = preds.filter((p) => p.result === "hit" || p.result === "miss");

  // charts: the best and worst counted trades of the day, and the group's lead market
  const want = new Set<string>();
  if (dayCounted[0]) want.add(dayCounted[0].instrument);
  if (dayCounted.length > 1) want.add(dayCounted[dayCounted.length - 1].instrument);
  want.add(group === "india" ? "NIFTY" : "BTC");
  for (const n of EXTRA_CHARTS) want.add(n); // --chart=NVDA,GOLD: a trade the script tells as the story
  const charts: Record<string, unknown> = {};
  for (const name of want) {
    const inst = INSTRUMENTS.find((i) => i.name === name)!;
    const { start: s, end: e } = sessionBounds(inst, date);
    const bars = (await fetchIntraday(inst.symbol, REPLAY ? "60d" : "5d", "5m")).bars.filter((b) => b.t >= s && b.t < e);
    const daily = (await fetchDaily(inst.symbol, "6mo")).bars;
    const prev = daily.filter((b) => b.date < date).pop();
    const lv = state.levels.find((l) => l.instrument === name);
    const tradesHere = day.filter((t) => t.instrument === name && t.mode === "active").map((t) => ({ side: t.side, entry: t.entry, entryTime: t.entryTime, exit: t.exit, exitTime: t.exitTime, pnl: amt(t), ccy: money(t).ccy, strategy: t.strategy }));
    charts[name] = { name, market: inst.market, bars, pdh: prev?.high, pdl: prev?.low, pdc: prev?.close, pdo: prev?.open, adr: lv?.adr ?? null, trades: tradesHere };
    await new Promise((r) => setTimeout(r, 800));
  }

  const pkg = {
    group, date, replay: REPLAY, builtAt: new Date().toISOString(),
    currency: CCY, paperSize: group === "india" ? SPEC["IN stock"].paperSize : SPEC["US stock"].paperSize,
    costs: Object.fromEntries(Object.entries(SPEC).filter(([m]) => inGroup(m)).map(([m, s]) => [m, { roundTripPct: s.cost * 100, note: s.costNote, hoursIST: s.hoursIST, sizing: s.sizing }])),
    day: {
      counted: dayCounted.map(withMoney), learning: day.filter((t) => t.mode === "shadow").map(withMoney),
      total: sum(dayCounted), wins: dayCounted.filter(isWin).length,
      predictions: dayPreds.map((p) => ({ instrument: p.instrument, question: p.question, p: p.p, result: p.result, actual: p.actual })),
      predRight: dayPreds.filter((p) => p.result === "hit").length,
      study: R.studies.find((s) => s.date === date) ?? null,
    },
    sinceStart: {
      firstDay: counted.map((t) => t.session).sort()[0] ?? null,
      // the group's own currency only; India and Global are never added together
      groupTotal: sum(groupCounted), groupTrades: groupCounted.length, groupWins: groupCounted.filter(isWin).length,
      allTrades: counted.length, allWins: counted.filter(isWin).length,
      predRight: scoredAll.filter((p) => p.result === "hit").length, predScored: scoredAll.length,
    },
    research: R.items, scores: L.scores, checks: L.checks, proposals: L.proposals,
    charts,
  };
  fs.writeFileSync(out, JSON.stringify(pkg, null, 1));
  console.log(group, date, "counted", dayCounted.length, "total", CCY, pkg.day.total.toFixed(2), "preds", pkg.day.predRight + "/" + dayPreds.length, "charts", [...want].join(","));
})();
