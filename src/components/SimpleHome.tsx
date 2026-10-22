/**
 * Home: the plain-language view. How much the paper trades made or lost, what is
 * open, what closed, what is waiting, and what Roki expects today.
 * Counted ("active") trades and learning-only ("shadow") trades are kept apart.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { EngineView, PaperTrade, Prediction } from "../types";

const LAKH = 100000;
const IST = 5.5 * 3600000;
const istDay = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
const today = () => istDay(Date.now());
const rs = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}₹${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
const px = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: v < 10 ? 4 : 2 }));
const clock = (ms: number | null) => (ms ? new Date(ms).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }) : "");
const tone = (v: number) => (v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-muted-foreground");

export const RULE_NAME: Record<string, string> = {
  GAPFADE: "Gap fade", GAPFADE30: "Gap fade (late-entry test)", XFADE: "Extreme-close fade", XFADE_SKIPDAY: "Extreme-close fade (skip-day test)",
  BIGGAP: "Big-gap fade", BREAKOUT: "Breakout",
};

/** Rupees on Rs 1 lakh: realised for closed trades, current for open ones. */
export function tradeRupees(t: PaperTrade): number {
  if (t.status === "closed") return t.pnlInr ?? 0;
  if (t.status === "open" && t.mtmPct !== null) return (t.mtmPct / 100) * LAKH;
  return 0;
}
const dayOf = (t: PaperTrade) => (t.exitTime ? istDay(t.exitTime) : t.entryTime ? istDay(t.entryTime) : t.session);

