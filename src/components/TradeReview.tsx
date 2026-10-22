/**
 * Trade review: every closed trade, day by day. Why Roki took it, what the price
 * did, why it won or lost, and what it teaches. Counted trades first; learning-only
 * trades behind a switch.
 */
import { useMemo, useState } from "react";
import type { EngineView, PaperTrade } from "../types";
import type { Verdict } from "../core/review";
import { RULE_NAME } from "./SimpleHome";

const rs = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}₹${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export const VERDICT: Record<Verdict, { label: string; won: boolean; plural: string }> = {
  target: { label: "Reached its target", won: true, plural: "reached the target" },
  won_close: { label: "Won by the close", won: true, plural: "won by the close" },
  stopped: { label: "Safety stop hit", won: false, plural: "hit the safety stop" },
  gave_back: { label: "Was up, gave it back", won: false, plural: "were up, then gave it back" },
  costs: { label: "Too small to beat charges", won: false, plural: "moved too little to beat charges" },
  wrong_way: { label: "Went the wrong way", won: false, plural: "went the wrong way" },
};

function Tally({ trades }: { trades: PaperTrade[] }) {
  const counts: Partial<Record<Verdict, number>> = {};
  for (const t of trades) if (t.review) counts[t.review.verdict] = (counts[t.review.verdict] || 0) + 1;
  const wins = (Object.keys(counts) as Verdict[]).filter((k) => VERDICT[k].won);
  const losses = (Object.keys(counts) as Verdict[]).filter((k) => !VERDICT[k].won);
  const line = (ks: Verdict[]) => ks.sort((a, b) => (counts[b] || 0) - (counts[a] || 0)).map((k) => `${counts[k]} ${VERDICT[k].plural}`).join(", ");
  return (
    <div className="grid sm:grid-cols-2 gap-3 mt-4">
      <div className="rounded-2xl bg-gain-soft p-4">
        <div className="text-sm font-medium text-gain">Why trades won</div>
        <p className="mt-1 text-sm">{wins.length ? line(wins) : "No wins yet in this view."}</p>
      </div>
      <div className="rounded-2xl bg-loss-soft p-4">
        <div className="text-sm font-medium text-loss">Why trades lost</div>
        <p className="mt-1 text-sm">{losses.length ? line(losses) : "No losses in this view."}</p>
      </div>
    </div>
  );
}

function ReviewCard({ t }: { t: PaperTrade; key?: string }) {
  const r = t.review!;
  const v = VERDICT[r.verdict];
  const pnl = t.pnlInr ?? 0;
  const blocks: [string, string][] = [
    ["Why Roki took it", r.why],
    ["What the price did", r.happened],
    [v.won ? "Why it won" : "Why it lost", r.because],
    ["What it teaches", r.lesson],
  ];
  return (
    <article className="rounded-2xl bg-surface border border-line overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 border-b border-line">
        <span className="font-display font-semibold text-lg">{t.instrument}</span>
        <span className="text-sm text-muted-foreground">{t.side === 1 ? "Bought" : "Sold"} · {RULE_NAME[t.strategy] || t.strategy}</span>
        {t.mode === "shadow" && <span className="text-xs rounded-full bg-muted text-muted-foreground px-2.5 py-0.5">Learning only</span>}
        <span className={`ml-auto text-xs font-medium rounded-full px-2.5 py-0.5 ${v.won ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss"}`}>{v.label}</span>
        <span className={`font-display font-semibold text-lg ${pnl > 0 ? "text-gain" : "text-loss"}`}>{rs(pnl)}</span>
      </header>
      <dl className="grid md:grid-cols-2 gap-x-6 gap-y-4 px-5 py-4">
        {blocks.map(([h, txt]) => (
          <div key={h}>
            <dt className="text-sm font-semibold">{h}</dt>
            <dd className="mt-1 text-sm text-muted-foreground leading-relaxed">{txt}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function TradeReview({ view }: { view: EngineView }) {
  const [learning, setLearning] = useState(false);
  const reviewed = useMemo(() => view.trades.filter((t) => t.status === "closed" && t.review), [view]);
  const shown = reviewed.filter((t) => learning || t.mode === "active");
  const days = useMemo(() => [...new Set(shown.map((t) => t.session))].sort().reverse(), [shown]);
  const [day, setDay] = useState<string | null>(null);
  const sel = day && days.includes(day) ? day : days[0];
  const today = shown.filter((t) => t.session === sel).sort((a, b) => (b.pnlInr ?? 0) - (a.pnlInr ?? 0));
  const sum = (xs: PaperTrade[]) => xs.reduce((s, t) => s + (t.pnlInr ?? 0), 0);
  const waiting = view.trades.filter((t) => t.status === "closed" && !t.review && (learning || t.mode === "active")).length;

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl bg-surface border border-line p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <h2 className="font-display font-semibold text-2xl">Every trade, explained</h2>
            <p className="mt-1 text-muted-foreground max-w-2xl">Why Roki took each trade, what the price did next, why it won or lost, and what that teaches. Written from the real 5-minute prices of that day.</p>
          </div>
          <label className="ml-auto inline-flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" className="accent-[var(--roki)] w-4 h-4" checked={learning} onChange={(e) => setLearning(e.target.checked)} />
            Include learning-only trades
          </label>
        </div>
        <div className="mt-4 text-sm">
          All {shown.length} reviewed {learning ? "" : "counted "}trades: <span className={`font-semibold ${sum(shown) >= 0 ? "text-gain" : "text-loss"}`}>{rs(sum(shown))}</span> on paper.
        </div>
        <Tally trades={shown} />
        {waiting > 0 && <p className="mt-3 text-xs text-muted-foreground">{waiting} older trade{waiting > 1 ? "s" : ""} closed before reviews started and can't be reviewed (their 5-minute prices are no longer available).</p>}
      </section>

      {days.length ? (
        <>
          <nav aria-label="Choose a day" className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => {
              const xs = shown.filter((t) => t.session === d), s = sum(xs);
              return (
                <button key={d} onClick={() => setDay(d)}
                  className={`flex-none rounded-2xl border px-4 py-2 text-left ${d === sel ? "border-roki bg-roki-soft" : "border-line bg-surface hover:border-roki"}`}>
                  <div className="text-sm font-medium">{dayLabel(d)}</div>
                  <div className={`text-xs ${s >= 0 ? "text-gain" : "text-loss"}`}>{rs(s)} · {xs.length} trade{xs.length > 1 ? "s" : ""}</div>
                </button>
              );
            })}
          </nav>
          <div className="text-sm text-muted-foreground">
            {dayLabel(sel)}: {today.filter((t) => (t.pnlInr ?? 0) > 0).length} won, {today.filter((t) => (t.pnlInr ?? 0) <= 0).length} lost, total <span className={sum(today) >= 0 ? "text-gain font-medium" : "text-loss font-medium"}>{rs(sum(today))}</span>.
          </div>
          <div className="grid gap-4">{today.map((t) => <ReviewCard key={t.id} t={t} />)}</div>
        </>
      ) : (
        <p className="text-muted-foreground">No reviewed trades yet. Each trade gets its review the moment it closes{learning ? "" : "; turn on learning-only trades to see more"}.</p>
      )}
    </div>
  );
}
