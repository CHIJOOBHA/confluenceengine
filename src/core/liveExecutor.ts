/**
 * CONFLUENCE ENGINE - LIVE EXECUTOR (option buying)
 *
 * Mirrors the brain's ACTIVE paper trades in Indian markets to Dhan by BUYING an
 * at-the-money option: a BUY signal buys a CE, a SELL signal buys a PE. The most a
 * trade can lose is the premium paid. Orders go out only when every gate is open:
 *   1. server env LIVE_TRADING_ENABLED=true (set by the owner on the server)
 *   2. the owner switched "live" on in the dashboard
 *   3. the kill switch is off
 *   4. Dhan keys are configured on the server
 *   5. the trade is active (rule tested positive for that market), Indian, and
 *      entered within the last LIVE_ENTRY_WINDOW_MIN minutes (no late catch-up orders)
 *   6. today's live trade count and realised loss are inside the risk limits
 * Shadow trades, US stocks, commodities and crypto are never sent.
 *
 * Order flow for one trade:
 *   entry : market BUY of OPTION_LOTS lots -> confirm fill and premium -> if the premium
 *           is above MAX_PREMIUM_PER_TRADE_INR, sell straight back -> otherwise place a
 *           backstop stop-loss on the option (OPTION_BACKSTOP_PCT below the fill), which
 *           only matters if the app stops running
 *   exit  : when the brain closes the paper trade (its index stop, target or session close),
 *           at LIVE_FLATTEN_IST (default 15:10, before Dhan's intraday square-off), or when
 *           the kill switch is on: cancel the backstop -> market SELL -> if that fails, put the
 *           backstop back and retry on the next run
 */

import { PaperTrade } from "./brain.js";
import { INSTRUMENTS } from "./instruments.js";
import { BrokerService, ResolvedInstrument } from "../services/brokerService.js";
import { RISK } from "./risk-manager.js";

export interface LiveGate {
  envEnabled: boolean;
  ownerEnabled: boolean;
  killSwitch: boolean;
}

/** The parts of BrokerService the executor uses (so tests can pass a fake broker). */
export type Broker = Pick<BrokerService, "isConfigured" | "resolveOption" | "marketOrder" | "stopOrder" | "orderState" | "cancel">;

