/**
 * Overview: today's paper result in one sentence, the running total, open and
 * closed trades, what is waiting to trigger and what Roki expects.
 * Counted trades only; learning-only trades are summarised separately.
 */
import { useMemo } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EngineView, PaperTrade, Prediction } from "../types";
import { Badge, Empty, PageHeader, Panel, Stat, TableWrap, VERDICT, dayLabel, inr, pctTxt, price, rupeesOf, share, timeIST, todayIST, tone, RULE_NAME } from "../ui/kit";

const dayOf = (t: PaperTrade) => (t.exitTime ? new Date(t.exitTime + 5.5 * 3600000).toISOString().slice(0, 10) : t.session);

export function callSentence(p: Prediction, lv?: { pdh: number; pdl: number; pdc: number }) {
  const yes = (p.p ?? 0.5) >= 0.5, sure = Math.round(Math.max(p.p ?? 0.5, 1 - (p.p ?? 0.5)) * 100);
  const at = (v?: number) => (v !== undefined ? ` (${price(v)})` : "");
  const text = {
    N_H: yes ? `Will go above yesterday's high${at(lv?.pdh)}` : `Will stay below yesterday's high${at(lv?.pdh)}`,
    N_L: yes ? `Will go below yesterday's low${at(lv?.pdl)}` : `Will stay above yesterday's low${at(lv?.pdl)}`,
    O_G: yes ? `Will come back to yesterday's close${at(lv?.pdc)}` : `Won't come back to yesterday's close${at(lv?.pdc)}`,
    O_C: yes ? `Will close above yesterday's close${at(lv?.pdc)}` : `Will close below yesterday's close${at(lv?.pdc)}`,
  }[p.question];
  return { text, sure };
}

const waitingText = (t: PaperTrade) =>
  t.trigger != null ? `${t.side === 1 ? "Buy" : "Sell"} if price ${t.side === 1 ? "rises above" : "falls below"} ${price(t.trigger)}, yesterday's ${t.side === 1 ? "high" : "low"}`
  : t.entryDelayBars ? `${t.side === 1 ? "Buy" : "Sell"} ${t.entryDelayBars * 5} minutes after the open` : `${t.side === 1 ? "Buy" : "Sell"} at the open`;

