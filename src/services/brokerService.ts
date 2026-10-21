/**
 * CONFLUENCE ENGINE - DHAN BROKER BRIDGE (API v2)
 *
 * Server-side only. Credentials come from server environment variables
 * (DHAN_CLIENT_ID, DHAN_ACCESS_TOKEN) and are never sent to the browser or
 * stored in the database. Dhan requires a whitelisted static IP for orders.
 *
 * Instrument ids and lot sizes are read from Dhan's own instrument list each
 * day, so nothing is hard-coded. If an instrument cannot be resolved, no order
 * is sent.
 */

const API = "https://api.dhan.co/v2";
const SCRIP_MASTER = "https://images.dhan.co/api-data/api-scrip-master.csv";

export interface ResolvedInstrument {
  securityId: string;
  exchangeSegment: "NSE_EQ" | "NSE_FNO" | "BSE_FNO" | "BSE_EQ";
  tradingSymbol: string;
  lotSize: number;
  expiry?: string;
  strike?: number;
  optionType?: "CE" | "PE";
}

export interface OrderState {
  status: string | null; // TRADED, PENDING, REJECTED, CANCELLED, ...
  avgPrice: number | null; // average traded price once filled
}

export interface OrderResult {
  ok: boolean;
  orderId?: string;
  status?: string;
  message: string;
}

export class BrokerService {
  private clientId = process.env.DHAN_CLIENT_ID || "";
  private token = process.env.DHAN_ACCESS_TOKEN || "";
  private master: { day: string; rows: string[][]; col: Record<string, number> } | null = null;

  isConfigured(): boolean {
    return !!(this.clientId && this.token);
  }

  private headers() {
    return { "Content-Type": "application/json", Accept: "application/json", "access-token": this.token };
  }

  private async loadMaster(): Promise<NonNullable<BrokerService["master"]>> {
    const day = new Date().toISOString().slice(0, 10);
    if (this.master && this.master.day === day) return this.master;
    const res = await fetch(SCRIP_MASTER);
    if (!res.ok) throw new Error(`Dhan instrument list HTTP ${res.status}`);
    const lines = (await res.text()).trim().split(/\r?\n/);
    const head = lines[0].split(",").map((h) => h.trim());
    const col: Record<string, number> = {};
    head.forEach((h, i) => (col[h] = i));
    this.master = { day, rows: lines.slice(1).map((l) => l.split(",")), col };
    return this.master;
  }

  /** Find the Dhan security id and lot size for an index future (nearest expiry) or an NSE stock. */
  async resolve(spec: { kind: "FUTIDX" | "EQ"; underlying: string; exchange: "NSE" | "BSE" }): Promise<ResolvedInstrument> {
    const m = await this.loadMaster();
    const c = (name: string) => {
      const k = Object.keys(m.col).find((h) => h === name);
      if (k === undefined) throw new Error(`Dhan instrument list has no column ${name}`);
      return m.col[k];
    };
    const idCol = Object.keys(m.col).find((h) => /SECURITY_ID$/.test(h) && !/UNDERLYING/.test(h));
    if (!idCol) throw new Error("Dhan instrument list: security id column not found");
    const iId = m.col[idCol], iEx = c("SEM_EXM_EXCH_ID"), iInst = c("SEM_INSTRUMENT_NAME"), iSym = c("SEM_TRADING_SYMBOL"), iLot = c("SEM_LOT_UNITS");
    const iExp = m.col["SEM_EXPIRY_DATE"], iSeries = m.col["SEM_SERIES"];
    const today = new Date().toISOString().slice(0, 10);

    if (spec.kind === "EQ") {
      const row = m.rows.find((r) => r[iEx] === spec.exchange && r[iInst] === "EQUITY" && r[iSym] === spec.underlying && (iSeries === undefined || r[iSeries] === "EQ"));
      if (!row) throw new Error(`No Dhan equity row for ${spec.underlying}`);
      return { securityId: row[iId], exchangeSegment: spec.exchange === "NSE" ? "NSE_EQ" : "BSE_EQ", tradingSymbol: row[iSym], lotSize: 1 };
    }
    const futs = m.rows
      .filter((r) => r[iEx] === spec.exchange && r[iInst] === "FUTIDX" && r[iSym].toUpperCase().startsWith(`${spec.underlying}-`))
      .map((r) => ({ r, exp: iExp !== undefined ? String(r[iExp]).slice(0, 10) : "" }))
      .filter((x) => !x.exp || x.exp >= today)
      .sort((a, b) => a.exp.localeCompare(b.exp));
    if (!futs.length) throw new Error(`No Dhan index future for ${spec.underlying}`);
    const { r, exp } = futs[0];
    return { securityId: r[iId], exchangeSegment: spec.exchange === "NSE" ? "NSE_FNO" : "BSE_FNO", tradingSymbol: r[iSym], lotSize: Number(r[iLot]) || 0, expiry: exp };
  }