function TradeLine({ t }: { t: PaperTrade; key?: string }) {
  const v = tradeRupees(t);
  const side = t.side === 1 ? "BUY" : "SELL";
  const what = t.status === "closed"
    ? `${side} at ${px(t.entry)} → closed at ${px(t.exit)}`
    : `${side} at ${px(t.entry)}${t.entryTime ? ` (${clock(t.entryTime)})` : ""}`;
  const why = t.status === "closed" ? (t.reason.includes("safety stop") ? "safety exit hit" : t.reason.includes("target") ? "target reached" : "closed at the end of the session") : `safety exit at ${px(t.stop)}${t.target ? `, target ${px(t.target)}` : ""}`;
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-0">
      <div className="min-w-0">
        <div className="text-sm"><span className="font-medium">{t.instrument}</span> <span className="text-ink/80">{what}</span></div>
        <div className="text-[13px] text-muted-foreground">{RULE_NAME[t.strategy] || t.strategy} · {why}</div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-mono ${tone(v)}`}>{rs(v)}</div>
        {t.status === "open" && t.mtmPct !== null && <div className={`text-[13px] font-mono ${tone(v)}`}>{t.mtmPct > 0 ? "+" : ""}{t.mtmPct.toFixed(2)}%</div>}
        {t.status === "closed" && t.retPct !== null && <div className={`text-[13px] font-mono ${tone(v)}`}>{t.retPct > 0 ? "+" : ""}{t.retPct.toFixed(2)}%</div>}
      </div>
    </li>
  );
}

function waitingText(t: PaperTrade): string {
  const side = t.side === 1 ? "BUY" : "SELL";
  if (t.trigger != null) return `${side} if the price ${t.side === 1 ? "goes above" : "drops below"} ${px(t.trigger)} (yesterday's ${t.side === 1 ? "high" : "low"})`;
  if (t.entryDelayBars) return `${side} ${t.entryDelayBars * 5} minutes after the open`;
  return `${side} at the open`;
}

function callSentence(p: Prediction, lv?: { pdh: number; pdl: number; pdc: number }): { text: string; sure: number } {
  const yes = (p.p ?? 0.5) >= 0.5, sure = Math.round(Math.max(p.p ?? 0.5, 1 - (p.p ?? 0.5)) * 100);
  const at = (v?: number) => (v !== undefined ? ` (${px(v)})` : "");
  const t = {
    N_H: yes ? `will go above yesterday's high${at(lv?.pdh)}` : `will stay below yesterday's high${at(lv?.pdh)}`,
    N_L: yes ? `will go below yesterday's low${at(lv?.pdl)}` : `will stay above yesterday's low${at(lv?.pdl)}`,
    O_G: yes ? `will come back to yesterday's close${at(lv?.pdc)}` : `will not come back to yesterday's close${at(lv?.pdc)}`,
    O_C: yes ? `will close above yesterday's close${at(lv?.pdc)}` : `will close below yesterday's close${at(lv?.pdc)}`,
  }[p.question];
  return { text: t, sure };
}

export function SimpleHome({ view }: { view: EngineView }) {
  const [showLearning, setShowLearning] = useState(false);
  const d = useMemo(() => {
    const T = view.trades;
    const counted = T.filter((t) => t.mode === "active"), learning = T.filter((t) => t.mode === "shadow");
    const sum = (xs: PaperTrade[]) => xs.reduce((s, t) => s + tradeRupees(t), 0);
    const now = today();
    const todays = (xs: PaperTrade[]) => xs.filter((t) => (t.status === "open") || (t.status === "closed" && dayOf(t) === now));
    const closedC = counted.filter((t) => t.status === "closed");
    // the latest session per instrument for Roki's view
    const latest: Record<string, string> = {};
    for (const p of view.predictions) if (!latest[p.instrument] || p.session > latest[p.instrument]) latest[p.instrument] = p.session;
    const calls = view.predictions.filter((p) => p.session === latest[p.instrument] && p.result !== "no-call" && p.call);
    const byInst: Record<string, Prediction[]> = {};
    for (const p of calls) (byInst[p.instrument] ??= []).push(p);
    const order = { N_H: 0, N_L: 1, O_G: 2, O_C: 3 } as Record<string, number>;
    Object.values(byInst).forEach((xs) => xs.sort((a, b) => order[a.question] - order[b.question]));
    const scored = view.predictions.filter((p) => p.result === "hit" || p.result === "miss");
    return {
      todayC: sum(todays(counted)), allC: sum(closedC) + sum(counted.filter((t) => t.status === "open")),
      won: closedC.filter((t) => (t.pnlInr ?? 0) > 0).length, lost: closedC.filter((t) => (t.pnlInr ?? 0) <= 0).length,
      openC: counted.filter((t) => t.status === "open").sort((a, b) => tradeRupees(b) - tradeRupees(a)),
      closedTodayC: closedC.filter((t) => dayOf(t) === now).sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0)),
      waitingC: counted.filter((t) => t.status === "pending"),
      learnToday: sum(todays(learning)), learnAll: sum(learning.filter((t) => t.status !== "pending")),
      learnOpen: learning.filter((t) => t.status === "open" || (t.status === "closed" && dayOf(t) === now)).sort((a, b) => tradeRupees(b) - tradeRupees(a)),
      byInst, right: scored.filter((p) => p.result === "hit").length, scored: scored.length,
    };
  }, [view]);
  const lv = (inst: string, session: string) => view.levels.find((l) => l.instrument === inst && l.session === session);

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl bg-surface border border-line overflow-hidden">
        <div className="h-1.5 bg-[linear-gradient(90deg,var(--roki),var(--sun))]" />
        <div className="p-6 md:p-8">
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h2 className="mt-2 font-display font-semibold text-3xl md:text-5xl leading-tight max-w-3xl">
            {d.todayC === 0 && !d.openC.length && !d.closedTodayC.length
              ? <>Today Roki hasn't traded yet.</>
              : <>Today Roki is <span className={tone(d.todayC)}>{d.todayC > 0 ? "up" : d.todayC < 0 ? "down" : "flat at"} {rs(Math.abs(d.todayC)).replace(/^[+−]/, "")}</span> on paper.</>}
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Every trade is ₹1 lakh of paper money, costs included. Only rules that passed testing count here.
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-paper p-4">
              <div className="text-sm text-muted-foreground">Since the start</div>
              <div className={`mt-1 font-display text-2xl font-semibold ${tone(d.allC)}`}>{rs(d.allC)}</div>
              <div className="text-xs text-muted-foreground mt-1">closed trades, plus open ones at today's price</div>
            </div>
            <div className="rounded-2xl bg-paper p-4">
              <div className="text-sm text-muted-foreground">Closed trades</div>
              <div className="mt-1 font-display text-2xl font-semibold"><span className="text-gain">{d.won} won</span> <span className="text-muted-foreground">/</span> <span className="text-loss">{d.lost} lost</span></div>
              <div className="text-xs text-muted-foreground mt-1">{d.openC.length} open now, {d.closedTodayC.length} closed today</div>
            </div>
            <div className="rounded-2xl bg-roki-soft p-4">
              <div className="text-sm text-roki">Roki's predictions</div>
              <div className="mt-1 font-display text-2xl font-semibold text-roki">{d.scored ? `${Math.round((d.right / d.scored) * 100)}% right` : "Not scored yet"}</div>
              <div className="text-xs text-roki/80 mt-1">{d.scored ? `${d.right} of ${d.scored} calls checked against the real market` : "Calls are checked after each session"}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card border-line">
          <CardHeader className="pb-1"><CardTitle className="font-display font-semibold text-lg">Open now</CardTitle></CardHeader>
          <CardContent>{d.openC.length ? <ul>{d.openC.map((t) => <TradeLine key={t.id} t={t} />)}</ul> : <p className="text-sm text-muted-foreground">Nothing open. Most days the rules don't trade.</p>}</CardContent>
        </Card>
        <Card className="bg-card border-line">
          <CardHeader className="pb-1"><CardTitle className="font-display font-semibold text-lg">Closed today</CardTitle></CardHeader>
          <CardContent>{d.closedTodayC.length ? <ul>{d.closedTodayC.map((t) => <TradeLine key={t.id} t={t} />)}</ul> : <p className="text-sm text-muted-foreground">No trade closed today yet.</p>}</CardContent>
        </Card>
      </div>

      {d.waitingC.length > 0 && (
        <Card className="bg-card border-line">
          <CardHeader className="pb-1"><CardTitle className="font-display font-semibold text-lg">Waiting to trigger</CardTitle><CardDescription>These start only if the price gets there today.</CardDescription></CardHeader>
          <CardContent><ul className="grid gap-1 sm:grid-cols-2">{d.waitingC.map((t) => <li key={t.id} className="text-sm"><span className="font-medium">{t.instrument}</span> <span className="text-muted-foreground">{waitingText(t)}</span></li>)}</ul></CardContent>
        </Card>
      )}

      <Card className="bg-card border-line">
        <CardHeader className="pb-1"><CardTitle className="font-display font-semibold text-lg">What Roki expects</CardTitle>
          <CardDescription>Only calls where history says 60% or more. Checked against the real market after the session.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {(Object.entries(d.byInst) as [string, Prediction[]][]).sort((a, b) => a[0].localeCompare(b[0])).map(([inst, ps]) => (
            <div key={inst} className="border-b border-line pb-2">
              <div className="text-sm font-medium">{inst} <span className="text-[13px] text-muted-foreground font-normal">{ps[0].session}</span></div>
              <ul className="mt-1 space-y-0.5">
                {ps.map((p) => { const s = callSentence(p, lv(inst, p.session)); return (
                  <li key={p.key} className="text-[13px] flex justify-between gap-2">
                    <span className="text-muted-foreground">{s.text} <span className="text-muted-foreground">— {s.sure}% sure</span></span>
                    <span className={p.result === "hit" ? "text-gain" : p.result === "miss" ? "text-loss" : "text-muted-foreground"}>{p.result === "hit" ? "✔ right" : p.result === "miss" ? "✘ wrong" : "waiting"}</span>
                  </li>); })}
              </ul>
            </div>
          ))}
          {!Object.keys(d.byInst).length && <p className="text-sm text-muted-foreground">No calls yet.</p>}
        </CardContent>
      </Card>

      <Card className="bg-card border-line">
        <CardHeader className="pb-1">
          <CardTitle className="font-display font-semibold text-lg">Learning-only trades <span className="text-sm text-muted-foreground">(not counted)</span></CardTitle>
          <CardDescription>The same rules in markets where they have not proved themselves yet, plus tests of new ideas. Today {rs(d.learnToday)}, since the start {rs(d.learnAll)}.</CardDescription>
        </CardHeader>
        <CardContent>
          <button className="text-xs text-gold/80 underline" onClick={() => setShowLearning(!showLearning)}>{showLearning ? "Hide" : `Show ${d.learnOpen.length} of today's learning trades`}</button>
          {showLearning && <ul className="mt-2">{d.learnOpen.map((t) => <TradeLine key={t.id} t={t} />)}</ul>}
        </CardContent>
      </Card>
    </div>
  );
}
