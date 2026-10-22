/**
 * Options account: the simulated broker account Roki trades exactly as it would live.
 */
import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RotateCcw } from "lucide-react";
import { Badge, Empty, PageHeader, Panel, Stat, TableWrap, dateTimeIST, inr, price, tone } from "../ui/kit";

type Api = (path: string, body?: object) => Promise<any>;
interface SimView {
  account: null | { startingCapital: number; cash: number; realised: number; charges: number; createdAt: number | null;
    snapshot: null | { at: number; equity: number; openPnl: number; vix: number | null; positions: { securityId: string; symbol: string; qty: number; avg: number; last: number | null; pnl: number | null }[] };
    equity: { t: number; v: number }[] };
  orders?: { id: string; at: number; symbol: string; side: string; qty: number; kind: string; trigger?: number; status: string; price?: number; charges?: number; note: string; tag: string }[];
  trades?: ({ id: string } & Record<string, unknown>)[];
  chargesConfig: Record<string, number>;
}
const KIND: Record<string, string> = { MARKET: "Market", "SL-M": "Stop-loss", "SQUARE-OFF": "Broker square-off" };
const STATUS: Record<string, "gain" | "neutral" | "loss" | "warn"> = { TRADED: "gain", PENDING: "warn", REJECTED: "loss", CANCELLED: "neutral" };

