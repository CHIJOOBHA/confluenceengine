/**
 * Trade review: every closed trade, explained. Kept forever with the trade.
 */
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { EngineView, PaperTrade } from "../types";
import type { Verdict } from "../core/review";
import { reviewsCsv } from "../core/learning";
import { Badge, Empty, PageHeader, Panel, RULE_NAME, VERDICT, dayLabel, MoneySum, moneyOf, moneyTxt, tone, won } from "../ui/kit";

export function downloadCsv(trades: PaperTrade[]) {
  const blob = new Blob(["﻿" + reviewsCsv(trades)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `roki-trade-reviews-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Reasons({ trades }: { trades: PaperTrade[] }) {
  const counts: Partial<Record<Verdict, number>> = {};
  for (const t of trades) if (t.review) counts[t.review.verdict] = (counts[t.review.verdict] || 0) + 1;
  const ks = (won: boolean) => (Object.keys(counts) as Verdict[]).filter((k) => VERDICT[k].won === won).sort((a, b) => counts[b]! - counts[a]!);
  const Col = ({ won }: { won: boolean }) => (
    <div className="p-4">
      <div className={`text-[13px] font-medium ${won ? "text-gain" : "text-loss"}`}>{won ? "Why trades won" : "Why trades lost"}</div>
      <ul className="mt-2 space-y-1.5">
        {ks(won).length ? ks(won).map((k) => (
          <li key={k} className="flex items-baseline gap-3 text-[14px]"><span className="num font-semibold w-6 text-right">{counts[k]}</span><span className="text-ink-2">{VERDICT[k].plural}</span></li>
        )) : <li className="text-[13px] text-ink-3">None in this view.</li>}
      </ul>
    </div>
  );
  return <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--line)]"><Col won /><Col won={false} /></div>;
}

function ReviewCard({ t }: { t: PaperTrade; key?: string }) {
  const r = t.review!, v = VERDICT[r.verdict], pnl = moneyOf(t).amount;
  const rows: [string, string][] = [["Why Roki took it", r.why], ["What the price did", r.happened], [v.won ? "Why it won" : "Why it lost", r.because], ["What it teaches", r.lesson]];
  return (
    <article className="panel">
      <header className="panel-head flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold">{t.instrument}</h3>
            {t.mode === "shadow" && <Badge>Learning only</Badge>}
          </div>
          <p className="text-[13px] text-ink-2">{t.side === 1 ? "Bought" : "Sold"} · {RULE_NAME[t.strategy] || t.strategy}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Badge kind={v.won ? "gain" : "loss"} dot>{v.label}</Badge>
          <span className={`text-[17px] font-semibold num ${tone(pnl)}`}>{moneyTxt(t)}</span>
        </div>
      </header>
      <dl className="grid md:grid-cols-2">
        {rows.map(([h, txt], i) => (
          <div key={h} className={`p-4 ${i % 2 === 0 ? "md:border-r" : ""} ${i < 2 ? "border-b" : i === 2 ? "border-b md:border-b-0" : ""} border-[var(--line)]`}>
            <dt className="text-[13px] font-medium">{h}</dt>
            <dd className="mt-1 text-[14px] text-ink-2 leading-relaxed max-w-[70ch]">{txt}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function Review({ view }: { view: EngineView }) {
  const [learning, setLearning] = useState(false);
  const shown = useMemo(() => view.trades.filter((t) => t.status === "closed" && t.review && (learning || t.mode === "active")), [view, learning]);
  const days = useMemo(() => [...new Set(shown.map((t) => t.session))].sort().reverse(), [shown]);
  const [day, setDay] = useState<string | null>(null);
  const sel = day && days.includes(day) ? day : days[0];
  const onDay = shown.filter((t) => t.session === sel).sort((a, b) => (b.retPct ?? 0) - (a.retPct ?? 0));

  return (
    <>
      <PageHeader title="Trade review" sub="Why Roki took each trade, what the price did next, why it won or lost, and what that teaches. Written from that day's real 5-minute prices and kept with the trade for good."
        actions={<>
          <label className="inline-flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer select-none mr-1">
            <input type="checkbox" className="w-4 h-4 accent-[var(--roki)]" checked={learning} onChange={(e) => setLearning(e.target.checked)} />Include learning-only
          </label>
          <button className="btn btn-secondary" onClick={() => downloadCsv(view.trades)}><Download />Download all</button>
        </>} />

      <Panel title={<>All {shown.length} reviewed {learning ? "" : "counted "}trades: <MoneySum trades={shown} /></>} flush className="mb-4">
        <Reasons trades={shown} />
      </Panel>

      {days.length ? (
        <>
          <div role="tablist" aria-label="Day" className="flex gap-2 overflow-x-auto pb-2 mb-2">
            {days.map((d) => {
              const xs = shown.filter((t) => t.session === d), on = d === sel;
              return (
                <button key={d} role="tab" aria-selected={on} onClick={() => setDay(d)}
                  className={`flex-none rounded-lg border px-3 py-2 text-left transition-colors ${on ? "border-roki bg-roki-soft" : "border-line bg-surface hover:border-line-strong"}`}>
                  <div className="text-[13px] font-medium">{dayLabel(d)}</div>
                  <div className="text-xs num"><MoneySum trades={xs} /><span className="text-ink-3"> · {xs.length} trade{xs.length > 1 ? "s" : ""}</span></div>
                </button>
              );
            })}
          </div>
          <p className="text-[13px] text-ink-2 mb-3">{dayLabel(sel, true)}: {onDay.filter(won).length} won, {onDay.filter((t) => !won(t)).length} lost, <span className="font-medium"><MoneySum trades={onDay} /></span>.</p>
          <div className="grid gap-3">{onDay.map((t) => <ReviewCard key={t.id} t={t} />)}</div>
        </>
      ) : <Panel><Empty title="No reviewed trades yet">Each trade is reviewed the moment it closes.</Empty></Panel>}
    </>
  );
}
