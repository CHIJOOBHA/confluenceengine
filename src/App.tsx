/**
 * ROKI - DASHBOARD
 * Shows what the brain sees and does: next-session levels and odds, calls and
 * their results, paper trades and P&L, the Claude brief, and the safety controls.
 */

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, ShieldAlert, Sparkles, Activity, LogOut } from "lucide-react";
import { EngineView, PaperTrade, Prediction } from "./types";
import { RokiMark, RokiWordmark } from "./components/RokiMark";
import { LoginGate } from "./components/LoginGate";
import { SimulatorPanel } from "./components/SimulatorPanel";
import { SimpleHome, RULE_NAME } from "./components/SimpleHome";
import { TradeReview } from "./components/TradeReview";
import { auth } from "./lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";

const ADMIN_EMAIL = "chijobha@gmail.com";
const inr = (v: number) => `${v >= 0 ? "+" : "−"}Rs ${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined || isNaN(v) ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
const time = (ms: number | null) => (ms ? new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const QUESTION: Record<string, string> = { N_H: "Night: high breaks?", N_L: "Night: low breaks?", O_G: "Open: gap fills?", O_C: "Open: closes above yesterday's close?" };

function Pill({ tone, children }: { tone: "gold" | "green" | "red" | "muted"; children: ReactNode }) {
  const c = { gold: "bg-roki-soft text-roki", green: "bg-gain-soft text-gain", red: "bg-loss-soft text-loss", muted: "bg-muted text-muted-foreground" }[tone];
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${c}`}>{children}</span>;
}

function Signed({ v, suffix = "" }: { v: number | null; suffix?: string }) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className={v > 0 ? "text-gain" : v < 0 ? "text-loss" : ""}>{v > 0 ? "+" : ""}{v.toFixed(2)}{suffix}</span>;
}