export function Account({ api }: { api: Api }) {
  const [v, setV] = useState<SimView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { try { setV(await api("/api/sim")); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } }, [api]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  const reset = async () => {
    const cap = window.prompt("Reset the paper options account? All simulated orders will be cleared.\n\nStarting money in rupees:", "100000");
    if (!cap) return;
    await api("/api/sim/reset", { capital: Number(cap) }); load();
  };
  const header = <PageHeader title="Options account" sub="A ₹1 lakh paper account that buys real option contracts the way a live account would: real lot sizes and expiries, realistic prices, slippage and every Indian charge." actions={<button className="btn btn-secondary" onClick={reset}><RotateCcw />Reset account</button>} />;
  if (err) return <>{header}<Panel><Empty title="Couldn't load the account">{err}</Empty></Panel></>;
  if (!v) return <>{header}<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="panel p-4"><div className="skeleton h-4 w-24" /><div className="skeleton h-7 w-32 mt-3" /></div>)}</div></>;
  const a = v.account;
  if (!a) return <>{header}<Panel><Empty title="The account opens on the next engine run" /></Panel></>;
  const eq = a.snapshot?.equity ?? a.cash, net = eq - a.startingCapital, c = v.chargesConfig || {};
  const curve = a.equity.map((p) => ({ t: p.t, v: p.v }));

  return (
    <>
      {header}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
        <Stat label="Account value" value={inr(eq, false)} foot={<span className={tone(net)}>{inr(net)} since the start</span>} />
        <Stat label="Cash" value={inr(a.cash, false)} foot={`Started with ${inr(a.startingCapital, false)}`} />
        <Stat label="Closed trades" value={inr(a.realised)} valueClass={tone(a.realised)} foot="Before charges" />
        <Stat label="Charges paid" value={inr(a.charges, false)} foot="Brokerage, STT, exchange, SEBI, stamp, GST" />
      </div>

      <Panel title="Account value" sub={`Every 5 minutes while the engine runs; the dashed line is the starting money.${a.snapshot?.vix ? ` India VIX ${a.snapshot.vix.toFixed(2)}.` : ""}`} className="mb-4">
        {curve.length > 1 ? (
          <div className="h-56 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs><linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--roki)" stopOpacity={0.18} /><stop offset="100%" stopColor="var(--roki)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--ink-3)" }}
                  tickFormatter={(t) => curve[curve.length - 1].t - curve[0].t < 2 * 86400000 ? new Date(t).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) : new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} minTickGap={40} />
                <YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} width={72} tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickFormatter={(x) => inr(x, false)} />
                <ReferenceLine y={a.startingCapital} stroke="var(--ink-3)" strokeDasharray="4 4" />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} labelFormatter={(t) => dateTimeIST(t as number)} formatter={(x: number) => [inr(x, false), "Value"]} />
                <Area dataKey="v" type="linear" stroke="var(--roki)" strokeWidth={2} fill="url(#eqfill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty title="The chart starts after the first simulated runs" />}
      </Panel>

      <Panel title="Open positions" sub="Prices are modelled from the live index and India VIX." flush className="mb-4">
        {a.snapshot?.positions.length ? (
          <TableWrap>
            <table className="tbl">
              <thead><tr><th>Contract</th><th className="r">Quantity</th><th className="r">Bought at</th><th className="r">Now</th><th className="r">Result</th></tr></thead>
              <tbody>{a.snapshot.positions.map((p) => (
                <tr key={p.securityId}><td className="font-medium">{p.symbol}</td><td className="r">{p.qty}</td><td className="r">{price(p.avg)}</td><td className="r">{price(p.last)}</td>
                  <td className={`r font-medium ${tone(p.pnl)}`}>{p.pnl === null ? "—" : inr(p.pnl)}</td></tr>))}</tbody>
            </table>
          </TableWrap>
        ) : <Empty title="No open positions" />}
      </Panel>

      <Panel title="Order book" sub="Every simulated order, newest first, the way a broker shows it." flush className="mb-4">
        {v.orders?.length ? (
          <TableWrap max="max-h-[520px]">
            <table className="tbl">
              <thead><tr><th>Time</th><th>Order</th><th>Side</th><th className="r">Qty</th><th>Contract</th><th>Status</th><th className="r">Price</th><th className="r">Charges</th><th>Note</th></tr></thead>
              <tbody>{v.orders.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap muted">{dateTimeIST(o.at)}</td><td className="whitespace-nowrap">{KIND[o.kind] || o.kind}{o.trigger ? <span className="text-ink-3"> at {price(o.trigger)}</span> : ""}</td>
                  <td>{o.side === "BUY" ? "Buy" : "Sell"}</td><td className="r">{o.qty}</td><td className="whitespace-nowrap">{o.symbol}</td>
                  <td><Badge kind={STATUS[o.status] || "neutral"}>{o.status.charAt(0) + o.status.slice(1).toLowerCase()}</Badge></td>
                  <td className="r">{o.price !== undefined ? price(o.price) : "—"}</td><td className="r muted">{o.charges ? `₹${o.charges.toFixed(2)}` : "—"}</td>
                  <td className="text-xs muted min-w-[200px]">{o.note}</td>
                </tr>))}</tbody>
            </table>
          </TableWrap>
        ) : <Empty title="No orders yet">The first order comes with the next counted Indian signal while the engine is running.</Empty>}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What Roki asked for" sub="Each counted Indian trade and what the paper broker did with it." flush>
          {v.trades?.length ? (
            <TableWrap max="max-h-[360px]"><table className="tbl"><thead><tr><th>Trade</th><th>Result</th></tr></thead>
              <tbody>{v.trades.map((t) => <tr key={t.id}><td className="whitespace-nowrap muted">{t.id.split("|").slice(0, 2).join(" · ")}</td><td>{String(t.brokerNote ?? "—")}</td></tr>)}</tbody></table></TableWrap>
          ) : <Empty title="Nothing yet" />}
        </Panel>
        <Panel title="How the account works">
          <div className="space-y-3 text-[14px] text-ink-2">
            <p>It runs the same order code a live account would. It buys the at-the-money option (CE for a buy signal, PE for a sell) within 15 minutes of the signal, at most once a day, and sells when Roki closes the trade or at 3:10 pm. The broker squares off anything left at 3:20 pm. Orders are refused when the market is closed, the price is stale or cash is short.</p>
            <p>Option prices come from a model checked against real NSE and BSE prices: typically within 13–14% of the real at-the-money price, with the trade's direction right about 9 times in 10. Every fill also pays {c.slippagePct}% slippage.</p>
            <p>Charges per order: brokerage ₹{c.brokeragePerOrder}, STT {c.sttSellPct}% on sales, exchange fee {c.nseTxnPct}% (NSE) or {c.bseTxnPct}% (BSE), SEBI fee ₹10 per crore, stamp duty {c.stampBuyPct}% on buys, GST {c.gstPct}% on brokerage and fees.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
