/**
 * CONFLUENCE ENGINE - DASHBOARD
 * Shows what the brain sees and does: next-session levels and odds, calls and
 * their results, paper trades and P&L, the Claude brief, and the safety controls.
 */

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, ShieldAlert, Sparkles, Activity } from "lucide-react";
import { motion } from "motion/react";
import { EngineView, PaperTrade, Prediction } from "./types";
import { WealthSymbol } from "./components/WealthSymbol";
import { LoginGate } from "./components/LoginGate";
import { auth } from "./lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";

const ADMIN_EMAIL = "chijobha@gmail.com";
const inr = (v: number) => `${v >= 0 ? "+" : "−"}Rs ${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined || isNaN(v) ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
const time = (ms: number | null) => (ms ? new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const QUESTION: Record<string, string> = { N_H: "Night: high breaks?", N_L: "Night: low breaks?", O_G: "Open: gap fills?", O_C: "Open: closes above yesterday's close?" };

function Pill({ tone, children }: { tone: "gold" | "green" | "red" | "muted"; children: ReactNode }) {
  const c = { gold: "text-gold border-gold/30", green: "text-emerald-400 border-emerald-500/30", red: "text-red-400 border-red-500/30", muted: "text-ivory/50 border-ivory/15" }[tone];
  return <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-wider whitespace-nowrap ${c}`}>{children}</span>;
}

