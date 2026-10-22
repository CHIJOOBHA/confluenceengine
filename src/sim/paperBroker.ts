/**
 * ROKI - SIMULATED BROKER (paper account)
 *
 * Has exactly the same methods as the Dhan bridge, so the live executor runs
 * unchanged against it: same gates, same timing window, same risk limits, same
 * order flow. Nothing is ever sent to a real broker.
 *
 * What it simulates like a real account:
 *  - real contracts: symbols, lot sizes, strikes and expiries from Dhan's public
 *    instrument list (falls back to the exchange calendar if that list is unreachable)
 *  - fills at the model premium (see optionPricer.ts) plus slippage
 *  - orders rejected when the market is closed, the price is stale, or cash is short
 *  - Indian F&O charges per order: Dhan brokerage, STT, exchange fee, SEBI fee,
 *    investor-protection fee, stamp duty and GST
 *  - stop-loss orders that trigger when the premium falls to the trigger
 *  - the broker's own intraday square-off at 15:20 IST for anything still open
 *  - cash, positions, realised and open P&L, and an equity curve
 */

import { BrokerService, OrderResult, OrderState, ResolvedInstrument } from "../services/brokerService.js";
import { INSTRUMENTS } from "../core/instruments.js";
import type { Quote } from "../core/engineRunner.js";
import { priceOption, syntheticContract } from "./optionPricer.js";

export interface Contract {
  securityId: string;
  symbol: string;
  instrument: string; // underlying name in the brain (NIFTY, SENSEX, ...)
  exchange: "NSE" | "BSE";
  segment: ResolvedInstrument["exchangeSegment"];
  strike: number;
  type: "CE" | "PE";
  expiry: string;
  lot: number;
  source: "dhan" | "calendar";
}

export interface SimOrder {
  id: string;
  at: number;
  securityId: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  kind: "MARKET" | "SL-M" | "SQUARE-OFF";
  trigger?: number;
  status: "TRADED" | "PENDING" | "REJECTED" | "CANCELLED";
  price?: number; // fill price per unit
  charges?: number;
  note: string;
  tag: string;
}

export interface SimPosition {
  securityId: string;
  qty: number; // units held (always long: we only buy options)
  avg: number; // average premium paid per unit
  openedAt: number;
}

export interface SimAccount {
  startingCapital: number;
  cash: number;
  realised: number; // P&L of closed positions before charges
  charges: number; // all charges paid
  orders: SimOrder[];
  positions: Record<string, SimPosition>;
  contracts: Record<string, Contract>;
  equity: { t: number; v: number }[];
  links: Record<string, Record<string, unknown>>; // brain trade id -> the broker fields the executor keeps for it
  lastMark?: number;
  snapshot?: { at: number; equity: number; openPnl: number; vix: number | null; positions: { securityId: string; symbol: string; qty: number; avg: number; last: number | null; pnl: number | null }[] };
  createdAt?: number;
}

export function newAccount(capital = Number(process.env.SIM_CAPITAL_INR || 100000)): SimAccount {
  return { startingCapital: capital, cash: capital, realised: 0, charges: 0, orders: [], positions: {}, contracts: {}, equity: [], links: {}, createdAt: Date.now() };
}

// ---------------------------------------------------------------- charges (as of 2026)

const num = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);
export const CHARGES = {
  brokeragePerOrder: num("SIM_BROKERAGE_PER_ORDER", 20), // Dhan F&O: Rs 20 per executed order
  sttSellPct: num("SIM_STT_SELL_PCT", 0.15), // options STT on the sell premium (0.15% from 1 Apr 2026)
  nseTxnPct: num("SIM_NSE_TXN_PCT", 0.03503), // NSE options transaction charge, % of premium
  bseTxnPct: num("SIM_BSE_TXN_PCT", 0.0325), // BSE options transaction charge (estimate; check your contract note)
  sebiPerCrore: 10,
  ipftPerCrore: 10, // NSE investor protection fund
  stampBuyPct: 0.003,
  gstPct: 18,
  slippagePct: num("SIM_SLIPPAGE_PCT", 0.5), // of the premium, against you, on every fill
};

