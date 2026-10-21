/**
 * CONFLUENCE ENGINE - LIVE EXECUTOR
 *
 * Mirrors the brain's ACTIVE paper trades in Indian markets to Dhan, only when
 * every gate is open:
 *   1. server env LIVE_TRADING_ENABLED=true (set by the owner on the server)
 *   2. the owner switched "live" on in the dashboard
 *   3. the kill switch is off
 *   4. Dhan keys are configured on the server
 *   5. the trade is active (rule tested positive for that market), Indian, and
 *      entered within the last 10 minutes (no late catch-up orders)
 *   6. today's live trade count and loss are inside the risk limits
 * Shadow trades, US stocks, commodities and crypto are never sent.
 */

import { PaperTrade } from "./brain.js";
import { INSTRUMENTS } from "./instruments.js";
import { BrokerService } from "../services/brokerService.js";
import { RISK, sizePosition } from "./risk-manager.js";

export interface LiveGate {
  envEnabled: boolean;
  ownerEnabled: boolean;
  killSwitch: boolean;
}

const istDay = (ms: number) => new Date(ms + 5.5 * 3600000).toISOString().slice(0, 10);

export async function mirrorLive(changed: PaperTrade[], all: Record<string, PaperTrade>, gate: LiveGate, broker: BrokerService, now = Date.now(), log: (m: string) => void = console.log): Promise<PaperTrade[]> {
  const updated: PaperTrade[] = [];
  const live = gate.envEnabled && gate.ownerEnabled && !gate.killSwitch && broker.isConfigured();
  const today = istDay(now);
  const todays = Object.values(all).filter((t) => t.brokerOrderId && t.entryTime && istDay(t.entryTime) === today);
  let count = todays.length;
  // estimated live P&L today: paper return x live position value
  const lossToday = -todays
    .filter((t) => t.status === "closed" && t.retPct !== null && t.entry)
    .reduce((s, t) => s + ((t.retPct as number) / 100) * (t.entry as number) * (t.brokerQty || 0), 0);

  for (const t of changed) {
    const inst = INSTRUMENTS.find((i) => i.name === t.instrument);
    if (!inst?.dhan || t.mode !== "active") continue;

    // Exit: paper trade closed and we hold a live position
    if (t.status === "closed" && t.brokerOrderId && !t.brokerExitOrderId) {
      try {
        const ri = await broker.resolve(inst.dhan);
        const stopFilled = t.brokerStopOrderId ? (await broker.orderStatus(t.brokerStopOrderId)) === "TRADED" : false;
        if (stopFilled) {
          updated.push({ ...t, brokerExitOrderId: t.brokerStopOrderId, brokerNote: "Closed at the broker by the stop order" });
          continue;
        }
        if (t.brokerStopOrderId) await broker.cancel(t.brokerStopOrderId);
        const r = await broker.marketOrder(ri, t.side === 1 ? "SELL" : "BUY", t.brokerQty || 0, `CE-X-${t.session}-${t.instrument}`);
        updated.push({ ...t, brokerExitOrderId: r.orderId, brokerNote: `Exit: ${r.message}` });
        log(`[LIVE] exit ${t.id}: ${r.message}`);
      } catch (e) {
        updated.push({ ...t, brokerNote: `Exit failed: ${e instanceof Error ? e.message : String(e)} - close it in Dhan` });
      }
      continue;
    }

    // Entry: paper trade just opened
    if (t.status !== "open" || t.brokerOrderId || t.brokerNote || !t.entryTime) continue;
    if (!live) continue;
    if (now - t.entryTime > 10 * 60000) { updated.push({ ...t, brokerNote: "Not sent: entry was more than 10 minutes ago" }); continue; }
    if (count >= RISK.maxLiveTradesPerDay) { updated.push({ ...t, brokerNote: `Not sent: ${RISK.maxLiveTradesPerDay} live trade(s) a day limit reached` }); continue; }
    if (lossToday >= RISK.dailyLossLimitInr) { updated.push({ ...t, brokerNote: "Not sent: daily loss limit reached" }); continue; }
    try {
      const ri = await broker.resolve(inst.dhan);
      const size = sizePosition(t.entry!, t.stopDistance, ri.lotSize);
      if (size.quantity === 0) { updated.push({ ...t, brokerNote: `Not sent: ${size.note}` }); continue; }
      const side = t.side === 1 ? "BUY" : "SELL";
      const entry = await broker.marketOrder(ri, side, size.quantity, `CE-${t.session}-${t.instrument}`);
      if (!entry.ok) { updated.push({ ...t, brokerNote: `Entry rejected: ${entry.message}` }); continue; }
      const stop = await broker.stopOrder(ri, side === "BUY" ? "SELL" : "BUY", size.quantity, t.stop!, `CE-S-${t.session}-${t.instrument}`);
      count++;
      updated.push({ ...t, brokerOrderId: entry.orderId, brokerStopOrderId: stop.orderId, brokerQty: size.quantity,
        brokerNote: `Live ${side} ${size.note} in ${ri.tradingSymbol}; stop ${stop.ok ? "placed" : "FAILED: " + stop.message}` });
      log(`[LIVE] entry ${t.id}: ${entry.message}`);
    } catch (e) {
      updated.push({ ...t, brokerNote: `Not sent: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return updated;
}
