/**
 * ROKI - HOW EACH MARKET WORKS
 *
 * One place for the facts that differ between markets: the currency a trade is
 * booked in, the paper size of one trade, the real round-trip cost, the hours
 * (in the market's own time and in IST), and the contract sizes. Every page,
 * review and video reads money through `money()` so a US trade is never shown
 * in rupees and an Indian one never in dollars. Totals are only added up within
 * one currency.
 *
 * Checked on 22 Oct 2026 (sources in research/market-rules.md). Revisit:
 *  - NSE/BSE lot sizes: revised every six months (next due around Jan 2027).
 *  - STT and exchange charges: Union Budget (February) and exchange circulars.
 *  - Holiday lists: every December for the next year (instruments.ts HOLIDAYS).
 */

import type { Market } from "./brain.js";

export type Ccy = "INR" | "USD";

export interface MarketSpec {
  ccy: Ccy;
  /** Paper size of one trade, in `ccy`. */
  paperSize: number;
  /** Round-trip cost as a fraction of the trade's value (charges + one tick of slippage). */
  cost: number;
  costNote: string;
  /** Where and when it trades. */
  venue: string;
  hoursLocal: string;
  hoursIST: string;
  /** How a real trade would be sized (lots, contracts, shares). */
  sizing: string;
}

export const MARKETS: Record<Market, MarketSpec> = {
  "IN index": {
    ccy: "INR", paperSize: 100000, cost: 0.0007,
    costNote: "As one index futures lot: STT 0.05% on the sell side (from 1 Apr 2026), NSE charges 0.00183%, stamp 0.002% on the buy side, ₹20 brokerage a side, 18% GST on fees, plus a tick of slippage.",
    venue: "NSE (Nifty, Bank Nifty) and BSE (Sensex)",
    hoursLocal: "9:15 am - 3:30 pm IST, Mon-Fri; pre-open 9:00-9:08",
    hoursIST: "9:15 am - 3:30 pm",
    sizing: "The index itself can't be bought. Futures and options trade in lots: Nifty 65, Bank Nifty 30, Sensex 20 (Oct-Dec 2026 contracts). One Nifty lot is about ₹16 lakh of exposure, so a ₹1 lakh paper trade is a scaled-down record, not something a broker would fill. Weekly expiry: Nifty on Tuesday, Sensex on Thursday; Bank Nifty is monthly (last Tuesday).",
  },
  "IN stock": {
    ccy: "INR", paperSize: 100000, cost: 0.001,
    costNote: "₹1 lakh intraday (MIS): ₹20 brokerage a side, STT 0.025% on the sell side, NSE 0.00307%, stamp 0.003% on the buy side, SEBI ₹10 a crore, 18% GST: about ₹83, plus slippage.",
    venue: "NSE",
    hoursLocal: "9:15 am - 3:30 pm IST, Mon-Fri",
    hoursIST: "9:15 am - 3:30 pm",
    sizing: "Cash shares: any whole number of shares (₹1 lakh of TCS is about 33 shares). Stock futures come in lots (Reliance 500, HDFC Bank 650, ICICI Bank 700, Infosys 400, TCS 225). Settlement T+1.",
  },
  "US index": {
    ccy: "USD", paperSize: 1000, cost: 0.0002,
    costNote: "Through an index ETF such as SPY: no commission at most brokers, a one-cent spread, tiny SEC/FINRA fees on sells.",
    venue: "NYSE / Nasdaq (S&P 500)",
    hoursLocal: "9:30 am - 4:00 pm New York time, Mon-Fri",
    hoursIST: "7:00 pm - 1:30 am IST while the US is on summer time (to 1 Nov 2026), 8:00 pm - 2:30 am IST in winter",
    sizing: "The index trades through ETFs (SPY) or futures (CME E-mini ES = $50 x the index; Micro MES = $5 x). Shares can be fractional at many brokers.",
  },
  "US stock": {
    ccy: "USD", paperSize: 1000, cost: 0.0002,
    costNote: "No commission at most US brokers; about one cent of spread on large stocks; SEC and FINRA fees on sells are fractions of a cent.",
    venue: "NYSE / Nasdaq",
    hoursLocal: "9:30 am - 4:00 pm New York time; early close 1:00 pm on 27 Nov and 24 Dec 2026",
    hoursIST: "7:00 pm - 1:30 am IST in US summer time, 8:00 pm - 2:30 am IST from 2 Nov 2026",
    sizing: "Shares, no lots; fractional shares at many brokers. Options are for 100 shares. Settlement T+1. Prices in US dollars.",
  },
  commodity: {
    ccy: "USD", paperSize: 1000, cost: 0.0003,
    costNote: "CME futures: a few dollars of commission per contract and one tick of spread (gold $0.10/oz, oil $0.01/barrel), tiny against the contract's value.",
    venue: "CME Globex: COMEX gold (GC), NYMEX crude oil (CL); silver tracked through the SLV fund on NYSE hours",
    hoursLocal: "Gold and oil: Sunday-Friday 6:00 pm - 5:00 pm New York time with a one-hour daily break. Silver (SLV): 9:30 am - 4:00 pm New York time",
    hoursIST: "Gold and oil: almost round the clock, break 2:30-3:30 am IST in US summer time (3:30-4:30 am in winter)",
    sizing: "Gold GC = 100 troy ounces (Micro MGC = 10 oz), $10 a tick. Oil CL = 1,000 barrels (Micro MCL = 100), $10 a tick. Prices in US dollars. Not the same as Indian MCX gold (₹ per 10 grams) or MCX crude (₹ per barrel), which also carry the rupee's move.",
  },
  crypto: {
    ccy: "USD", paperSize: 1000, cost: 0.002,
    costNote: "Exchange taker fee about 0.1% each way, plus spread. In India, crypto sales also have 1% TDS and gains are taxed at 30%; those are taxes, not trading costs, and are left out.",
    venue: "Global crypto exchanges, priced in US dollars (BTC-USD)",
    hoursLocal: "24 hours, 7 days; Roki's crypto day runs midnight to midnight UTC",
    hoursIST: "5:30 am to 5:30 am IST",
    sizing: "Any fraction of a coin. Prices in US dollars; an Indian exchange's rupee price adds the dollar-rupee move and its own premium.",
  },
};