export function charges(side: "BUY" | "SELL", turnover: number, exchange: "NSE" | "BSE") {
  const brokerage = CHARGES.brokeragePerOrder;
  const stt = side === "SELL" ? (turnover * CHARGES.sttSellPct) / 100 : 0;
  const txn = (turnover * (exchange === "NSE" ? CHARGES.nseTxnPct : CHARGES.bseTxnPct)) / 100;
  const sebi = (turnover * CHARGES.sebiPerCrore) / 1e7;
  const ipft = exchange === "NSE" ? (turnover * CHARGES.ipftPerCrore) / 1e7 : 0;
  const stamp = side === "BUY" ? (turnover * CHARGES.stampBuyPct) / 100 : 0;
  const gst = ((brokerage + txn + sebi + ipft) * CHARGES.gstPct) / 100;
  const total = brokerage + stt + txn + sebi + ipft + stamp + gst;
  return { total: Math.round(total * 100) / 100, brokerage, stt, txn, sebi, ipft, stamp, gst };
}

// ---------------------------------------------------------------- market context

export interface SimMarket {
  now: number;
  quotes: Record<string, Quote>; // by brain instrument name
  vix: number | null;
}

const IST = 5.5 * 3600000;
const istHM = (ms: number) => new Date(ms + IST).toISOString().slice(11, 16);
const istDay = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
const tick = (x: number) => Math.max(0.05, Math.round(x * 20) / 20);
const SQUARE_OFF_IST = process.env.SIM_SQUARE_OFF_IST || "15:20";
const STALE_MIN = 20;

export class PaperBroker {
  private seq = 0;
  constructor(public acct: SimAccount, private mkt: SimMarket, private dhanList: BrokerService | null = new BrokerService()) {}

  isConfigured(): boolean { return true; }

  private instFor(underlying: string) { return INSTRUMENTS.find((i) => i.dhan?.underlying === underlying); }

  private marketOpen(): boolean {
    const hm = istHM(this.mkt.now);
    const q = this.mkt.quotes["NIFTY"];
    return hm >= "09:15" && hm < "15:30" && !!q && q.sessionDate === istDay(this.mkt.now);
  }

  /** Model premium for a contract right now, or null if there is no fresh price for its underlying. */
  premium(c: Contract, at = this.mkt.now): number | null {
    const q = this.mkt.quotes[c.instrument], nifty = this.mkt.quotes["NIFTY"];
    if (!q || this.mkt.vix === null) return null;
    if (at - q.t > STALE_MIN * 60000 + 5 * 60000) return null;
    const volRatio = nifty && nifty.hv20 > 0 ? q.hv20 / nifty.hv20 : 1;
    const gapAdr = q.open !== null && q.adr > 0 && q.sessionDate === istDay(at) ? (q.open - q.pdc) / q.adr : 0;
    return priceOption({ instrument: c.instrument, spot: q.last, strike: c.strike, type: c.type, expiry: c.expiry, nowMs: at, vix: this.mkt.vix,
      volRatio, gapAdr, sessionStart: q.sessionStart });
  }

  async resolveOption(spec: { kind: "FUTIDX" | "EQ"; underlying: string; exchange: "NSE" | "BSE" }, optionType: "CE" | "PE", price: number, nowMs = this.mkt.now): Promise<ResolvedInstrument> {
    const inst = this.instFor(spec.underlying);
    if (!inst) throw new Error(`Unknown underlying ${spec.underlying}`);
    const skip = process.env.OPTION_TRADE_EXPIRY_DAY !== "true";
    let c: Contract | null = null;
    if (this.dhanList) {
      try {
        const r = await this.dhanList.resolveOption(spec, optionType, price, nowMs);
        c = { securityId: r.securityId, symbol: r.tradingSymbol, instrument: inst.name, exchange: spec.exchange, segment: r.exchangeSegment,
          strike: r.strike!, type: optionType, expiry: r.expiry!, lot: r.lotSize, source: "dhan" };
      } catch { /* fall back to the exchange calendar */ }
    }
    if (!c) {
      const s = syntheticContract(inst.name, price, nowMs, skip);
      const sym = `${spec.underlying}-${s.expiry}-${s.strike}-${optionType}`;
      c = { securityId: `SIM:${sym}`, symbol: sym, instrument: inst.name, exchange: spec.exchange, segment: spec.exchange === "NSE" ? "NSE_FNO" : "BSE_FNO",
        strike: s.strike, type: optionType, expiry: s.expiry, lot: s.lot, source: "calendar" };
    }
    this.acct.contracts[c.securityId] = c;
    return { securityId: c.securityId, exchangeSegment: c.segment, tradingSymbol: c.symbol, lotSize: c.lot, expiry: c.expiry, strike: c.strike, optionType };
  }

