/**
 * CONFLUENCE ENGINE - SIMULATOR OPTION PRICER
 *
 * Prices Indian index and stock options from the live index price and India VIX,
 * so paper orders fill at realistic premiums without a paid data feed.
 *
 * Calibrated on real NSE (Nifty, Jul-Oct 2026) and BSE (Sensex, Mar-Oct 2026) daily
 * option prices, fitted on the first half and checked on the second:
 *  - Black-Scholes, time counted in TRADING time (a session loses a full day of decay)
 *  - volatility = India VIX x a multiplier by days-to-expiry and moneyness (table below)
 *  - Bank Nifty and stocks: VIX x (their 20-day volatility / Nifty's)
 *  - big-gap opens are priced richer: +20% per ADR of gap at 09:15, fading to 0 by 11:15
 * Out-of-sample accuracy: at-the-money premiums typically within 13-14% of the real price;
 * open-to-close P&L direction matched in about 90% of the brain's signal trades.
 */

import { HOLIDAYS } from "../core/instruments.js";

const IV_TABLE: Record<string, number> = {
  "NIFTY|6-7|ITM": 0.82, "NIFTY|6-7|ATM": 0.86, "NIFTY|6-7|OTM": 0.88, "NIFTY|8-14|ITM": 1.04, "NIFTY|8-14|ATM": 0.88, "NIFTY|8-14|OTM": 0.9,
  "SENSEX|1|ITM": 0.98, "SENSEX|1|ATM": 0.92, "SENSEX|1|OTM": 1.04, "SENSEX|2|ITM": 1.18, "SENSEX|2|ATM": 0.86, "SENSEX|2|OTM": 0.9,
  "SENSEX|3|ITM": 1.06, "SENSEX|3|ATM": 0.96, "SENSEX|3|OTM": 0.96, "SENSEX|4-5|ITM": 1.22, "SENSEX|4-5|ATM": 0.94, "SENSEX|4-5|OTM": 1.26,
  "SENSEX|6-7|ITM": 0.96, "SENSEX|6-7|ATM": 0.96, "SENSEX|6-7|OTM": 0.96, "SENSEX|8-14|ITM": 0.98, "SENSEX|8-14|ATM": 0.98, "SENSEX|8-14|OTM": 0.98,
};
const IV_GLOBAL = 0.96;
const R = 0.065; // risk-free rate
export const GAP_OPEN_RICHNESS = 0.2; // per ADR of gap, at the open

const IST = 5.5 * 3600000;
const istDate = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
const istHours = (ms: number) => { const d = new Date(ms + IST); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const isSession = (d: string) => { const wd = new Date(`${d}T12:00:00Z`).getUTCDay(); return wd !== 0 && wd !== 6 && !HOLIDAYS.IN.has(d); };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function normCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function bs(S: number, K: number, T: number, sigma: number, type: "CE" | "PE"): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, type === "CE" ? S - K : K - S);
  const v = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (R + 0.5 * sigma * sigma) * T) / v, d2 = d1 - v;
  return type === "CE" ? S * normCdf(d1) - K * Math.exp(-R * T) * normCdf(d2) : K * Math.exp(-R * T) * normCdf(-d2) - S * normCdf(-d1);
}

/** Years of trading time from `nowMs` to 15:30 IST on `expiry` (sessions 09:15-15:30, 252 a year). */
export function tradingYears(nowMs: number, expiry: string): number {
  const today = istDate(nowMs);
  if (today > expiry) return 0;
  const frac = Math.min(Math.max((15.5 - istHours(nowMs)) / 6.25, 0), 1) * (isSession(today) ? 1 : 0);
  let n = 0;
  for (let d = addDays(today, 1); d <= expiry; d = addDays(d, 1)) if (isSession(d)) n++;
  return (frac + n) / 252;
}

