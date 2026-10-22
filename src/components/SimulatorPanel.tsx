/**
 * Simulator: the paper account the brain trades exactly as it would trade live
 * (option buying, real contracts, slippage and Indian charges, broker square-off).
 */
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Api = (path: string, body?: object) => Promise<any>;
interface SimView {
  account: null | { startingCapital: number; cash: number; realised: number; charges: number; createdAt: number | null;
    snapshot: null | { at: number; equity: number; openPnl: number; vix: number | null; positions: { securityId: string; symbol: string; qty: number; avg: number; last: number | null; pnl: number | null }[] };
    equity: { t: number; v: number }[] };
  orders?: { id: string; at: number; symbol: string; side: string; qty: number; kind: string; trigger?: number; status: string; price?: number; charges?: number; note: string; tag: string }[];
  trades?: ({ id: string } & Record<string, unknown>)[];
  chargesConfig: Record<string, number>;
}
const rs = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const sgn = (v: number) => `${v >= 0 ? "+" : "−"}₹${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
const tm = (ms: number) => new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const tone = (v: number) => (v > 0 ? "text-gain" : v < 0 ? "text-loss" : "");

function Curve({ pts, base }: { pts: { t: number; v: number }[]; base: number }) {
  if (pts.length < 2) return <p className="text-sm text-muted-foreground">The equity curve starts after the first simulated runs.</p>;
  const W = 600, H = 120, vs = pts.map((p) => p.v), lo = Math.min(base, ...vs), hi = Math.max(base, ...vs), span = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W, y = (v: number) => H - ((v - lo) / span) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none" role="img" aria-label="Account value over time">
      <line x1={0} x2={W} y1={y(base)} y2={y(base)} stroke="currentColor" className="text-muted-foreground" strokeDasharray="4 4" />
      <polyline fill="none" strokeWidth={2} className={vs[vs.length - 1] >= base ? "stroke-gain" : "stroke-loss"} points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")} />
    </svg>
  );
}

export function SimulatorPanel({ api }: { api: Api }) {
  const [v, setV] = useState<SimView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { try { setV(await api("/api/sim")); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } }, [api]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  const reset = async () => {
    const cap = window.prompt("Reset the paper account? All simulated orders are cleared. Starting capital in rupees:", "100000");
    if (!cap) return;
    await api("/api/sim/reset", { capital: Number(cap) }); load();
  };
  if (err) return <p className="text-sm text-loss">{err}</p>;
  if (!v) return <p className="text-sm text-muted-foreground">Loading the simulator…</p>;
  const a = v.account;
  if (!a) return <p className="text-sm text-muted-foreground">The paper account opens on the next engine run.</p>;
  const eq = a.snapshot?.equity ?? a.cash, net = eq - a.startingCapital;
  const tiles = [
    ["Account value", rs(eq), sgn(net) + " since start", tone(net)],
    ["Cash", rs(a.cash), `started with ${rs(a.startingCapital)}`, ""],
    ["Closed trades P&L", sgn(a.realised), "before charges", tone(a.realised)],
    ["Charges paid", rs(a.charges), "brokerage, STT, exchange, SEBI, stamp, GST", ""],
  ];
  const c = v.chargesConfig || {};
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {tiles.map(([l, big, small, t]) => (
          <Card key={l} className="bg-card border-line"><CardHeader>
            <CardDescription className="text-xs font-mono">{l}</CardDescription>
            <CardTitle className={`text-2xl font-display font-semibold ${t}`}>{big}</CardTitle></CardHeader>
            <CardContent className="text-xs text-muted-foreground">{small}</CardContent></Card>
        ))}
      </div>
      <Card className="bg-card border-line">
        <CardHeader><CardTitle className="font-display font-semibold text-xl">Account value</CardTitle>
          <CardDescription>Every 5 minutes while the engine runs; dashed line = starting capital. {a.snapshot?.vix ? `India VIX ${a.snapshot.vix.toFixed(2)}.` : ""}</CardDescription></CardHeader>
        <CardContent><Curve pts={a.equity} base={a.startingCapital} /></CardContent>
      </Card>
      <Card className="bg-card border-line">
        <CardHeader><CardTitle className="font-display font-semibold text-xl">Open positions</CardTitle><CardDescription>Premiums are modelled from the live index price and India VIX.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {a.snapshot?.positions.length ? (
            <Table><TableHeader><TableRow>{["Contract", "Qty", "Bought at", "Now", "P&L"].map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{a.snapshot.positions.map((p) => (
                <TableRow key={p.securityId}><TableCell className="font-mono text-xs">{p.symbol}</TableCell><TableCell className="font-mono">{p.qty}</TableCell>
                  <TableCell className="font-mono">{p.avg.toFixed(2)}</TableCell><TableCell className="font-mono">{p.last?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell className={`font-mono ${tone(p.pnl ?? 0)}`}>{p.pnl === null ? "—" : sgn(p.pnl)}</TableCell></TableRow>))}</TableBody></Table>
          ) : <p className="text-sm text-muted-foreground">No open positions.</p>}
        </CardContent>
      </Card>
      <Card className="bg-card border-line">
        <CardHeader><CardTitle className="font-display font-semibold text-xl">Order book</CardTitle><CardDescription>Every simulated order, newest first, as a broker would show it.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto max-h-[32rem] overflow-y-auto">
          <Table><TableHeader><TableRow>{["Time", "Order", "Side", "Qty", "Contract", "Status", "Price", "Charges", "Note"].map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {(v.orders || []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{tm(o.at)}</TableCell><TableCell className="text-xs">{o.kind}{o.trigger ? ` @${o.trigger}` : ""}</TableCell>
                  <TableCell className="font-medium">{o.side}</TableCell><TableCell className="font-mono">{o.qty}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{o.symbol}</TableCell><TableCell className="text-xs">{o.status}</TableCell>
                  <TableCell className="font-mono">{o.price?.toFixed(2) ?? "—"}</TableCell><TableCell className="font-mono text-xs">{o.charges ? o.charges.toFixed(2) : "—"}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground min-w-[200px]">{o.note}</TableCell>
                </TableRow>))}
              {!(v.orders || []).length && <TableRow><TableCell colSpan={9} className="text-muted-foreground">No orders yet. The first one comes with the next active Indian signal, if the engine is running at that moment (it needs the 5-minute runner).</TableCell></TableRow>}
            </TableBody></Table>
        </CardContent>
      </Card>
      <Card className="bg-card border-line">
        <CardHeader><CardTitle className="font-display font-semibold text-xl">What Roki asked for</CardTitle><CardDescription>Each active Indian trade and what the simulated broker did with it (sent, refused and why).</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto max-h-[24rem] overflow-y-auto">
          <Table><TableHeader><TableRow>{["Roki's trade", "Result"].map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{(v.trades || []).map((t) => (<TableRow key={t.id}><TableCell className="font-mono text-xs whitespace-nowrap">{t.id}</TableCell><TableCell className="text-xs">{String(t.brokerNote ?? "—")}</TableCell></TableRow>))}
              {!(v.trades || []).length && <TableRow><TableCell colSpan={2} className="text-muted-foreground">Nothing yet.</TableCell></TableRow>}</TableBody></Table>
        </CardContent>
      </Card>
      <Card className="bg-card border-line">
        <CardHeader><CardTitle className="font-display font-semibold text-xl">How the simulator works</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>It runs the same code as live trading would, with the same limits: buy the at-the-money option (CE for a buy signal, PE for a sell signal), within 15 minutes of the signal, at most one trade a day, sell when Roki closes the trade or at 3:10 pm; the broker squares off anything left at 3:20 pm. Orders are refused when the market is closed, the price is stale or cash is short.</p>
          <p>Premiums come from a model calibrated on real NSE and BSE option prices (Black-Scholes on trading time, India VIX, extra opening premium on gap days). On unseen data the model was typically within 13–14% of the real at-the-money premium and got the trade's profit or loss direction right about 9 times in 10. Every fill also pays {c.slippagePct}% slippage.</p>
          <p>Charges per order: brokerage Rs {c.brokeragePerOrder}, STT {c.sttSellPct}% of the sell premium, exchange fee {c.nseTxnPct}% (NSE) or {c.bseTxnPct}% (BSE), SEBI fee Rs 10 per crore, stamp duty {c.stampBuyPct}% on buys, GST {c.gstPct}% on brokerage and fees.</p>
          <button className="neon-box-red px-3 py-1.5 text-xs font-mono text-loss rounded-xl" onClick={reset}>Reset paper account</button>
        </CardContent>
      </Card>
    </div>
  );
}
