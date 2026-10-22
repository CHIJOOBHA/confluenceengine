/**
 * Detail pages: Predictions, Trades, Levels, Rules & safety.
 */
import { useMemo, useState } from "react";
import type { EngineView, PaperTrade, Prediction } from "../types";
import { PRED_EXPECTED } from "../core/learning";
import { Badge, Empty, MARKET_NAME, PageHeader, Panel, RULE_NAME, TableWrap, VERDICT, dateTimeIST, dayLabel, inr, MoneySum, moneyTxt, price, share, tone } from "../ui/kit";
import { brainStatus } from "../core/brainCheck";
import { callSentence } from "./Overview";

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`h-7 px-3 rounded-[5px] text-[13px] font-medium ${value === v ? "bg-sunken text-ink shadow-[0_1px_2px_rgb(16_24_40/.06)]" : "text-ink-2 hover:text-ink"}`}>{l}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Predictions
export function Predictions({ view }: { view: EngineView }) {
  const scored = view.predictions.filter((p) => p.result === "hit" || p.result === "miss");
  const lv = (i: string, s: string) => view.levels.find((l) => l.instrument === i && l.session === s);
  const rows = useMemo(() => {
    const m = new Map<string, { q: string; market: string; hits: number; n: number }>();
    for (const p of scored) {
      const k = `${p.question}|${p.market}`;
      const r = m.get(k) ?? { q: p.question, market: p.market, hits: 0, n: 0 };
      r.n++; if (p.result === "hit") r.hits++; m.set(k, r);
    }
    return [...m.values()].sort((a, b) => a.q.localeCompare(b.q) || b.n - a.n);
  }, [scored]);
  const log = view.predictions.filter((p) => p.result !== "no-call" && p.call);
  return (
    <>
      <PageHeader title="Predictions" sub="Roki calls a level only when history gives 60% or more either way, and checks every call against the real session." />
      <Panel title="Scorecard" sub="Live hit rate against 5 years of walk-forward testing." flush className="mb-4">
        {rows.length ? (
          <TableWrap>
            <table className="tbl">
              <thead><tr><th>Question</th><th>Market</th><th className="r">Checked</th><th className="r">Right</th><th className="r">In testing</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={`${r.q}|${r.market}`}>
                  <td>{PRED_EXPECTED[r.q]?.[2] ?? r.q}</td><td className="muted">{MARKET_NAME[r.market] || r.market}</td>
                  <td className="r">{r.n}</td><td className="r font-medium">{share(r.hits, r.n)}</td>
                  <td className="r muted">{PRED_EXPECTED[r.q] ? `${Math.round(PRED_EXPECTED[r.q][0] * 100)}–${Math.round(PRED_EXPECTED[r.q][1] * 100)}%` : "—"}</td>
                </tr>))}</tbody>
            </table>
          </TableWrap>
        ) : <Empty title="No calls checked yet" />}
      </Panel>
      <Panel title="Every call" flush>
        <TableWrap max="max-h-[640px]">
          <table className="tbl">
            <thead><tr><th>Day</th><th>Market</th><th>Prediction</th><th className="r">Confidence</th><th className="r">Result</th><th>What happened</th></tr></thead>
            <tbody>{log.map((p: Prediction) => { const s = callSentence(p, lv(p.instrument, p.session)); return (
              <tr key={p.key}>
                <td className="whitespace-nowrap muted">{dayLabel(p.session)}</td><td className="font-medium whitespace-nowrap">{p.instrument}</td><td>{s.text}</td>
                <td className="r">{s.sure}%</td>
                <td className="r">{p.result === "hit" ? <Badge kind="gain">Right</Badge> : p.result === "miss" ? <Badge kind="loss">Wrong</Badge> : <Badge>Waiting</Badge>}</td>
                <td className="text-xs muted whitespace-nowrap num">{p.actual || "—"}</td>
              </tr>); })}</tbody>
          </table>
        </TableWrap>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Brain version
