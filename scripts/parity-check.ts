/**
 * Parity check: run the TypeScript brain on saved CSV data at a fixed time and
 * write its trades and predictions as JSON, to compare with the Python research
 * engine run on the same data.
 * Usage: npx tsx scripts/parity-check.ts DATA_DIR NOW_ISO START_DATE OUT.json
 */
import fs from "fs";
import { runCycle, emptyState, Fetchers } from "../src/core/engineRunner.js";
import { INSTRUMENTS } from "../src/core/instruments.js";

const [dir, nowIso, start, out] = process.argv.slice(2);
const csv = (f: string) => {
  const [head, ...lines] = fs.readFileSync(f, "utf8").trim().split("\n");
  const cols = head.split(",");
  return lines.map((l) => { const v = l.split(","); const o: any = {}; cols.forEach((c, i) => (o[c || "idx"] = v[i])); return o; });
};
const fetchers: Fetchers = {
  daily: async (s) => {
    const f = `${dir}/${s}_1d.csv`;
    if (!fs.existsSync(f)) throw new Error("no file");
    const bars = csv(f).filter((r) => r.open && r.high && r.low && r.close).map((r) => ({ date: String(r.Date ?? r.idx).slice(0, 10), open: +r.open, high: +r.high, low: +r.low, close: +r.close }))
      .filter((b) => b.high >= b.low && b.open > 0);
    return { tz: "", bars };
  },
  intraday: async (s) => {
    const f = `${dir}/${s}_5m.csv`;
    const bars = csv(f).filter((r) => r.open && r.close).map((r) => ({ t: Date.parse(String(r.Datetime ?? r.idx).replace(" ", "T")), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
    return { tz: "", bars };
  },
};
const state = emptyState();
const now = Date.parse(nowIso.endsWith("Z") ? nowIso : nowIso + "Z");
runCycle(state, now, fetchers, INSTRUMENTS.filter((i) => i.name !== "SILVER"), start).then(() => {
  fs.writeFileSync(out, JSON.stringify(state, null, 1));
  console.log("trades", Object.keys(state.trades).length, "predictions", Object.keys(state.predictions).length, "levels", state.levels.length, "notes", state.notes);
});
