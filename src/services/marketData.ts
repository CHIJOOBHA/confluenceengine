/**
 * CONFLUENCE ENGINE - MARKET DATA
 *
 * Real prices for the brain. Server-side only. Uses Yahoo Finance's public
 * chart endpoint (delayed a few minutes; fine for paper trading). For live
 * trading, swap `fetchIntraday` for the broker's market-data feed.
 */

import { DailyBar, IntradayBar } from "../core/brain.js";

const UA = { "User-Agent": "Mozilla/5.0 (ConfluenceEngine)" };

interface ChartResult {
  meta: { exchangeTimezoneName: string };
  timestamp?: number[];
  indicators: { quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[] }[] };
}

async function chart(symbol: string, range: string, interval: string): Promise<ChartResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) {
        const json: any = await res.json();
        const r = json?.chart?.result?.[0];
        if (r) return r as ChartResult;
        lastErr = new Error(json?.chart?.error?.description || "empty chart result");
      } else {
        lastErr = new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`Market data failed for ${symbol}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

/** Calendar date of an instant in a given time zone, as YYYY-MM-DD. */
export function dateIn(tz: string, ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** Minutes since midnight of an instant in a given time zone. */
export function minutesIn(tz: string, ms: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}

function rows(r: ChartResult) {
  const q = r.indicators.quote[0];
  const ts = r.timestamp || [];
  const out: { t: number; open: number; high: number; low: number; close: number }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null || h < l) continue;
    out.push({ t: ts[i] * 1000, open: o, high: h, low: l, close: c });
  }
  return out;
}

/** Daily bars, oldest first, dated in the exchange's time zone. */
export async function fetchDaily(symbol: string, range = "5y"): Promise<{ tz: string; bars: DailyBar[] }> {
  const r = await chart(symbol, range, "1d");
  const tz = r.meta.exchangeTimezoneName;
  const byDate = new Map<string, DailyBar>();
  for (const x of rows(r)) byDate.set(dateIn(tz, x.t), { date: dateIn(tz, x.t), open: x.open, high: x.high, low: x.low, close: x.close });
  return { tz, bars: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

/** 5-minute bars of the last few sessions, oldest first. */
export async function fetchIntraday(symbol: string, range = "5d", interval = "5m"): Promise<{ tz: string; bars: IntradayBar[] }> {
  const r = await chart(symbol, range, interval);
  return { tz: r.meta.exchangeTimezoneName, bars: rows(r) };
}