function BrainVersion() {
  const b = useMemo(() => brainStatus(), []);
  return (
    <section className="panel p-4 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
      <Badge kind={b.ok ? "gain" : "loss"} dot>{b.ok ? "Approved brain" : "Unapproved change"}</Badge>
      <span className="text-[13px] text-ink-2">Version <span className="num font-medium text-ink">{b.fingerprint}</span>{b.ok ? <> · approved {b.approvedAt}: {b.note}</> : <> · approved version is {b.approved}</>}</span>
      <span className="text-[12px] text-ink-3 basis-full">Every rule, cost and limit is fingerprinted. Any change, even one number, needs a recorded approval before Roki trades on it.</span>
    </section>
  );
}

// ---------------------------------------------------------------- Trades
export function Trades({ view }: { view: EngineView }) {
  const [mode, setMode] = useState<"active" | "shadow" | "all">("active");
  const [state, setState] = useState<"closed" | "open">("closed");
  const xs = view.trades
    .filter((t) => (mode === "all" || t.mode === mode) && (state === "closed" ? t.status === "closed" : t.status === "open" || t.status === "pending"))
    .sort((a, b) => b.session.localeCompare(a.session) || (b.exitTime || 0) - (a.exitTime || 0));
  return (
    <>
      <PageHeader title="Trades" sub="Every paper trade with its entry, exit and result, costs included. Indian trades are ₹1 lakh each, in rupees; US, gold, oil and crypto trades are $1,000 each, in dollars."
        actions={<>
          <Segmented value={state} onChange={setState} options={[["closed", "Closed"], ["open", "Open & waiting"]]} />
          <Segmented value={mode} onChange={setMode} options={[["active", "Counted"], ["shadow", "Learning"], ["all", "All"]]} />
        </>} />
      <Panel title={state === "closed" ? <>{xs.length} trades · <MoneySum trades={xs} /></> : `${xs.length} trades`} flush>
        {xs.length ? <TradeTable trades={xs} /> : <Empty title="No trades in this view" />}
      </Panel>
    </>
  );
}