function PnlChart({ counted }: { counted: PaperTrade[] }) {
  const data = useMemo(() => {
    const by: Record<string, number> = {};
    for (const t of counted.filter((t) => t.status === "closed")) by[dayOf(t)] = (by[dayOf(t)] || 0) + (t.pnlInr ?? 0);
    let run = 0;
    return Object.keys(by).sort().map((d) => ({ d: dayLabel(d), day: Math.round(by[d]), total: Math.round((run += by[d])) }));
  }, [counted]);
  if (data.length < 2) return <Empty title="The chart starts after two trading days">Each day's result and the running total appear here.</Empty>;
  return (
    <div className="h-64 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="d" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickFormatter={(v) => inr(v)} />
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          <Tooltip cursor={{ fill: "var(--sunken)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }}
            formatter={(v: number, k: string) => [inr(v), k === "day" ? "That day" : "Running total"]} />
          <Bar dataKey="day" radius={[3, 3, 3, 3]} maxBarSize={28}>
            {data.map((x) => <Cell key={x.d} fill={x.day >= 0 ? "color-mix(in srgb, var(--gain) 45%, transparent)" : "color-mix(in srgb, var(--loss) 40%, transparent)"} />)}
          </Bar>
          <Line dataKey="total" type="linear" stroke="var(--roki)" strokeWidth={2} dot={{ r: 3, fill: "var(--roki)" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function TradeRows({ trades, closed }: { trades: PaperTrade[]; closed: boolean }) {
  return (
    <TableWrap>
      <table className="tbl">
        <thead><tr><th>Market</th><th>Trade</th><th className="r hidden sm:table-cell">{closed ? "Exit" : "Entry"}</th><th className="r">Result</th></tr></thead>
        <tbody>
          {trades.map((t) => {
            const v = rupeesOf(t);
            return (
              <tr key={t.id}>
                <td><div className="font-medium">{t.instrument}</div><div className="text-xs text-ink-3">{RULE_NAME[t.strategy] || t.strategy}</div></td>
                <td>
                  <div>{t.side === 1 ? "Bought" : "Sold"} at <span className="num">{price(t.entry)}</span></div>
                  <div className="text-xs text-ink-3">{closed && t.review ? VERDICT[t.review.verdict].label : closed ? "Closed" : `Safety exit ${price(t.stop)}${t.target ? ` · target ${price(t.target)}` : ""}`}</div>
                  <div className="text-xs text-ink-3 sm:hidden">{closed ? `Closed at ${price(t.exit)}, ${timeIST(t.exitTime)} IST` : `Since ${timeIST(t.entryTime)} IST`}</div>
                </td>
                <td className="r hidden sm:table-cell whitespace-nowrap">{closed ? <><div>{price(t.exit)}</div><div className="text-xs text-ink-3">{timeIST(t.exitTime)} IST</div></> : <><div>{timeIST(t.entryTime)}</div><div className="text-xs text-ink-3">IST</div></>}</td>
                <td className={`r font-medium whitespace-nowrap ${tone(v)}`}>{inr(v)}<div className="text-xs font-normal">{closed ? pctTxt(t.retPct) : t.mtmPct !== null ? `${pctTxt(t.mtmPct)} now` : ""}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function Overview({ view }: { view: EngineView }) {
  const d = useMemo(() => {
    const now = todayIST();
    const counted = view.trades.filter((t) => t.mode === "active"), learning = view.trades.filter((t) => t.mode === "shadow");
    const sum = (xs: PaperTrade[]) => xs.reduce((s, t) => s + rupeesOf(t), 0);
    const closed = counted.filter((t) => t.status === "closed");
    const open = counted.filter((t) => t.status === "open").sort((a, b) => rupeesOf(b) - rupeesOf(a));
    const closedToday = closed.filter((t) => dayOf(t) === now).sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0));
    const latest: Record<string, string> = {};
    for (const p of view.predictions) if (!latest[p.instrument] || p.session > latest[p.instrument]) latest[p.instrument] = p.session;
    const order: Record<string, number> = { N_H: 0, N_L: 1, O_G: 2, O_C: 3 };
    const calls = view.predictions.filter((p) => p.session === latest[p.instrument] && p.result !== "no-call" && p.call)
      .sort((a, b) => a.instrument.localeCompare(b.instrument) || order[a.question] - order[b.question]);
    const scored = view.predictions.filter((p) => p.result === "hit" || p.result === "miss");
    return {
      counted, open, closedToday, today: sum(open) + sum(closedToday), all: sum(closed) + sum(open),
      won: closed.filter((t) => (t.pnlInr ?? 0) > 0).length, lost: closed.filter((t) => (t.pnlInr ?? 0) <= 0).length,
      waiting: counted.filter((t) => t.status === "pending"), calls,
      right: scored.filter((p) => p.result === "hit").length, scored: scored.length,
      learnAll: sum(learning.filter((t) => t.status !== "pending")), learnN: learning.filter((t) => t.status === "closed").length,
    };
  }, [view]);
  const lv = (i: string, s: string) => view.levels.find((l) => l.instrument === i && l.session === s);
  const nothingToday = !d.open.length && !d.closedToday.length;

  return (
    <>
      <PageHeader title="Overview" sub={`${dayLabel(todayIST(), true)}. Every trade is ₹1 lakh of paper money with costs included. Only rules that passed testing are counted.`} />

      <section className="panel p-5 md:p-6 mb-4 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,var(--roki),var(--sun))]" />
        <p className="text-[13px] text-ink-2">Today</p>
        <p className="mt-1 text-[28px] md:text-[34px] leading-tight font-semibold tracking-tight">
          {nothingToday ? "Roki hasn't traded today yet." : <>Roki is <span className={tone(d.today)}>{d.today > 0 ? "up" : d.today < 0 ? "down" : "flat at"} {inr(Math.abs(d.today), false)}</span> on paper.</>}
        </p>
        <p className="mt-1 text-[13px] text-ink-2">{d.open.length} open, {d.closedToday.length} closed today{d.waiting.length ? `, ${d.waiting.length} waiting for their price` : ""}.</p>
      </section>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
        <Stat label="Since the start" value={inr(d.all)} valueClass={tone(d.all)} foot="Closed trades plus open ones at today's price" />
        <Stat label="Trades won" value={share(d.won, d.won + d.lost)} foot={`${d.won} won, ${d.lost} lost`} />
        <Stat label="Predictions right" value={share(d.right, d.scored)} foot={`${d.right} of ${d.scored} checked against the market`} />
        <Stat label="Open now" value={d.open.length} foot={d.open.length ? `${inr(d.open.reduce((s, t) => s + rupeesOf(t), 0))} at today's price` : "Most days the rules don't trade"} />
      </div>

      <Panel title="Paper result by day" sub="Bars: each day's result. Line: running total. Counted trades only." className="mb-4">
        <PnlChart counted={d.counted} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Panel title="Open now" flush>{d.open.length ? <TradeRows trades={d.open} closed={false} /> : <Empty title="Nothing open">Roki only trades when a tested rule's conditions are met.</Empty>}</Panel>
        <Panel title="Closed today" flush>{d.closedToday.length ? <TradeRows trades={d.closedToday} closed /> : <Empty title="No trade closed today yet" />}</Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="Waiting to trigger" sub="These start only if the price gets there." flush>
          {d.waiting.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {d.waiting.map((t) => <li key={t.id} className="px-4 py-3 flex gap-3"><span className="font-medium w-16 sm:w-24 shrink-0">{t.instrument}</span><span className="text-ink-2">{waitingText(t)}</span></li>)}
            </ul>
          ) : <Empty title="Nothing waiting" />}
        </Panel>
        <Panel title="What Roki expects" sub="Only calls where history says 60% or more. Scored after the session." flush>
          {d.calls.length ? (
            <TableWrap max="max-h-[420px]">
              <table className="tbl">
                <thead><tr><th>Market</th><th>Prediction</th><th className="r hidden sm:table-cell">Confidence</th><th className="r">Result</th></tr></thead>
                <tbody>
                  {d.calls.map((p) => { const s = callSentence(p, lv(p.instrument, p.session)); return (
                    <tr key={p.key}>
                      <td className="font-medium whitespace-nowrap">{p.instrument}<div className="text-xs text-ink-3 font-normal">{dayLabel(p.session)}</div></td>
                      <td>{s.text}<div className="text-xs text-ink-3 sm:hidden">{s.sure}% sure</div></td>
                      <td className="r hidden sm:table-cell">{s.sure}%</td>
                      <td className="r">{p.result === "hit" ? <Badge kind="gain">Right</Badge> : p.result === "miss" ? <Badge kind="loss">Wrong</Badge> : <Badge>Waiting</Badge>}</td>
                    </tr>); })}
                </tbody>
              </table>
            </TableWrap>
          ) : <Empty title="No calls yet" />}
        </Panel>
      </div>

      <p className="mt-4 text-[13px] text-ink-2">
        Learning-only trades (rules not yet proven in that market, and tests of new ideas): {d.learnN} closed, <span className={tone(d.learnAll)}>{inr(d.learnAll)}</span>. They are kept apart and never counted above.
      </p>
    </>
  );
}
