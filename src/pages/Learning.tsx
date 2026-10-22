/**
 * Learning: what Roki is learning from its own record, every day.
 */
import { useMemo } from "react";
import type { EngineView } from "../types";
import { buildLearning, type Check, type RuleScore } from "../core/learning";
import { buildResearch, type ResearchItem } from "../core/research";
import { Badge, Empty, MARKET_NAME, PageHeader, Panel, RULE_NAME, TableWrap, VERDICT, dayLabel, fmtMoney, MoneySum, moneyTxt, pctTxt, tone } from "../ui/kit";
import type { Verdict } from "../core/review";

const STATUS: Record<RuleScore["status"], [string, "neutral" | "gain" | "warn" | "loss"]> = {
  early: ["Too early", "neutral"], on_track: ["In line with testing", "gain"], watch: ["Worse than testing", "warn"], propose: ["Suggest pausing", "loss"],
};
const CHECK: Record<Check["status"], [string, "neutral" | "gain" | "warn"]> = { early: ["Too early", "neutral"], agrees: ["Agrees with testing", "gain"], differs: ["Differs from testing", "warn"] };

export function Learning({ view }: { view: EngineView }) {
  const L = useMemo(() => buildLearning(view.trades, view.predictions), [view]);
  const R = useMemo(() => buildResearch(view.trades, view.predictions), [view]);
  const moved = R.items.filter((i) => i.today > 0);
  const studyOf = (d: string) => R.studies.find((x) => x.date === d);

  return (
    <>
      <PageHeader title="Learning" sub="Every day Roki compares its live record with what 5 years of testing said to expect. It never changes a rule by itself: when a rule falls short by the agreed test, it suggests a change and you decide." />

      {L.proposals.length > 0 && (
        <div className="panel mb-4 border-[color-mix(in_srgb,var(--loss)_35%,var(--line))] bg-loss-soft p-4">
          <div className="text-[14px] font-semibold text-loss">Roki suggests a change</div>
          <ul className="mt-1 list-disc pl-5 text-[14px]">{L.proposals.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      {R.latest && (
        <section className="panel p-5 md:p-6 mb-4">
          <p className="text-[13px] text-ink-2">What changed on {dayLabel(R.latest, true)}</p>
          {moved.length ? (
            <ul className="mt-2 grid gap-1.5 md:grid-cols-2 text-[14px]">
              {moved.map((i) => <li key={i.id} className="flex gap-2"><span className="text-roki">•</span><span><span className="font-medium">{i.question}</span> <span className="text-ink-2">+{i.today} today, now {i.done} of {i.need}.</span></span></li>)}
            </ul>
          ) : <p className="mt-2 text-[14px] text-ink-2">No research question moved on this day.</p>}
          {studyOf(R.latest) && <p className="mt-3 text-[14px]"><span className="font-medium">{studyOf(R.latest)!.title}</span> <span className="text-ink-2">{studyOf(R.latest)!.text}</span></p>}
        </section>
      )}

      <Panel title="Research plan" sub="The questions Roki is working on right now, measured from its own record. Each one has a fixed sample size before Roki gives a verdict." flush className="mb-4">
        <ul className="divide-y divide-[var(--line)]">
          {R.items.map((i) => <ResearchRow key={i.id} i={i} />)}
        </ul>
      </Panel>

      <Panel title="Rules, live against testing" sub="First review after 20 counted trades. A pause is suggested only if a rule is below zero after 40 and clearly worse than testing." flush className="mb-4">
        {L.scores.length ? (
          <TableWrap>
            <table className="tbl">
              <thead><tr><th>Rule</th><th>Market</th><th className="r">Trades</th><th className="r">Won</th><th className="r">Total</th><th className="r">Average a trade</th><th className="r">In testing</th><th>Status</th></tr></thead>
              <tbody>
                {L.scores.map((s) => (
                  <tr key={`${s.strategy}|${s.market}`}>
                    <td className="font-medium whitespace-nowrap">{RULE_NAME[s.strategy] || s.strategy}</td>
                    <td className="whitespace-nowrap muted">{MARKET_NAME[s.market] || s.market}</td>
                    <td className="r">{s.n}<span className="text-ink-3">/20</span></td>
                    <td className="r">{s.wins}</td>
                    <td className={`r font-medium ${tone(s.total)}`}>{fmtMoney(s.total, s.ccy)}</td>
                    <td className={`r ${tone(s.avgPct)}`}>{pctTxt(s.avgPct)}</td>
                    <td className="r muted">{s.expectedPct !== null ? pctTxt(s.expectedPct) : "—"}</td>
                    <td><Badge kind={STATUS[s.status][1]} dot>{STATUS[s.status][0]}</Badge><div className="text-xs text-ink-3 mt-1 max-w-[34ch]">{s.note}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : <Empty title="No counted trades yet" />}
      </Panel>

      <Panel title="What Roki checks every day" sub="Each check is a finding from testing, measured again on live trades." flush className="mb-4">
        <ul className="divide-y divide-[var(--line)]">
          {L.checks.map((c) => (
            <li key={c.id} className="p-4 grid md:grid-cols-[1.1fr_1fr_auto] gap-x-6 gap-y-2">
              <div>
                <div className="text-[14px] font-medium">{c.title}</div>
                <p className="text-[13px] text-ink-2 mt-0.5">{c.fromTesting}</p>
              </div>
              <div className="text-[14px]"><span className="text-[12px] text-ink-3 block">Live so far</span>{c.live}</div>
              <div className="md:text-right"><Badge kind={CHECK[c.status][1]} dot>{CHECK[c.status][0]}</Badge></div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Journal" sub="One entry per trading day: the result, why trades won or lost, and what Roki took from it." flush>
        {L.journal.length ? (
          <ol className="divide-y divide-[var(--line)]">
            {L.journal.map((j) => (
              <li key={j.date} className="p-4 md:p-5 grid md:grid-cols-[200px_1fr] gap-x-8 gap-y-3">
                <div>
                  <div className="text-[14px] font-semibold">{dayLabel(j.date, true)}</div>
                  <div className="mt-1 text-[22px] font-semibold num"><MoneySum trades={j.xs} stack /></div>
                  <div className="text-[13px] text-ink-2">{j.wins} won, {j.trades - j.wins} lost</div>
                  {j.predScored > 0 && <div className="text-[13px] text-ink-2">Predictions {j.predRight} of {j.predScored} right</div>}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.entries(j.mix) as [Verdict, number][]).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                      <Badge key={k} kind={VERDICT[k].won ? "gain" : "loss"}>{n} {VERDICT[k].label.toLowerCase()}</Badge>
                    ))}
                  </div>
                  <p className="mt-3 text-[14px]">
                    {j.best && <>Best: <span className="font-medium">{j.best.instrument}</span> <span className={tone(j.best.retPct)}>{moneyTxt(j.best)}</span>. </>}
                    {j.worst && <>Worst: <span className="font-medium">{j.worst.instrument}</span> <span className={tone(j.worst.retPct)}>{moneyTxt(j.worst)}</span>.</>}
                  </p>
                  {studyOf(j.date) && <p className="mt-3 text-[14px]"><span className="text-[12px] text-ink-3 block">Today's small study</span>{studyOf(j.date)!.text}</p>}
                  {j.lessons.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[12px] text-ink-3">What Roki took from it</div>
                      <ul className="mt-1 space-y-1.5 list-disc pl-5 text-[14px] text-ink-2 max-w-[80ch]">{j.lessons.map((l) => <li key={l}>{l}</li>)}</ul>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : <Empty title="The journal starts with the first closed trade" />}
      </Panel>
    </>
  );
}

const RS: Record<ResearchItem["status"], [string, "neutral" | "brand" | "gain"]> = { planned: ["Planned", "neutral"], collecting: ["Collecting", "brand"], finished: ["Verdict ready", "gain"] };

function ResearchRow({ i }: { i: ResearchItem; key?: string }) {
  const pct = Math.min(100, Math.round((i.done / i.need) * 100));
  return (
    <li className="p-4 md:p-5 grid md:grid-cols-[1.2fr_1fr] gap-x-8 gap-y-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-medium">{i.question}</span>
          <Badge kind={RS[i.status][1]} dot>{RS[i.status][0]}</Badge>
        </div>
        <p className="mt-1 text-[13px] text-ink-2">{i.why}</p>
        <p className="mt-1 text-[13px] text-ink-3">How: {i.method}</p>
      </div>
      <div>
        <div className="flex items-baseline justify-between text-[13px]"><span className="text-ink-2">Progress</span><span className="num">{i.done} of {i.need}{i.today ? <span className="text-roki"> · +{i.today} today</span> : null}</span></div>
        <div className="mt-1.5 h-1.5 rounded-full bg-sunken overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--roki-hi),var(--roki))]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[14px]">{i.finding}</p>
        <p className="mt-1 text-[13px] text-ink-3">Next: {i.next}</p>
      </div>
    </li>
  );
}
