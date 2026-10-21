/**
 * CONFLUENCE ENGINE - INSTRUMENTS AND SESSIONS
 *
 * What the brain watches, and when each market's session starts and ends.
 * Paper trading covers every instrument; live orders (Dhan) are only ever
 * sent for Indian indices and Indian stocks.
 */

import { Market } from "./brain";

export interface Instrument {
  name: string; // display name
  symbol: string; // Yahoo Finance symbol for prices
  market: Market;
  session: "IN" | "US" | "FUT" | "UTC";
  dhan?: { kind: "FUTIDX" | "EQ"; underlying: string; exchange: "NSE" | "BSE" };
}

export const INSTRUMENTS: Instrument[] = [
  { name: "NIFTY", symbol: "^NSEI", market: "IN index", session: "IN", dhan: { kind: "FUTIDX", underlying: "NIFTY", exchange: "NSE" } },
  { name: "SENSEX", symbol: "^BSESN", market: "IN index", session: "IN", dhan: { kind: "FUTIDX", underlying: "SENSEX", exchange: "BSE" } },
  { name: "BANK NIFTY", symbol: "^NSEBANK", market: "IN index", session: "IN", dhan: { kind: "FUTIDX", underlying: "BANKNIFTY", exchange: "NSE" } },
  { name: "RELIANCE", symbol: "RELIANCE.NS", market: "IN stock", session: "IN", dhan: { kind: "EQ", underlying: "RELIANCE", exchange: "NSE" } },
  { name: "HDFCBANK", symbol: "HDFCBANK.NS", market: "IN stock", session: "IN", dhan: { kind: "EQ", underlying: "HDFCBANK", exchange: "NSE" } },
  { name: "ICICIBANK", symbol: "ICICIBANK.NS", market: "IN stock", session: "IN", dhan: { kind: "EQ", underlying: "ICICIBANK", exchange: "NSE" } },
  { name: "INFY", symbol: "INFY.NS", market: "IN stock", session: "IN", dhan: { kind: "EQ", underlying: "INFY", exchange: "NSE" } },
  { name: "TCS", symbol: "TCS.NS", market: "IN stock", session: "IN", dhan: { kind: "EQ", underlying: "TCS", exchange: "NSE" } },
  { name: "S&P 500", symbol: "^GSPC", market: "US index", session: "US" },
  { name: "AAPL", symbol: "AAPL", market: "US stock", session: "US" },
  { name: "MSFT", symbol: "MSFT", market: "US stock", session: "US" },
  { name: "NVDA", symbol: "NVDA", market: "US stock", session: "US" },
  { name: "AMZN", symbol: "AMZN", market: "US stock", session: "US" },
  { name: "JPM", symbol: "JPM", market: "US stock", session: "US" },
  { name: "GOLD", symbol: "GC=F", market: "commodity", session: "FUT" },
  // Yahoo's SI=F daily bars are broken (12% flat bars), so silver uses the SLV fund on US hours.
  { name: "SILVER", symbol: "SLV", market: "commodity", session: "US" },
  { name: "US OIL", symbol: "CL=F", market: "commodity", session: "FUT" },
  { name: "BTC", symbol: "BTC-USD", market: "crypto", session: "UTC" },
  { name: "ETH", symbol: "ETH-USD", market: "crypto", session: "UTC" },
  { name: "SOL", symbol: "SOL-USD", market: "crypto", session: "UTC" },
  { name: "BNB", symbol: "BNB-USD", market: "crypto", session: "UTC" },
  { name: "XRP", symbol: "XRP-USD", market: "crypto", session: "UTC" },
];

/** Paper trading and at-open calls begin with this session. */
export const START_DATE = "2026-10-22";

// Weekday market holidays (from the NSE / NYSE calendars). Update every year.
const HOLIDAYS: Record<"IN" | "US", Set<string>> = {
  IN: new Set(["2026-11-10", "2026-11-24", "2026-12-25"]),
  US: new Set(["2026-11-26", "2026-12-25"]),
};

const SESSION_DEF = {
  IN: { tz: "Asia/Kolkata", open: "09:15", close: "15:30" },
  US: { tz: "America/New_York", open: "09:30", close: "16:00" },
  FUT: { tz: "America/New_York", open: "18:00", close: "17:00" }, // opens the evening before
  UTC: { tz: "UTC", open: "00:00", close: "24:00" },
} as const;

export function sessionTz(inst: Instrument): string {
  return SESSION_DEF[inst.session].tz;
}

/** Offset (ms) of a time zone from UTC at a given instant. */
function tzOffsetMs(tz: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(atMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(atMs / 1000) * 1000;
}

/** Epoch ms of a wall-clock time (YYYY-MM-DD, HH:MM) in a time zone. */
export function wallTime(tz: string, date: string, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  // two passes handle the hour around daylight-saving changes
  let t = guess - tzOffsetMs(tz, guess);
  t = guess - tzOffsetMs(tz, t);
  return t;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Start and end (epoch ms) of the session dated `date`. */
export function sessionBounds(inst: Instrument, date: string): { start: number; end: number } {
  const def = SESSION_DEF[inst.session];
  if (inst.session === "UTC") {
    const start = Date.parse(`${date}T00:00:00Z`);
    return { start, end: start + 86400000 };
  }
  if (inst.session === "FUT") {
    return { start: wallTime(def.tz, addDays(date, -1), def.open), end: wallTime(def.tz, date, def.close) };
  }
  return { start: wallTime(def.tz, date, def.open), end: wallTime(def.tz, date, def.close) };
}

/** The next session date after `date` (skips weekends and holidays). */
export function nextSession(inst: Instrument, date: string): string {
  let d = addDays(date, 1);
  if (inst.session === "UTC") return d;
  const hol = inst.session === "IN" ? HOLIDAYS.IN : HOLIDAYS.US;
  for (;;) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6 && !hol.has(d)) return d;
    d = addDays(d, 1);
  }
}

/** Crypto days run back to back, so night-before calls get 15 minutes of grace. */
export function nightCallGraceMs(inst: Instrument): number {
  return inst.session === "UTC" ? 15 * 60000 : 0;
}