/** Next Vercel cron run (vercel.json: 04:40, 10:10, 21:30 UTC, Mon-Fri), shown in IST. */
function nextRunText(now = Date.now()): string {
  const slots = [[4, 40], [10, 10], [21, 30]];
  for (let d = 0; d < 8; d++) {
    const day = new Date(now + d * 86400000);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    for (const [h, m] of slots) {
      const t = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m);
      if (t > now) return new Date(t).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit" });
    }
  }
  return "—";
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [view, setView] = useState<EngineView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u && u.email === ADMIN_EMAIL ? u : null);
    setAuthChecking(false);
  }), []);

  const api = useCallback(async (path: string, body?: object) => {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try { setView(await api("/api/state")); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [api]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [user, refresh]);

  const act = async (label: string, path: string, body: object = {}) => {
    setBusy(label);
    try { await api(path, body); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  const stats = useMemo(() => {
    const trades = view?.trades || [];
    const closed = trades.filter((t) => t.status === "closed");
    const by = (mode: "active" | "shadow") => {
      const c = closed.filter((t) => t.mode === mode);
      return { n: c.length, wins: c.filter((t) => (t.retPct || 0) > 0).length, inr: c.reduce((s, t) => s + (t.pnlInr || 0), 0) };
    };
    const scored = (view?.predictions || []).filter((p) => p.result === "hit" || p.result === "miss");
    const scorecard: Record<string, { hits: number; n: number }> = {};
    for (const p of scored) {
      const k = `${p.market}|${p.question}`;
      scorecard[k] ??= { hits: 0, n: 0 };
      scorecard[k].n++; if (p.result === "hit") scorecard[k].hits++;
    }
    return {
      active: by("active"), shadow: by("shadow"),
      open: trades.filter((t) => t.status === "open"),
      closed: closed.sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0)),
      upcoming: (view?.predictions || []).filter((p) => p.result === "pending" && p.call).sort((a, b) => a.session.localeCompare(b.session) || a.instrument.localeCompare(b.instrument)),
      hits: scored.filter((p) => p.result === "hit").length, scored: scored.length, scorecard,
    };
  }, [view]);

  if (authChecking) return <div className="min-h-screen bg-obsidian" />;
  if (!user) return <LoginGate onLogin={setUser} />;
  if (!view) {
    return (
      <div className="min-h-screen bg-paper text-ink flex flex-col items-center justify-center gap-4">
        <RokiMark className="w-14 h-14 animate-pulse" />
        <span className="text-sm text-muted-foreground">{error ? error : "Roki is getting today's numbers…"}</span>
      </div>
    );
  }

  const btn = "btn-quiet px-3.5 py-2 text-sm font-medium rounded-full disabled:opacity-40 inline-flex items-center gap-2";
  const updated = view.lastRun ? new Date(view.lastRun).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <div className="min-h-screen bg-paper text-ink font-sans selection:bg-roki/20">
      <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <RokiWordmark />
          <span className="hidden md:inline text-sm text-muted-foreground border-l border-line pl-3">An AI learning to trade, in public</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Pill tone="muted">Updated {updated}</Pill>
            <Pill tone={view.liveEnabled ? "red" : "gold"}>{view.liveEnabled ? "Real orders on" : "Paper money only"}</Pill>
            {view.killSwitch && <Pill tone="red">Kill switch on</Pill>}
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 pb-3 flex flex-wrap items-center gap-2">
          <button className="btn-primary px-4 py-2 text-sm font-medium rounded-full disabled:opacity-40 inline-flex items-center gap-2" disabled={!!busy} onClick={() => act("run", "/api/run")}><RefreshCw className={`w-4 h-4 ${busy === "run" ? "animate-spin" : ""}`} />Run now</button>
          {view.claudeConfigured && <button className={btn} disabled={!!busy} onClick={() => act("brief", "/api/brief")}><Sparkles className="w-4 h-4" />Write brief</button>}
          <button className="neon-box-red px-3.5 py-2 text-sm font-medium rounded-full inline-flex items-center gap-2" disabled={!!busy} onClick={() => act("kill", "/api/kill", { on: !view.killSwitch })}>
            <ShieldAlert className="w-4 h-4" />{view.killSwitch ? "Turn kill switch off" : "Kill switch"}
          </button>
          {view.envLive && view.brokerConfigured && (
            <button className={`${view.liveEnabled ? "neon-box-emerald" : "neon-box-red"} px-3.5 py-2 text-sm font-medium rounded-full`}
              disabled={!!busy} onClick={() => { if (view.liveEnabled || window.confirm("Send REAL Dhan orders? For each active Indian trade the app BUYS " + `${view.risk.optionLots} lot(s) of the at-the-money option (CE for a buy signal, PE for a sell signal). You can lose the whole premium (up to Rs ${view.risk.maxPremiumPerTradeInr} a trade). At most ${view.risk.maxLiveTradesPerDay} trade(s) a day; no new trades after a Rs ${view.risk.dailyLossLimitInr} loss.`)) act("live", "/api/live", { enabled: !view.liveEnabled }); }}>
              {view.liveEnabled ? "Back to paper" : "Go live"}
            </button>
          )}
          <button className={`${btn} ml-auto`} onClick={() => signOut(auth)} aria-label="Sign out"><LogOut className="w-4 h-4" /><span className="hidden sm:inline">Sign out</span></button>
        </div>
        {(error || view.lastError) && <p className="max-w-6xl mx-auto px-4 pb-3 text-sm text-loss">{error || view.lastError}</p>}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
      <Tabs defaultValue="home" className="w-full">
        <TabsList className="flex flex-nowrap justify-start h-auto bg-surface border border-line rounded-full p-1 gap-1 mb-6 max-w-full w-fit overflow-x-auto">
          {[["home", "Home"], ["review", "Trade review"], ["sim", "Options account"], ["trades", "All trades"], ["calls", "All calls"], ["next", "Levels"], ["rules", "Rules & safety"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="flex-none px-4 py-2 text-sm font-medium rounded-full text-muted-foreground hover:text-ink data-active:bg-roki data-active:text-white data-active:shadow-none">{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="home"><SimpleHome view={view} /></TabsContent>
        <TabsContent value="review"><TradeReview view={view} /></TabsContent>

        <TabsContent value="next">
          <Card className="bg-card border-line">
            <CardHeader><CardTitle className="font-display font-semibold text-xl">Next session</CardTitle>
              <CardDescription>Yesterday's high (PDH), close (PDC) and low (PDL), the 10-day average range (ADR), and the night-before odds that each level breaks. Odds are how often it happened before, not certainties.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table><TableHeader><TableRow>
                {["Session", "Instrument", "PDH", "PDC", "PDL", "ADR", "High breaks", "Low breaks", "Small-gap band", "Trade triggers"].map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
              </TableRow></TableHeader><TableBody>
                {view.levels.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{l.session}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.instrument}<div className="text-xs text-muted-foreground">{l.market}</div></TableCell>
                    <TableCell className="font-mono text-xs">{num(l.pdh)}</TableCell><TableCell className="font-mono text-xs">{num(l.pdc)}</TableCell><TableCell className="font-mono text-xs">{num(l.pdl)}</TableCell>
                    <TableCell className="font-mono text-xs">{num(l.adr)}</TableCell>
                    <TableCell className="font-mono text-xs">{pct(l.highBreaks)}</TableCell><TableCell className="font-mono text-xs">{pct(l.lowBreaks)}</TableCell>
                    <TableCell className="font-mono text-[13px] whitespace-nowrap">{l.gapFillBand}</TableCell>
                    <TableCell className="text-[13px] min-w-[260px]">{l.triggers}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calls" className="grid gap-4">
          <Card className="bg-card border-line">
            <CardHeader><CardTitle className="font-display font-semibold text-xl">Scorecard</CardTitle><CardDescription>Calls are made only when the odds are 60% or more either way.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table><TableHeader><TableRow>{["Market", "Question", "Scored", "Right"].map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}</TableRow></TableHeader><TableBody>
                {(Object.entries(stats.scorecard) as [string, { hits: number; n: number }][]).sort().map(([k, v]) => { const [m, q] = k.split("|"); return (
                  <TableRow key={k}><TableCell>{m}</TableCell><TableCell>{QUESTION[q]}</TableCell><TableCell className="font-mono">{v.n}</TableCell><TableCell className="font-mono">{pct(v.hits / v.n)}</TableCell></TableRow>); })}
                {!stats.scored && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No calls scored yet.</TableCell></TableRow>}
              </TableBody></Table>
            </CardContent>
          </Card>
          <Card className="bg-card border-line">
            <CardHeader><CardTitle className="font-display font-semibold text-xl">Call log</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto max-h-[36rem] overflow-y-auto">
              <Table><TableHeader><TableRow>{["Session", "Instrument", "Question", "Call", "Result", "What happened"].map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}</TableRow></TableHeader><TableBody>
                {view.predictions.map((p: Prediction) => (
                  <TableRow key={p.key}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{p.session}</TableCell><TableCell>{p.instrument}</TableCell><TableCell className="text-xs">{QUESTION[p.question]}</TableCell>
                    <TableCell className="text-xs">{p.call}</TableCell>
                    <TableCell><Pill tone={p.result === "hit" ? "green" : p.result === "miss" ? "red" : p.result === "pending" ? "gold" : "muted"}>{p.result}</Pill></TableCell>
                    <TableCell className="font-mono text-[13px] whitespace-nowrap">{p.actual}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trades">
          <Card className="bg-card border-line">
            <CardHeader><CardTitle className="font-display font-semibold text-xl">Closed paper trades</CardTitle><CardDescription>Active = rule tested positive in that market. Shadow = same rule elsewhere, kept for learning; never traded live.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto max-h-[40rem] overflow-y-auto">
              {stats.closed.length ? <TradeTable trades={stats.closed} /> : <p className="text-sm text-muted-foreground">No closed trades yet. Paper trading starts with the 22 Oct 2026 sessions.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sim"><SimulatorPanel api={api} /></TabsContent>

        <TabsContent value="rules" className="grid gap-4 md:grid-cols-2">
          <Card className="bg-card border-line">
            <CardHeader><CardTitle className="font-display font-semibold text-xl">Rules Roki trades</CardTitle><CardDescription>Each one made money in both halves of 5 years of testing in the markets marked active. Everything else that was tested and failed is not in the engine.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              {(Object.entries(view.strategies) as [string, { description: string; activeMarkets: string[] }][]).map(([id, s]) => (
                <div key={id} className="border border-line rounded-xl p-3">
                  <div className="font-display text-sm font-semibold text-roki mb-1">{RULE_NAME[id] || id}</div>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                  <p className="text-[13px] text-muted-foreground mt-1">Active in: {s.activeMarkets.length ? s.activeMarkets.join(", ") : "none (shadow only)"}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="bg-card border-line">
            <CardHeader><CardTitle className="font-display font-semibold text-xl">Safety</CardTitle></CardHeader>
            <CardContent className="text-sm grid gap-2 text-muted-foreground">
              <p><Activity className="inline w-4 h-4 mr-2 text-roki" />Live orders need all of: LIVE_TRADING_ENABLED=true on the server, Dhan keys on the server, your "Go live" click, kill switch off.</p>
              <p>Only active trades in Indian indices and stocks are ever sent. US stocks, commodities and crypto stay paper.</p>
              <p>Live orders buy {view.risk.optionLots} lot(s) of the at-the-money option (CE for buy signals, PE for sell signals) and sell it when Roki closes the trade, or at 3:10 pm · premium per trade at most Rs {view.risk.maxPremiumPerTradeInr} · backstop stop on the option at -{view.risk.optionBackstopPct}% · at most {view.risk.maxLiveTradesPerDay} live trade(s) a day · no new trades after a Rs {view.risk.dailyLossLimitInr} loss.</p>
              <p>If one lot would risk more than the limit, the live order is not sent (the paper trade still runs).</p>
              <p className="text-muted-foreground text-xs">Paper trading is research. Results so far are small samples; nothing here is investment advice.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <footer className="mt-10 pt-6 border-t border-line text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <span>Roki trades paper money only. Nothing here is investment advice.</span>
        <span>Every trade, right and wrong, stays on record.</span>
      </footer>
      </main>
    </div>
  );
}

function TradeTable({ trades, open = false }: { trades: PaperTrade[]; open?: boolean }) {
  const cols = open ? ["Day", "Market", "Rule", "Type", "Side", "Bought/sold at", "Safety exit", "Target", "Now %", "Broker"] : ["Day", "Market", "Rule", "Type", "Side", "Entry", "Exit", "Exit time", "Return %", "Profit on ₹1 lakh", "Broker"];
  return (
    <Table><TableHeader><TableRow>{cols.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader><TableBody>
      {trades.map((t) => (
        <TableRow key={t.id} title={t.reason}>
          <TableCell className="font-mono text-xs whitespace-nowrap">{t.session}</TableCell>
          <TableCell className="whitespace-nowrap">{t.instrument}</TableCell>
          <TableCell className="text-[13px] whitespace-nowrap">{RULE_NAME[t.strategy] || t.strategy}</TableCell>
          <TableCell><Pill tone={t.mode === "active" ? "green" : "muted"}>{t.mode === "active" ? "counted" : "learning"}</Pill></TableCell>
          <TableCell><Pill tone={t.side === 1 ? "green" : "red"}>{t.side === 1 ? "BUY" : "SELL"}</Pill></TableCell>
          <TableCell className="font-mono text-xs">{t.entry !== null ? num(t.entry) : t.status}</TableCell>
          {open ? (<>
            <TableCell className="font-mono text-xs">{num(t.stop)}</TableCell>
            <TableCell className="font-mono text-xs">{num(t.target)}</TableCell>
            <TableCell className="font-mono text-xs"><Signed v={t.mtmPct} /></TableCell>
          </>) : (<>
            <TableCell className="font-mono text-xs">{num(t.exit)}</TableCell>
            <TableCell className="font-mono text-[13px] whitespace-nowrap">{time(t.exitTime)}</TableCell>
            <TableCell className="font-mono text-xs"><Signed v={t.retPct} /></TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">{t.pnlInr !== null ? inr(t.pnlInr) : "—"}</TableCell>
          </>)}
          <TableCell className="text-[13px] max-w-[220px]">{t.brokerNote || "—"}</TableCell>
        </TableRow>
      ))}
    </TableBody></Table>
  );
}
