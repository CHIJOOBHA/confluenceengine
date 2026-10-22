/**
 * Money on screen, in the video's own currency: India in rupees (₹1,792), Global in US dollars ($4.32).
 * RokiInk/RokiDaily call setCcy(props.ccy) before drawing; build.py sets props.ccy from the data package.
 */
export type Ccy = "INR" | "USD";
let CCY: Ccy = "INR";
export const setCcy = (c: Ccy | undefined) => { CCY = c ?? "INR"; };
export const ccy = () => CCY;
export function money(v: number, signed = true): string {
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  const a = Math.abs(v);
  if (CCY === "INR") return `${sign}₹${Math.round(a).toLocaleString("en-IN")}`;
  return `${sign}$${a >= 100 ? Math.round(a).toLocaleString("en-US") : a.toFixed(2)}`;
}
/** A card's or total's amount: `money` (current) or `inr` (scripts written before 22 Oct 2026). */
export const amountOf = (x: { money?: number; inr?: number }) => x.money ?? x.inr ?? 0;