function TradeTable({ trades }: { trades: PaperTrade[] }) {
  return (
    <TableWrap max="max-h-[70vh]">
      <table className="tbl">
        <thead><tr><th>Day</th><th>Market</th><th>Rule</th><th>Side</th><th className="r">Entry</th><th className="r">Exit</th><th>Outcome</th><th className="r">Return</th><th className="r">Result</th><th>Broker</th></tr></thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} title={t.reason}>
              <td className="whitespace-nowrap muted">{dayLabel(t.session)}</td>
              <td className="font-medium whitespace-nowrap">{t.instrument}{t.mode === "shadow" && <div className="text-xs text-ink-3 font-normal">Learning only</div>}</td>
              <td className="whitespace-nowrap">{RULE_NAME[t.strategy] || t.strategy}</td>
              <td>{t.side === 1 ? "Buy" : "Sell"}</td>
              <td className="r">{t.status === "pending" ? <span className="text-ink-3">{t.trigger != null ? `at ${price(t.trigger)}` : "at open"}</span> : price(t.entry)}</td>
              <td className="r">{t.exit !== null ? <>{price(t.exit)}<div className="text-xs text-ink-3">{dateTimeIST(t.exitTime)}</div></> : <span className="text-ink-3">{t.status === "open" ? `stop ${price(t.stop)}` : "—"}</span>}</td>
              <td className="whitespace-nowrap">{t.review ? <Badge kind={VERDICT[t.review.verdict].won ? "gain" : "loss"}>{VERDICT[t.review.verdict].label}</Badge> : <Badge>{t.status === "pending" ? "Waiting" : t.status === "open" ? "Open" : "Closed"}</Badge>}</td>
              <td className={`r ${tone(t.retPct ?? t.mtmPct)}`}>{t.retPct !== null ? `${t.retPct > 0 ? "+" : ""}${t.retPct.toFixed(2)}%` : t.mtmPct !== null ? `${t.mtmPct > 0 ? "+" : ""}${t.mtmPct.toFixed(2)}%` : "—"}</td>
              <td className={`r font-medium ${tone(t.retPct)}`}>{t.retPct !== null ? moneyTxt(t) : "—"}</td>
              <td className="text-xs muted max-w-[220px]">{t.brokerNote || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

// ---------------------------------------------------------------- Levels
export function Levels({ view }: { view: EngineView }) {
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  return (
    <>
      <PageHeader title="Levels" sub="For each market's next session: yesterday's high, close and low, the size of a normal day, and how often each level broke in similar past situations." />
      <Panel flush>
        {view.levels.length ? (
          <TableWrap max="max-h-[75vh]">
            <table className="tbl">
              <thead><tr><th>Market</th><th>Session</th><th className="r">Yesterday's high</th><th className="r">Close</th><th className="r">Low</th><th className="r">Normal day</th><th className="r">High breaks</th><th className="r">Low breaks</th><th>Trade triggers</th></tr></thead>
              <tbody>{view.levels.map((l) => (
                <tr key={l.key}>
                  <td className="font-medium whitespace-nowrap">{l.instrument}<div className="text-xs text-ink-3 font-normal">{MARKET_NAME[l.market] || l.market}</div></td>
                  <td className="whitespace-nowrap muted">{dayLabel(l.session)}</td>
                  <td className="r">{price(l.pdh)}</td><td className="r">{price(l.pdc)}</td><td className="r">{price(l.pdl)}</td><td className="r muted">{price(l.adr)}</td>
                  <td className="r">{pct(l.highBreaks)}</td><td className="r">{pct(l.lowBreaks)}</td>
                  <td className="text-[13px] muted min-w-[260px]">{l.triggers || "—"}</td>
                </tr>))}</tbody>
            </table>
          </TableWrap>
        ) : <Empty title="Levels appear after the next engine run" />}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Rules & safety
export function Rules({ view }: { view: EngineView }) {
  const r = view.risk;
  return (
    <>
      <PageHeader title="Rules & safety" sub="Only rules that made money in both halves of 5 years of testing are counted. Everything that failed testing stays out of the engine." />
      <BrainVersion />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Rules Roki trades" flush>
          <ul className="divide-y divide-[var(--line)]">
            {Object.entries(view.strategies).map(([id, s]) => (
              <li key={id} className="p-4">
                <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold">{RULE_NAME[id] || id}</span>
                  {s.activeMarkets.length ? s.activeMarkets.map((m) => <Badge key={m} kind="brand">{MARKET_NAME[m] || m}</Badge>) : <Badge>Learning only</Badge>}</div>
                <p className="mt-1.5 text-[14px] text-ink-2 max-w-[75ch]">{s.description}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Safety">
          <ul className="space-y-3 text-[14px] text-ink-2">
            <li><span className="text-ink font-medium">Paper money only.</span> Real orders need four things at once: live trading switched on at the server, broker keys on the server, your “Go live” click, and the kill switch off.</li>
            <li>Only counted trades in Indian indices and stocks could ever be sent; US stocks, commodities and crypto stay on paper.</li>
            <li>A live order would buy {r.optionLots} lot of the at-the-money option (CE for a buy, PE for a sell) and sell it when Roki closes the trade or at 3:10 pm.</li>
            <li>Limits: premium up to {inr(r.maxPremiumPerTradeInr, false)} a trade · option stop at −{r.optionBackstopPct}% · {r.maxLiveTradesPerDay} live trade a day · no new trades after a {inr(r.dailyLossLimitInr, false)} loss.</li>
            <li className="text-[13px] text-ink-3">Paper results are research on small samples. Nothing here is investment advice.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
