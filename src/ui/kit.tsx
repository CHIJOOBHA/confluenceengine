/**
 * ROKI UI KIT - the few building blocks every page uses, and the formatting rules.
 * Money: each trade in its own market's currency (₹ for India, $ for US, gold, oil,
 * crypto; see core/markets.ts) with a real minus sign; rupees and dollars are never
 * added together. Prices to 2 decimals (4 below 10); percentages to 2 decimals; times in IST.
 */
import type { ReactNode } from "react";
import type { PaperTrade } from "../types";
import type { Verdict } from "../core/review";
import { money, totals, fmtMoney, type Ccy } from "../core/markets";

// ---------------------------------------------------------------- formatting
export const inr = (v: number, signed = true) =>
  `${signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : ""}₹${Math.abs(Math.round(v)).toLocaleString("en-IN")}`;
export const price = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: v < 10 ? 4 : 2, maximumFractionDigits: v < 10 ? 4 : 2 });
export const pctTxt = (v: number | null | undefined, signed = true) =>
  v === null || v === undefined ? "—" : `${signed && v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
export const share = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const IST = { timeZone: "Asia/Kolkata" } as const;
export const timeIST = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleTimeString("en-IN", { ...IST, hour: "numeric", minute: "2-digit" }) : "—");
export const dateTimeIST = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("en-IN", { ...IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
export const dayLabel = (d: string, long = false) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
export const todayIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
export const tone = (v: number | null | undefined) => (!v ? "text-ink-2" : v > 0 ? "text-gain" : "text-loss");

// ---------------------------------------------------------------- names
export const RULE_NAME: Record<string, string> = {
  GAPFADE: "Gap fade", GAPFADE30: "Gap fade, late entry (test)", XFADE: "Extreme-close fade", XFADE_SKIPDAY: "Extreme-close fade, skip day",
  BIGGAP: "Big-gap fade", BREAKOUT: "Breakout",
};
export const MARKET_NAME: Record<string, string> = {
  "IN index": "Indian indices", "IN stock": "Indian stocks", "US index": "US index", "US stock": "US stocks", commodity: "Commodities", crypto: "Crypto",
};
export const VERDICT: Record<Verdict, { label: string; won: boolean; plural: string }> = {
  target: { label: "Reached target", won: true, plural: "reached the target" },
  won_close: { label: "Won by the close", won: true, plural: "won by the close" },
  stopped: { label: "Safety stop hit", won: false, plural: "hit the safety stop" },
  gave_back: { label: "Was up, gave it back", won: false, plural: "were up, then gave it back" },
  costs: { label: "Too small to beat charges", won: false, plural: "moved too little to beat charges" },
  wrong_way: { label: "Went the wrong way", won: false, plural: "went the wrong way" },
};
/** A trade's money result in its own currency. */
export const moneyOf = (t: PaperTrade) => money(t);
export const moneyTxt = (t: PaperTrade, signed = true) => { const m = money(t); return fmtMoney(m.amount, m.ccy, signed); };
export const won = (t: PaperTrade) => (t.retPct ?? 0) > 0;
export { totals, fmtMoney };
export type { Ccy };

/** "+₹2,709 · −$122": one part per currency that has trades; zero shows as ₹0. */
export function MoneySum({ trades, signed = true, abs = false, stack = false }: { trades: PaperTrade[]; signed?: boolean; abs?: boolean; stack?: boolean }) {
  const t = totals(trades);
  const has = { INR: trades.some((x) => money(x).ccy === "INR"), USD: trades.some((x) => money(x).ccy === "USD") };
  const parts = (["INR", "USD"] as Ccy[]).filter((c) => has[c]);
  if (!parts.length) return <span className="text-ink-2">₹0</span>;
  if (stack) return <>{parts.map((c) => <div key={c} className={tone(t[c])}>{fmtMoney(t[c], c, signed)}</div>)}</>;
  return <>{parts.map((c, i) => <span key={c}>{i > 0 && <span className="text-ink-3"> · </span>}<span className={tone(t[c])}>{fmtMoney(abs ? Math.abs(t[c]) : t[c], c, signed && !abs)}</span></span>)}</>;
}

// ---------------------------------------------------------------- blocks
export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-6">
      <div className="min-w-0">
        <h1 className="font-display text-[30px] leading-[1.15]">{title}</h1>
        {sub && <p className="mt-2 text-[14px] leading-relaxed text-ink-2 max-w-[68ch]">{sub}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, sub, actions, children, flush = false, className = "" }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
      {title && (
        <header className="panel-head">
          <div className="min-w-0">
            <h2 className="panel-title">{title}</h2>
            {sub && <p className="panel-sub mt-0.5">{sub}</p>}
          </div>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, valueClass = "", foot, hint }: { label: string; value: ReactNode; valueClass?: string; foot?: ReactNode; hint?: string }) {
  return (
    <div className="panel p-5 min-w-0" title={hint}>
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className={`mt-2 text-[26px] leading-8 font-semibold tracking-[-0.02em] num ${valueClass}`}>{value}</div>
      {foot && <div className="mt-1 text-xs text-ink-3">{foot}</div>}
    </div>
  );
}

export function Badge({ kind = "neutral", children, dot = false }: { kind?: "neutral" | "brand" | "gain" | "loss" | "warn"; children: ReactNode; dot?: boolean; key?: string }) {
  return <span className={`badge badge-${kind}`}>{dot && <span className="dot" />}{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="py-10 px-4 text-center">
      <div className="text-[14px] font-medium">{title}</div>
      {children && <p className="mt-1 text-[13px] text-ink-2 max-w-[52ch] mx-auto">{children}</p>}
    </div>
  );
}

export function TableWrap({ children, max }: { children: ReactNode; max?: string }) {
  return <div className={`overflow-auto ${max ?? ""}`}>{children}</div>;
}