const ENTRY_WINDOW_MIN = Number(process.env.LIVE_ENTRY_WINDOW_MIN || 15);
const FLATTEN_IST = process.env.LIVE_FLATTEN_IST || "15:10";
const IST = 5.5 * 3600000;
const istDay = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
const istHM = (ms: number) => new Date(ms + IST).toISOString().slice(11, 16);
const BAD = new Set(["REJECTED", "CANCELLED", "EXPIRED"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tick = (x: number) => Math.max(0.05, Math.round(x * 20) / 20);
const inr = (x: number) => `Rs ${Math.round(x).toLocaleString("en-IN")}`;

export async function mirrorLive(
  changed: PaperTrade[],
  all: Record<string, PaperTrade>,
  gate: LiveGate,
  broker: Broker,
  now = Date.now(),
  log: (m: string) => void = console.log,
  confirmDelayMs = 1500,
): Promise<PaperTrade[]> {
  const updated = new Map<string, PaperTrade>();
  const cur = (t: PaperTrade) => updated.get(t.id) || changed.find((c) => c.id === t.id) || all[t.id] || t;
  const put = (t: PaperTrade) => updated.set(t.id, t);
  const live = gate.envEnabled && gate.ownerEnabled && !gate.killSwitch && broker.isConfigured();
  const today = istDay(now);
  const pastFlatten = istHM(now) >= FLATTEN_IST;
  const confirm = async (orderId: string) => {
    for (let i = 0; i < 3; i++) {
      if (confirmDelayMs) await sleep(confirmDelayMs);
      const s = await broker.orderState(orderId);
      if (s.status === "TRADED" || (s.status && BAD.has(s.status))) return s;
    }
    return broker.orderState(orderId);
  };
  const held = (t: PaperTrade): ResolvedInstrument => ({ securityId: t.brokerSecurityId!, exchangeSegment: t.brokerSegment!, tradingSymbol: t.brokerSymbol!, lotSize: 1 });

  // ------------------------------------------------------------ exits
  const ids = new Set([...Object.keys(all), ...changed.map((c) => c.id)]);
  for (const id of ids) {
    const t = cur(all[id] || changed.find((c) => c.id === id)!);
    if (!t.brokerOrderId || t.brokerExitOrderId || !t.brokerQty || !t.brokerSecurityId) continue;
    const why =
      t.status === "closed" ? "brain closed the trade" :
      gate.killSwitch ? "kill switch" :
      (pastFlatten || t.session < today) ? `flatten at ${FLATTEN_IST} IST, before the broker's square-off` : null;
    if (!why) continue;
    try {
      if (t.brokerStopOrderId) {
        const s = await broker.orderState(t.brokerStopOrderId);
        if (s.status === "TRADED") {
          put({ ...t, brokerExitOrderId: t.brokerStopOrderId, brokerExitPrice: s.avgPrice ?? undefined, brokerNote: "Closed at the broker by the backstop stop" });
          continue;
        }
        await broker.cancel(t.brokerStopOrderId);
      }
      const r = await broker.marketOrder(held(t), "SELL", t.brokerQty, `CE-X-${t.session}-${t.instrument}`);
      if (r.ok) {
        const s = await confirm(r.orderId!);
        put({ ...t, brokerExitOrderId: r.orderId, brokerExitPrice: s.avgPrice ?? undefined,
          brokerNote: `Sold ${t.brokerSymbol} (${why})${s.avgPrice && t.brokerEntryPrice ? `: ${inr((s.avgPrice - t.brokerEntryPrice) * t.brokerQty)}` : ""}` });
        log(`[LIVE] exit ${t.id} (${why}) ${s.status}`);
      } else {
        const back = t.brokerEntryPrice ? await broker.stopOrder(held(t), "SELL", t.brokerQty, tick(t.brokerEntryPrice * (1 - RISK.optionBackstopPct / 100)), `CE-S-${t.session}-${t.instrument}`) : null;
        put({ ...t, brokerStopOrderId: back?.ok ? back.orderId : undefined,
          brokerNote: `SELL FAILED (${r.message}); backstop ${back?.ok ? "re-placed" : "NOT placed"}; retrying next run - check Dhan` });
        log(`[LIVE] exit FAILED ${t.id}: ${r.message}`);
      }
    } catch (e) {
      put({ ...t, brokerNote: `Exit error: ${e instanceof Error ? e.message : String(e)} - check Dhan` });
    }
  }

  // ------------------------------------------------------------ entries
  const todays = [...ids].map((id) => cur(all[id] || changed.find((c) => c.id === id)!)).filter((t) => t.brokerOrderId && t.entryTime && istDay(t.entryTime) === today);
  let count = todays.length;
  const lossToday = -todays.filter((t) => t.brokerExitPrice && t.brokerEntryPrice)
    .reduce((s, t) => s + (t.brokerExitPrice! - t.brokerEntryPrice!) * (t.brokerQty || 0), 0);

  for (const t0 of changed) {
    const t = cur(t0);
    const inst = INSTRUMENTS.find((i) => i.name === t.instrument);
    if (!inst?.dhan || t.mode !== "active") continue;
    if (t.status !== "open" || t.brokerOrderId || t.brokerNote || !t.entryTime || !t.entry) continue;
    if (!live) continue;
    if (now - t.entryTime > ENTRY_WINDOW_MIN * 60000) { put({ ...t, brokerNote: `Not sent: entry was more than ${ENTRY_WINDOW_MIN} minutes ago` }); continue; }
    if (pastFlatten) { put({ ...t, brokerNote: `Not sent: after ${FLATTEN_IST} IST` }); continue; }
    if (count >= RISK.maxLiveTradesPerDay) { put({ ...t, brokerNote: `Not sent: ${RISK.maxLiveTradesPerDay} live trade(s) a day limit reached` }); continue; }
    if (lossToday >= RISK.dailyLossLimitInr) { put({ ...t, brokerNote: `Not sent: daily loss limit ${inr(RISK.dailyLossLimitInr)} reached` }); continue; }
    try {
      const type = t.side === 1 ? "CE" : "PE";
      const ri = await broker.resolveOption(inst.dhan, type, t.entry, now);
      const qty = Math.max(1, Math.floor(RISK.optionLots)) * ri.lotSize;
      if (!qty) { put({ ...t, brokerNote: `Not sent: no lot size for ${ri.tradingSymbol}` }); continue; }
      const base = { brokerSymbol: ri.tradingSymbol, brokerSecurityId: ri.securityId, brokerSegment: ri.exchangeSegment };
      const buy = await broker.marketOrder(ri, "BUY", qty, `CE-${t.session}-${t.instrument}`);
      if (!buy.ok) { put({ ...t, ...base, brokerNote: `Buy ${ri.tradingSymbol} rejected: ${buy.message}` }); continue; }
      count++;
      const s = await confirm(buy.orderId!);
      if (s.status && BAD.has(s.status)) { put({ ...t, ...base, brokerNote: `Buy ${ri.tradingSymbol} ${s.status} by the broker - nothing open` }); continue; }
      const paid = s.avgPrice;
      const opened = { ...t, ...base, brokerOrderId: buy.orderId, brokerQty: qty, brokerEntryPrice: paid ?? undefined };
      if (paid && paid * qty > RISK.maxPremiumPerTradeInr) {
        const out = await broker.marketOrder(ri, "SELL", qty, `CE-X-${t.session}-${t.instrument}`);
        put({ ...opened, brokerExitOrderId: out.ok ? out.orderId : undefined,
          brokerNote: `Premium ${inr(paid * qty)} is above the ${inr(RISK.maxPremiumPerTradeInr)} limit: ${out.ok ? "sold straight back" : "SELL FAILED - close it in Dhan"}` });
        continue;
      }
      const stop = paid ? await broker.stopOrder(ri, "SELL", qty, tick(paid * (1 - RISK.optionBackstopPct / 100)), `CE-S-${t.session}-${t.instrument}`) : null;
      put({ ...opened, brokerStopOrderId: stop?.ok ? stop.orderId : undefined,
        brokerNote: `Bought ${qty} x ${ri.tradingSymbol}${paid ? ` at ${paid} (${inr(paid * qty)})` : ""}; backstop ${stop?.ok ? `at -${RISK.optionBackstopPct}%` : "NOT placed"}; exits when the brain does` });
      log(`[LIVE] bought ${ri.tradingSymbol} x${qty} for ${t.id}: ${s.status}`);
    } catch (e) {
      put({ ...t, brokerNote: `Not sent: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return [...updated.values()];
}