export const ccyOf = (m: Market): Ccy => MARKETS[m].ccy;
export const isIndian = (m: Market) => m === "IN index" || m === "IN stock";

/** Money result of a closed trade (or an open one at `mtmPct`), in its own currency. */
export function money(t: { market: Market; status: string; retPct: number | null; mtmPct: number | null }): { amount: number; ccy: Ccy } {
  const s = MARKETS[t.market];
  const pct = t.status === "closed" ? t.retPct ?? 0 : t.status === "open" && t.mtmPct !== null ? t.mtmPct : 0;
  return { amount: (pct / 100) * s.paperSize, ccy: s.ccy };
}

/** Sum money per currency; never adds rupees to dollars. */
export function totals(xs: { market: Market; status: string; retPct: number | null; mtmPct: number | null }[]): Record<Ccy, number> {
  const out: Record<Ccy, number> = { INR: 0, USD: 0 };
  for (const t of xs) { const m = money(t); out[m.ccy] += m.amount; }
  return out;
}

/** "₹1,792" / "-$4.32" style text. */
export function fmtMoney(amount: number, ccy: Ccy, signed = true): string {
  const sign = amount < 0 ? "−" : signed && amount > 0 ? "+" : "";
  const a = Math.abs(amount);
  if (ccy === "INR") return `${sign}₹${Math.round(a).toLocaleString("en-IN")}`;
  return `${sign}$${a >= 100 ? Math.round(a).toLocaleString("en-US") : a.toFixed(2)}`;
}