function Signed({ v, suffix = "" }: { v: number | null; suffix?: string }) {
  if (v === null || v === undefined) return <span className="text-ivory/40">—</span>;
  return <span className={v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : ""}>{v > 0 ? "+" : ""}{v.toFixed(2)}{suffix}</span>;
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
      open: trades.filter((t) => t.status === "open" || t.status === "pending"),
      closed: closed.sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0)),
      upcoming: (view?.predictions || []).filter((p) => p.result === "pending" && p.call).sort((a, b) => a.session.localeCompare(b.session) || a.instrument.localeCompare(b.instrument)),
      hits: scored.filter((p) => p.result === "hit").length, scored: scored.length, scorecard,
    };
  }, [view]);

  if (authChecking) return <div className="min-h-screen bg-obsidian" />;
  if (!user) return <LoginGate onLogin={setUser} />;
  if (!view) {
    return (
      <div className="min-h-screen bg-obsidian text-ivory flex flex-col items-center justify-center gap-6">
        <WealthSymbol className="w-20 h-20 animate-pulse" />
        <span className="text-[10px] font-mono tracking-[0.5em] text-gold/50">{error ? error : "LOADING THE BRAIN"}</span>
      </div>
    );
  }

  const btn = "neon-box-gold px-4 py-2 text-[10px] font-mono text-gold/80 hover:bg-gold/5 transition-all uppercase tracking-widest rounded-sm disabled:opacity-40";

  return (
    <div className="min-h-screen bg-obsidian text-ivory p-4 md:p-phi-lg font-sans selection:bg-gold/30 relative overflow-x-hidden">
      <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-center gap-3 border-b border-gold/10 pb-6 mb-6">
        <WealthSymbol className="w-9 h-9" />
        <h1 className="text-xl md:text-3xl font-medium uppercase tracking-[0.25em]">CONFLUENCE <span className="font-light italic text-gold/30">ENGINE</span></h1>
        <p className="text-[10px] font-mono tracking-[0.4em] uppercase text-ivory/40">Tested rules · real prices · paper first</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Pill tone="muted">Last run {view.lastRun ? new Date(view.lastRun).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</Pill>
          <Pill tone="muted">Next auto run {nextRunText()}</Pill>
          <Pill tone={view.killSwitch ? "red" : "green"}>{view.killSwitch ? "Kill switch ON" : "Engine running"}</Pill>
          <Pill tone={view.liveEnabled ? "red" : "gold"}>{view.liveEnabled ? "LIVE orders ON" : "Paper only"}</Pill>
          <Pill tone="muted">Store: {view.store}</Pill>
          <Pill tone={view.claudeConfigured ? "gold" : "muted"}>{view.claudeConfigured ? `Claude: ${view.claudeModel}` : "Claude brief off"}</Pill>
        </div>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button className={btn} disabled={!!busy} onClick={() => act("run", "/api/run")}><RefreshCw className={`inline w-3 h-3 mr-2 ${busy === "run" ? "animate-spin" : ""}`} />Run now</button>
          {view.claudeConfigured && <button className={btn} disabled={!!busy} onClick={() => act("brief", "/api/brief")}><Sparkles className="inline w-3 h-3 mr-2" />Write brief</button>}
          <button className={`neon-box-red px-4 py-2 text-[10px] font-mono text-red-400 uppercase tracking-widest rounded-sm`} disabled={!!busy} onClick={() => act("kill", "/api/kill", { on: !view.killSwitch })}>
            <ShieldAlert className="inline w-3 h-3 mr-2" />{view.killSwitch ? "Release kill switch" : "Kill switch"}
          </button>
          {view.envLive && view.brokerConfigured && (
            <button className={view.liveEnabled ? "neon-box-emerald px-4 py-2 text-[10px] font-mono uppercase tracking-widest rounded-sm" : "neon-box-red px-4 py-2 text-[10px] font-mono text-red-400 uppercase tracking-widest rounded-sm"}
              disabled={!!busy} onClick={() => { if (view.liveEnabled || window.confirm("Send REAL Dhan orders for active Indian trades? Limits: " + `Rs ${view.risk.riskPerTradeInr} risk per trade, ${view.risk.maxLiveTradesPerDay} trade(s) a day, stop for the day after Rs ${view.risk.dailyLossLimitInr} loss.`)) act("live", "/api/live", { enabled: !view.liveEnabled }); }}>
              {view.liveEnabled ? "Back to paper" : "Go live"}
            </button>
          )}
          <button className={`${btn} opacity-60`} onClick={() => signOut(auth)}>Logout</button>
        </div>
        {(error || view.lastError) && <p className="text-xs text-red-400 font-mono">{error || view.lastError}</p>}
      </motion.header>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
        {[
          { label: "Active trades, net P&L", v: stats.active },
          { label: "Shadow trades, net P&L", v: stats.shadow },
        ].map(({ label, v }) => (
          <Card key={label} className="bg-card border-gold/10">
            <CardHeader><CardDescription className="text-[10px] uppercase tracking-widest font-mono">{label}</CardDescription>
              <CardTitle className={`text-3xl font-serif font-normal ${v.inr > 0 ? "text-emerald-400" : v.inr < 0 ? "text-red-400" : ""}`}>{v.n ? inr(v.inr) : "—"}</CardTitle></CardHeader>
            <CardContent className="text-xs text-ivory/50">{v.n ? `${v.n} closed, ${v.wins} won · Rs 1 lakh per trade` : "No closed trades yet"}</CardContent>
          </Card>
        ))}
        <Card className="bg-card border-gold/10">
          <CardHeader><CardDescription className="text-[10px] uppercase tracking-widest font-mono">Calls right</CardDescription>
            <CardTitle className="text-3xl font-serif font-normal">{stats.scored ? pct(stats.hits / stats.scored) : "—"}</CardTitle></CardHeader>
          <CardContent className="text-xs text-ivory/50">{stats.scored ? `${stats.hits} of ${stats.scored} scored` : "None scored yet"}</CardContent>
        </Card>
        <Card className="bg-card border-gold/10">
          <CardHeader><CardDescription className="text-[10px] uppercase tracking-widest font-mono">Open trades</CardDescription>
            <CardTitle className="text-3xl font-serif font-normal">{stats.open.length}</CardTitle></CardHeader>
          <CardContent className="text-xs text-ivory/50">Most days have no trade: the rules only fire on big gaps or extreme closes.</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="today" className="w-full">
        <TabsList className="flex flex-wrap h-auto bg-transparent gap-2 mb-4">
          {[["today", "Today"], ["next", "Next session"], ["calls", "Calls"], ["trades", "Trades"], ["rules", "Rules & safety"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="neon-box-gold px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded-sm data-[selected]:bg-gold/10">{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="today" className="grid gap-4 md:grid-cols-2">
          <Card className="bg-card border-gold/10">
            <CardHeader><CardTitle className="font-serif font-normal text-xl">Calls waiting for the market</CardTitle>
              <CardDescription>Made only when the odds are 60% or more either way. They are scored automatically after the session.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              {stats.upcoming.length ? (
                <ul className="space-y-2">
                  {stats.upcoming.map((p) => (
                    <li key={p.key} className="flex items-baseline justify-between gap-3 border-b border-gold/5 pb-2">
                      <span className="text-sm">{p.instrument}<span className="text-[10px] text-ivory/40 ml-2 font-mono">{p.session}</span><div className="text-xs text-ivory/50">{QUESTION[p.question]}</div></span>
                      <span className="text-sm text-gold whitespace-nowrap">{p.call}{p.p !== null && <span className="text-ivory/50 text-xs ml-2">{pct(p.p >= 0.5 ? p.p : 1 - p.p)} sure</span>}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-ivory/50">No calls waiting. The engine makes new ones the night before each session (next automatic run {nextRunText()}).</p>}
            </CardContent>
          </Card>
          {(view.claudeConfigured || view.brief) && <Card className="bg-card border-gold/10">
            <CardHeader><CardTitle className="font-serif font-normal text-xl">Claude's brief</CardTitle>
              <CardDescription>{view.brief ? `Written ${new Date(view.brief.at).toLocaleString("en-IN")} by ${view.brief.model}` : view.claudeConfigured ? "Written automatically around 8:30 am and 3:40 pm IST, or press Write brief." : "Set ANTHROPIC_API_KEY on the server to turn this on."}</CardDescription></CardHeader>
            <CardContent><p className="text-sm leading-relaxed whitespace-pre-wrap text-ivory/85">{view.brief?.text || "No brief yet."}</p></CardContent>
          </Card>}
          <Card className="bg-card border-gold/10">
            <CardHeader><CardTitle className="font-serif font-normal text-xl">Open trades</CardTitle><CardDescription>Paper positions the rules hold right now.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              {stats.open.length ? <TradeTable trades={stats.open} open /> : <p className="text-sm text-ivory/50">No open trades.</p>}
              {view.notes.length > 0 && <p className="mt-3 text-[11px] text-ivory/40">{view.notes.join(" · ")}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="next">
          <Card className="bg-card border-gold/10">
            <CardHeader><CardTitle className="font-serif font-normal text-xl">Next session</CardTitle>
              <CardDescription>Yesterday's high (PDH), close (PDC) and low (PDL), the 10-day average range (ADR), and the night-before odds that each level breaks. Odds are how often it happened before, not certainties.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table><TableHeader><TableRow>
                {["Session", "Instrument", "PDH", "PDC", "PDL", "ADR", "High breaks", "Low breaks", "Small-gap band", "Trade triggers"].map((h) => <TableHead key={h} className="text-[10px] uppercase tracking-wider whitespace-nowrap">{h}</TableHead>)}
              </TableRow></TableHeader><TableBody>
                {view.levels.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{l.session}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.instrument}<div className="text-[10px] text-ivory/40">{l.market}</div></TableCell>
                    <TableCell className="font-mono text-xs">{num(l.pdh)}</TableCell><TableCell className="font-mono text-xs">{num(l.pdc)}</TableCell><TableCell className="font-mono text-xs">{num(l.pdl)}</TableCell>
                    <TableCell className="font-mono text-xs">{num(l.adr)}</TableCell>
                    <TableCell className="font-mono text-xs">{pct(l.highBreaks)}</TableCell><TableCell className="font-mono text-xs">{pct(l.lowBreaks)}</TableCell>
                    <TableCell className="font-mono text-[11px] whitespace-nowrap">{l.gapFillBand}</TableCell>
                    <TableCell className="text-[11px] min-w-[260px]">{l.triggers}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calls" className="grid gap-4">
          <Card className="bg-card border-gold/10">
            <CardHeader><CardTitle className="font-serif font-normal text-xl">Scorecard</CardTitle><CardDescription>Calls are made only when the odds are 60% or more either way.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table><TableHeader><TableRow>{["Market", "Question", "Scored", "Right"].map((h) => <TableHead key={h} className="text-[10px] uppercase">{h}</TableHead>)}</TableRow></TableHeader><TableBody>
                {(Object.entries(stats.scorecard) as [string, { hits: number; n: number }][]).sort().map(([k, v]) => { const [m, q] = k.split("|"); return (
                  <TableRow key={k}><TableCell>{m}</TableCell><TableCell>{QUESTION[q]}</TableCell><TableCell className="font-mono">{v.n}</TableCell><TableCell className="font-mono">{pct(v.hits / v.n)}</TableCell></TableRow>); })}
                {!stats.scored && <TableRow><TableCell colSpan={4} className="text-ivory/50">No calls scored yet.</TableCell></TableRow>}
              </TableBody></Table>
            </CardContent>
          </Card>
          <Card className="bg-card border-gold/10">
            <CardHeader><CardTitle className="font-serif font-normal text-xl">Call log</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto max-h-[36rem] overflow-y-auto">
              <Table><TableHeader><TableRow>{["Session", "Instrument", "Question", "Call", "Result", "What happened"].map((h) => <TableHead key={h} className="text-[10px] uppercase">{h}</TableHead>)}</TableRow></TableHeader><TableBody>
                {view.predictions.map((p: Prediction) => (
                  <TableRow key={p.key}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{p.session}</TableCell><TableCell>{p.instrument}</TableCell><TableCell className="text-xs">{QUESTION[p.question]}</TableCell>
                    <TableCell className="text-xs">{p.call}</TableCell>
                    <TableCell><Pill tone={p.result === "hit" ? "green" : p.result === "miss" ? "red" : p.result === "pending" ? "gold" : "muted"}>{p.result}</Pill></TableCell>
                    <TableCell className="font-mono text-[11px] whitespace-nowrap">{p.actual}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trades">
          <Card className="bg-card border-gold/10">
            <CardHeader><CardTitle className="font-serif font-normal text-xl">Closed paper trades</CardTitle><CardDescription>Active = rule tested positive in that market. Shadow = same rule elsewhere, kept for learning; never traded live.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto max-h-[40rem] overflow-y-auto">
              {stats.closed.length ? <TradeTable trades={stats.closed} /> : <p className="text-sm text-ivory/50">No closed trades yet. Paper trading starts with the 22 Oct 2026 sessions.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="grid gap-4 md:grid-cols-2">
          <Card className="bg-card border-gold/10">
            <CardHeader><CardTitle className="font-serif font-normal text-xl">Rules the brain trades</CardTitle><CardDescription>Each one made money in both halves of 5 years of testing in the markets marked active. Everything else that was tested and failed is not in the engine.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              {(Object.entries(view.strategies) as [string, { description: string; activeMarkets: string[] }][]).map(([id, s]) => (
                <div key={id} className="border border-gold/10 rounded-sm p-3">
                  <div className="font-mono text-xs text-gold mb-1">{id}</div>
                  <p className="text-sm text-ivory/80">{s.description}</p>
                  <p className="text-[11px] text-ivory/50 mt-1">Active in: {s.activeMarkets.length ? s.activeMarkets.join(", ") : "none (shadow only)"}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="bg-card border-gold/10">
            <CardHeader><CardTitle className="font-serif font-normal text-xl">Safety</CardTitle></CardHeader>
            <CardContent className="text-sm grid gap-2 text-ivory/80">
              <p><Activity className="inline w-4 h-4 mr-2 text-gold" />Live orders need all of: LIVE_TRADING_ENABLED=true on the server, Dhan keys on the server, your "Go live" click, kill switch off.</p>
              <p>Only active trades in Indian indices and stocks are ever sent. US stocks, commodities and crypto stay paper.</p>
              <p>Risk per trade: Rs {view.risk.riskPerTradeInr} at the 1 ADR safety stop · at most {view.risk.maxLiveTradesPerDay} live trade(s) a day · live stops for the day after Rs {view.risk.dailyLossLimitInr} loss.</p>
              <p>If one lot would risk more than the limit, the live order is not sent (the paper trade still runs).</p>
              <p className="text-ivory/50 text-xs">Paper trading is research. Results so far are small samples; nothing here is investment advice.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TradeTable({ trades, open = false }: { trades: PaperTrade[]; open?: boolean }) {
  const cols = open ? ["Session", "Instrument", "Rule", "Mode", "Side", "Entry", "Stop", "Target", "Now %", "Live"] : ["Session", "Instrument", "Rule", "Mode", "Side", "Entry", "Exit", "Exit time", "Return %", "P&L", "Live"];
  return (
    <Table><TableHeader><TableRow>{cols.map((h) => <TableHead key={h} className="text-[10px] uppercase whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader><TableBody>
      {trades.map((t) => (
        <TableRow key={t.id} title={t.reason}>
          <TableCell className="font-mono text-xs whitespace-nowrap">{t.session}</TableCell>
          <TableCell className="whitespace-nowrap">{t.instrument}</TableCell>
          <TableCell className="font-mono text-[11px]">{t.strategy}</TableCell>
          <TableCell><Pill tone={t.mode === "active" ? "green" : "muted"}>{t.mode}</Pill></TableCell>
          <TableCell><Pill tone={t.side === 1 ? "green" : "red"}>{t.side === 1 ? "BUY" : "SELL"}</Pill></TableCell>
          <TableCell className="font-mono text-xs">{t.entry !== null ? num(t.entry) : t.status}</TableCell>
          {open ? (<>
            <TableCell className="font-mono text-xs">{num(t.stop)}</TableCell>
            <TableCell className="font-mono text-xs">{num(t.target)}</TableCell>
            <TableCell className="font-mono text-xs"><Signed v={t.mtmPct} /></TableCell>
          </>) : (<>
            <TableCell className="font-mono text-xs">{num(t.exit)}</TableCell>
            <TableCell className="font-mono text-[11px] whitespace-nowrap">{time(t.exitTime)}</TableCell>
            <TableCell className="font-mono text-xs"><Signed v={t.retPct} /></TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">{t.pnlInr !== null ? inr(t.pnlInr) : "—"}</TableCell>
          </>)}
          <TableCell className="text-[11px] max-w-[220px]">{t.brokerNote || "—"}</TableCell>
        </TableRow>
      ))}
    </TableBody></Table>
  );
}