  private record(o: Omit<SimOrder, "id" | "at">): SimOrder {
    const ord: SimOrder = { id: `SIM-${this.mkt.now.toString(36)}-${++this.seq}`, at: this.mkt.now, ...o };
    this.acct.orders.push(ord);
    if (this.acct.orders.length > 800) this.acct.orders.splice(0, this.acct.orders.length - 800);
    return ord;
  }

  /** Fill a SELL of `qty` units at `px` (before slippage), updating cash and realised P&L. */
  private fillSell(c: Contract, qty: number, px: number, kind: SimOrder["kind"], tag: string, note: string, trigger?: number, keep = true): SimOrder {
    const pos = this.acct.positions[c.securityId];
    const fill = tick(px * (1 - CHARGES.slippagePct / 100));
    const ch = charges("SELL", fill * qty, c.exchange);
    this.acct.cash += fill * qty - ch.total;
    this.acct.charges += ch.total;
    this.acct.realised += (fill - pos.avg) * qty;
    pos.qty -= qty;
    if (pos.qty <= 0) delete this.acct.positions[c.securityId];
    const row = { securityId: c.securityId, symbol: c.symbol, side: "SELL" as const, qty, kind, trigger, status: "TRADED" as const, price: fill, charges: ch.total, note, tag };
    return keep ? this.record(row) : { id: "", at: this.mkt.now, ...row };
  }

  async marketOrder(ri: ResolvedInstrument, side: "BUY" | "SELL", qty: number, tag: string): Promise<OrderResult> {
    const c = this.acct.contracts[ri.securityId];
    const reject = (note: string): OrderResult => {
      this.record({ securityId: ri.securityId, symbol: ri.tradingSymbol, side, qty, kind: "MARKET", status: "REJECTED", note, tag });
      return { ok: false, message: note };
    };
    if (!c) return reject("unknown contract");
    if (side === "SELL") {
      // already closed by the broker's square-off or a stop: report that order, like the broker would show it
      if (!this.acct.positions[c.securityId]) {
        const last = [...this.acct.orders].reverse().find((o) => o.securityId === c.securityId && o.side === "SELL" && o.status === "TRADED");
        return last ? { ok: true, orderId: last.id, status: "TRADED", message: "position already closed" } : reject("no open position to sell");
      }
    }
    if (!this.marketOpen()) return reject("market closed");
    const px = this.premium(c);
    if (px === null) return reject("no fresh price for the underlying");
    if (side === "BUY") {
      const fill = tick(px * (1 + CHARGES.slippagePct / 100));
      const ch = charges("BUY", fill * qty, c.exchange);
      if (fill * qty + ch.total > this.acct.cash) return reject(`insufficient funds: need Rs ${Math.round(fill * qty + ch.total)}, have Rs ${Math.round(this.acct.cash)}`);
      this.acct.cash -= fill * qty + ch.total;
      this.acct.charges += ch.total;
      const pos = this.acct.positions[c.securityId];
      if (pos) { pos.avg = (pos.avg * pos.qty + fill * qty) / (pos.qty + qty); pos.qty += qty; }
      else this.acct.positions[c.securityId] = { securityId: c.securityId, qty, avg: fill, openedAt: this.mkt.now };
      const o = this.record({ securityId: c.securityId, symbol: c.symbol, side, qty, kind: "MARKET", status: "TRADED", price: fill, charges: ch.total, note: `model premium ${px.toFixed(2)} + slippage`, tag });
      return { ok: true, orderId: o.id, status: "TRADED", message: "filled (simulated)" };
    }
    const held = this.acct.positions[c.securityId].qty;
    const o = this.fillSell(c, Math.min(qty, held), px, "MARKET", tag, `model premium ${px.toFixed(2)} - slippage`);
    return { ok: true, orderId: o.id, status: "TRADED", message: "filled (simulated)" };
  }

  async stopOrder(ri: ResolvedInstrument, side: "BUY" | "SELL", qty: number, triggerPrice: number, tag: string): Promise<OrderResult> {
    const c = this.acct.contracts[ri.securityId];
    if (!c || side !== "SELL" || !this.acct.positions[c.securityId]) {
      this.record({ securityId: ri.securityId, symbol: ri.tradingSymbol, side, qty, kind: "SL-M", trigger: triggerPrice, status: "REJECTED", note: "no position to protect", tag });
      return { ok: false, message: "no position to protect" };
    }
    const o = this.record({ securityId: c.securityId, symbol: c.symbol, side, qty, kind: "SL-M", trigger: tick(triggerPrice), status: "PENDING", note: "stop-loss market, waiting", tag });
    return { ok: true, orderId: o.id, status: "PENDING", message: "stop placed (simulated)" };
  }

