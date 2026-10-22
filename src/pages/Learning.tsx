/**
 * Learning: what Roki is learning from its own record, every day.
 */
import { useMemo } from "react";
import type { EngineView } from "../types";
import { buildLearning, type Check, type RuleScore } from "../core/learning";
import { Badge, Empty, MARKET_NAME, PageHeader, Panel, RULE_NAME, TableWrap, VERDICT, dayLabel, inr, pctTxt, tone } from "../ui/kit";
import type { Verdict } from "../core/review";

const STATUS: Record<RuleScore["status"], [string, "neutral" | "gain" | "warn" | "loss"]> = {
  early: ["Too early", "neutral"], on_track: ["In line with testing", "gain"], watch: ["Worse than testing", "warn"], propose: ["Suggest pausing", "loss"],
};
const CHECK: Record<Check["status"], [string, "neutral" | "gain" | "warn"]> = { early: ["Too early", "neutral"], agrees: ["Agrees with testing", "gain"], differs: ["Differs from testing", "warn"] };

export function Learning({ view }: { view: EngineView }) {
  const L = useMemo(() => buildLearning(view.trades, view.predictions), [view]);

  return (
    <>
      <PageHeader title="Learning" sub="Every day Roki compares its live record with what 5 years of testing said to expect. It never changes a rule by itself: when a rule falls short by the agreed test, it suggests a change and you decide." />

      {L.proposals.length > 0 && (
        <div className="panel mb-4 border-[color-mix(in_srgb,var(--loss)_35%,var(--line))] bg-loss-soft p-4">
          <div className="text-[14px] font-semibold text-loss">Roki suggests a change</div>
          <ul className="mt-1 list-disc pl-5 text-[14px]">{L.proposals.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

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
                    <td className={`r font-medium ${tone(s.totalInr)}`}>{inr(s.totalInr)}</td>
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
                  <div className={`mt-1 text-[22px] font-semibold num ${tone(j.totalInr)}`}>{inr(j.totalInr)}</div>
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
                    {j.best && <>Best: <span className="font-medium">{j.best.instrument}</span> <span className={tone(j.best.pnlInr)}>{inr(j.best.pnlInr ?? 0)}</span>. </>}
                    {j.worst && <>Worst: <span className="font-medium">{j.worst.instrument}</span> <span className={tone(j.worst.pnlInr)}>{inr(j.worst.pnlInr ?? 0)}</span>.</>}
                  </p>
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