  /**
   * At-the-money option to BUY for a signal: CE for a buy signal, PE for a sell signal.
   * Index options (OPTIDX) for indices, stock options (OPTSTK) for stocks; nearest expiry,
   * skipping a contract that expires today unless OPTION_TRADE_EXPIRY_DAY=true; strike nearest to `price`.
   */
  async resolveOption(spec: { kind: "FUTIDX" | "EQ"; underlying: string; exchange: "NSE" | "BSE" }, optionType: "CE" | "PE", price: number, nowMs = Date.now()): Promise<ResolvedInstrument> {
    const m = await this.loadMaster();
    const need = (name: string) => { if (m.col[name] === undefined) throw new Error(`Dhan instrument list has no column ${name}`); return m.col[name]; };
    const idCol = Object.keys(m.col).find((h) => /SECURITY_ID$/.test(h) && !/UNDERLYING/.test(h));
    if (!idCol) throw new Error("Dhan instrument list: security id column not found");
    const iId = m.col[idCol], iEx = need("SEM_EXM_EXCH_ID"), iInst = need("SEM_INSTRUMENT_NAME"), iSym = need("SEM_TRADING_SYMBOL"), iLot = need("SEM_LOT_UNITS");
    const iExp = need("SEM_EXPIRY_DATE"), iK = need("SEM_STRIKE_PRICE"), iT = need("SEM_OPTION_TYPE");
    const today = new Date(nowMs + 5.5 * 3600000).toISOString().slice(0, 10);
    const okExpiryDay = process.env.OPTION_TRADE_EXPIRY_DAY === "true";
    const inst = spec.kind === "FUTIDX" ? "OPTIDX" : "OPTSTK";
    const rows = m.rows.filter((r) => r[iEx] === spec.exchange && r[iInst] === inst && r[iT] === optionType && r[iSym].toUpperCase().startsWith(`${spec.underlying}-`));
    const exps = [...new Set(rows.map((r) => String(r[iExp]).slice(0, 10)))].filter((e) => (okExpiryDay ? e >= today : e > today)).sort();
    if (!exps.length) throw new Error(`No Dhan ${optionType} options for ${spec.underlying}`);
    const chain = rows.filter((r) => String(r[iExp]).slice(0, 10) === exps[0]);
    const r = chain.reduce((a, b) => (Math.abs(Number(b[iK]) - price) < Math.abs(Number(a[iK]) - price) ? b : a));
    return { securityId: r[iId], exchangeSegment: spec.exchange === "NSE" ? "NSE_FNO" : "BSE_FNO", tradingSymbol: r[iSym], lotSize: Number(r[iLot]) || 0,
      expiry: exps[0], strike: Number(r[iK]), optionType };
  }

  private async post(path: string, body: object): Promise<OrderResult> {
    try {
      const res = await fetch(`${API}${path}`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { /* non-JSON */ }
      if (res.ok && data.orderId) return { ok: true, orderId: String(data.orderId), status: data.orderStatus, message: "accepted" };
      return { ok: false, message: data.errorMessage || data.remarks || data.message || `HTTP ${res.status}: ${text.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, message: `Network error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /** Intraday market order. */
  marketOrder(inst: ResolvedInstrument, side: "BUY" | "SELL", quantity: number, tag: string): Promise<OrderResult> {
    return this.post("/orders", {
      dhanClientId: this.clientId, correlationId: tag.slice(0, 30), transactionType: side, exchangeSegment: inst.exchangeSegment,
      productType: "INTRADAY", orderType: "MARKET", validity: "DAY", securityId: inst.securityId, quantity, price: 0, afterMarketOrder: false,
    });
  }

  /** Protective stop (stop-loss market) for an open position. */
  stopOrder(inst: ResolvedInstrument, side: "BUY" | "SELL", quantity: number, triggerPrice: number, tag: string): Promise<OrderResult> {
    return this.post("/orders", {
      dhanClientId: this.clientId, correlationId: tag.slice(0, 30), transactionType: side, exchangeSegment: inst.exchangeSegment,
      productType: "INTRADAY", orderType: "STOP_LOSS_MARKET", validity: "DAY", securityId: inst.securityId, quantity,
      price: 0, triggerPrice: Math.round(triggerPrice * 20) / 20, afterMarketOrder: false,
    });
  }

  async orderStatus(orderId: string): Promise<string | null> {
    return (await this.orderState(orderId)).status;
  }

  async orderState(orderId: string): Promise<OrderState> {
    try {
      const res = await fetch(`${API}/orders/${orderId}`, { headers: this.headers() });
      const data: any = await res.json();
      const d = Array.isArray(data) ? data[0] : data;
      const px = Number(d?.averageTradedPrice ?? d?.price);
      return { status: d?.orderStatus ?? null, avgPrice: px > 0 ? px : null };
    } catch {
      return { status: null, avgPrice: null };
    }
  }

  async cancel(orderId: string): Promise<boolean> {
    try {
      const res = await fetch(`${API}/orders/${orderId}`, { method: "DELETE", headers: this.headers() });
      return res.ok;
    } catch {
      return false;
    }
  }
}