  async orderState(orderId: string): Promise<OrderState> {
    const o = this.acct.orders.find((x) => x.id === orderId);
    return { status: o ? o.status : null, avgPrice: o?.price ?? null };
  }

  async orderStatus(orderId: string): Promise<string | null> { return (await this.orderState(orderId)).status; }

  async cancel(orderId: string): Promise<boolean> {
    const o = this.acct.orders.find((x) => x.id === orderId);
    if (!o || o.status !== "PENDING") return false;
    o.status = "CANCELLED"; o.note = "cancelled";
    return true;
  }

  /** Run before the executor each cycle: trigger stops, expire contracts, and the broker's own square-off. */
  housekeeping(): string[] {
    const notes: string[] = [];
    const open = this.marketOpen();
    // stop-loss orders
    for (const o of this.acct.orders.filter((x) => x.kind === "SL-M" && x.status === "PENDING")) {
      const c = this.acct.contracts[o.securityId], pos = this.acct.positions[o.securityId];
      if (!c || !pos) { o.status = "CANCELLED"; o.note = "position gone"; continue; }
      const px = open ? this.premium(c) : null;
      if (px !== null && px <= o.trigger!) {
        const f = this.fillSell(c, Math.min(o.qty, pos.qty), Math.min(px, o.trigger!), "SL-M", o.tag, `stop triggered at ${o.trigger}`, o.trigger, false);
        o.status = "TRADED"; o.price = f.price; o.charges = f.charges; o.at = this.mkt.now; o.note = `triggered at ${o.trigger}, filled ${f.price}`;
        notes.push(`stop filled ${c.symbol}`);
      }
    }
    // broker square-off at 15:20 IST (intraday product), or anything left from an earlier day
    const pastSquareOff = istHM(this.mkt.now) >= SQUARE_OFF_IST;
    for (const pos of Object.values(this.acct.positions)) {
      const c = this.acct.contracts[pos.securityId];
      const fromEarlierDay = istDay(pos.openedAt) < istDay(this.mkt.now);
      if (!c || !(fromEarlierDay || pastSquareOff)) continue;
      // price as at the square-off time (latest quote of that session)
      const q = this.mkt.quotes[c.instrument];
      const at = q ? Math.min(this.mkt.now, q.t + 5 * 60000) : this.mkt.now;
      const px = this.premium(c, at) ?? (q ? Math.max(0, c.type === "CE" ? q.last - c.strike : c.strike - q.last) : 0);
      for (const o of this.acct.orders.filter((x) => x.securityId === c.securityId && x.status === "PENDING")) { o.status = "CANCELLED"; o.note = "cancelled at square-off"; }
      this.fillSell(c, pos.qty, px, "SQUARE-OFF", "BROKER", `broker intraday square-off at ${SQUARE_OFF_IST} IST`);
      notes.push(`square-off ${c.symbol}`);
    }
    return notes;
  }

  /** Mark open positions to the model price and add a point to the equity curve (at most every 5 minutes). */
  mark(): { equity: number; openPnl: number } {
    let value = 0, cost = 0;
    for (const p of Object.values(this.acct.positions)) {
      const c = this.acct.contracts[p.securityId];
      const px = c ? this.premium(c) ?? p.avg : p.avg;
      value += px * p.qty; cost += p.avg * p.qty;
    }
    const equity = this.acct.cash + value;
    this.acct.snapshot = { at: this.mkt.now, equity: Math.round(equity), openPnl: Math.round(value - cost), vix: this.mkt.vix,
      positions: Object.values(this.acct.positions).map((p) => { const c = this.acct.contracts[p.securityId]; const px = c ? this.premium(c) : null;
        return { securityId: p.securityId, symbol: c?.symbol || p.securityId, qty: p.qty, avg: p.avg, last: px, pnl: px !== null ? Math.round((px - p.avg) * p.qty) : null }; }) };
    if (!this.acct.lastMark || this.mkt.now - this.acct.lastMark >= 5 * 60000) {
      this.acct.equity.push({ t: this.mkt.now, v: Math.round(equity) });
      if (this.acct.equity.length > 3000) this.acct.equity.splice(0, this.acct.equity.length - 3000);
      this.acct.lastMark = this.mkt.now;
    }
    return { equity, openPnl: value - cost };
  }
}
