/** Prints the review of every trade closed since a date, on real data. Run: NODE_USE_ENV_PROXY=1 npx tsx scripts/review-check.ts 2026-10-19 */
import { runCycle, emptyState } from "../src/core/engineRunner.js";
import { money, fmtMoney } from "../src/core/markets.js";
import { INSTRUMENTS } from "../src/core/instruments.js";
import fs from "fs";
const from = process.argv[2] || "2026-10-19";
(async () => {
  const state = emptyState();
  await runCycle(state, Date.now(), undefined, INSTRUMENTS, from);
  const closed = Object.values(state.trades).filter((t) => t.status === "closed").sort((a, b) => a.session.localeCompare(b.session));
  const tally: Record<string, number> = {};
  for (const t of closed) {
    const r = t.review; tally[r?.verdict ?? "NO REVIEW"] = (tally[r?.verdict ?? "NO REVIEW"] || 0) + 1;
    if (process.argv[3] === "brief") continue;
    console.log(`\n### ${t.session} ${t.instrument} ${t.strategy} ${t.mode} ${t.side === 1 ? "BUY" : "SELL"} → ${fmtMoney(money(t).amount, money(t).ccy)} [${r?.verdict}]`);
    if (r) console.log(`WHY: ${r.why}\nHAPPENED: ${r.happened}\nBECAUSE: ${r.because}\nLESSON: ${r.lesson}`);
  }
  console.log("\n", closed.length, "closed trades", tally);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify({ trades: Object.values(state.trades), predictions: Object.values(state.predictions), levels: state.levels }));
})();