function ivMultiplier(family: "NIFTY" | "SENSEX", dte: number, mSigned: number): number {
  const db = dte <= 1 ? "1" : dte <= 2 ? "2" : dte <= 3 ? "3" : dte <= 5 ? "4-5" : dte <= 7 ? "6-7" : "8-14";
  const mb = mSigned < -0.007 ? "ITM" : mSigned > 0.007 ? "OTM" : "ATM";
  return IV_TABLE[`${family}|${db}|${mb}`] ?? IV_GLOBAL;
}

export interface PriceInput {
  instrument: string; // NIFTY, SENSEX, BANK NIFTY, RELIANCE, ...
  spot: number;
  strike: number;
  type: "CE" | "PE";
  expiry: string; // YYYY-MM-DD
  nowMs: number;
  vix: number; // India VIX, e.g. 15.7
  volRatio: number; // instrument 20-day vol / Nifty 20-day vol (1 for Nifty and Sensex)
  gapAdr: number; // |today's open - yesterday's close| / ADR (0 if unknown)
  sessionStart: number; // epoch ms of today's open
}

export function priceOption(p: PriceInput): number {
  const T = tradingYears(p.nowMs, p.expiry);
  if (T <= 0) return Math.max(0, p.type === "CE" ? p.spot - p.strike : p.strike - p.spot);
  const dte = Math.round((Date.parse(`${p.expiry}T00:00:00Z`) - Date.parse(`${istDate(p.nowMs)}T00:00:00Z`)) / 86400000);
  const family = p.instrument === "SENSEX" ? "SENSEX" : "NIFTY";
  const mSigned = ((p.strike - p.spot) / p.spot) * (p.type === "CE" ? 1 : -1);
  const ratio = p.instrument === "NIFTY" || p.instrument === "SENSEX" ? 1 : Math.min(3, Math.max(0.6, p.volRatio || 1));
  const mins = (p.nowMs - p.sessionStart) / 60000;
  const openBoost = 1 + GAP_OPEN_RICHNESS * Math.abs(p.gapAdr || 0) * Math.max(0, 1 - Math.max(0, mins) / 120);
  const sigma = (ivMultiplier(family, dte, mSigned) * p.vix * ratio * openBoost) / 100;
  return bs(p.spot, p.strike, T, sigma, p.type);
}

// ---------------------------------------------------------------- contract calendar (fallback when Dhan's list is unreachable)

const prevSession = (d: string) => { while (!isSession(d)) d = addDays(d, -1); return d; };
function weekly(today: string, weekday: number, skipToday: boolean): string {
  for (let i = 0; i < 21; i++) {
    const d = addDays(today, i);
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== weekday) continue;
    const e = prevSession(d);
    if (e > today || (e === today && !skipToday)) return e;
  }
  return addDays(today, 7);
}
function monthlyLastTuesday(today: string, skipToday: boolean): string {
  for (let m = 0; m < 3; m++) {
    const base = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); base.setUTCMonth(base.getUTCMonth() + m + 1, 0); // last day of month m
    let d = base.toISOString().slice(0, 10);
    while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 2) d = addDays(d, -1);
    const e = prevSession(d);
    if (e > today || (e === today && !skipToday)) return e;
  }
  return addDays(today, 30);
}

/** Fallback contract spec (expiry rule, strike step, lot size) when Dhan's instrument list cannot be loaded. */
export function syntheticContract(instrument: string, spot: number, nowMs: number, skipExpiryDay: boolean) {
  const today = istDate(nowMs);
  const step = instrument === "NIFTY" ? 50 : instrument === "BANK NIFTY" || instrument === "SENSEX" ? 100 : spot < 500 ? 5 : spot < 1000 ? 10 : spot < 2500 ? 20 : 50;
  const lot = instrument === "NIFTY" ? 65 : instrument === "BANK NIFTY" ? 30 : instrument === "SENSEX" ? 20 : Math.max(1, Math.round(600000 / spot / 25) * 25);
  const expiry = instrument === "NIFTY" ? weekly(today, 2, skipExpiryDay) : instrument === "SENSEX" ? weekly(today, 4, skipExpiryDay) : monthlyLastTuesday(today, skipExpiryDay);
  return { step, lot, expiry, strike: Math.round(spot / step) * step };
}
