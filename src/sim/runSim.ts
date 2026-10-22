/**
 * ROKI - SIMULATOR CYCLE
 *
 * Runs the real live executor against the simulated broker. The simulator keeps
 * its own copy of the broker fields for each brain trade (account.links), so it
 * never touches the fields a real live account would use.
 */

import { PaperTrade } from "../core/brain.js";
import { INSTRUMENTS } from "../core/instruments.js";
import type { CycleChanges } from "../core/engineRunner.js";
import { mirrorLive } from "../core/liveExecutor.js";
import { fetchIntraday, fetchDaily } from "../services/marketData.js";
import { BrokerService } from "../services/brokerService.js";
import { PaperBroker, SimAccount } from "./paperBroker.js";

const BROKER_KEYS = ["brokerOrderId", "brokerStopOrderId", "brokerExitOrderId", "brokerQty", "brokerNote", "brokerSymbol", "brokerSecurityId", "brokerSegment", "brokerEntryPrice", "brokerExitPrice"] as const;
const tradable = new Set(INSTRUMENTS.filter((i) => i.dhan).map((i) => i.name));

function withLinks(t: PaperTrade, acct: SimAccount): PaperTrade {
  const base: Record<string, unknown> = { ...t };
  for (const k of BROKER_KEYS) delete base[k];
  return { ...(base as unknown as PaperTrade), ...(acct.links[t.id] || {}) } as PaperTrade;
}

export async function latestVix(): Promise<number | null> {
  try {
    const i = (await fetchIntraday("^INDIAVIX")).bars;
    if (i.length && Date.now() - i[i.length - 1].t < 36 * 3600000) return i[i.length - 1].close;
  } catch { /* fall through */ }
  try {
    const d = (await fetchDaily("^INDIAVIX")).bars;
    return d.length ? d[d.length - 1].close : null;
  } catch { return null; }
}

export async function runSimulator(acct: SimAccount, changes: CycleChanges, allTrades: Record<string, PaperTrade>, killSwitch: boolean, now: number, vix: number | null,
  dhanList: BrokerService | null = new BrokerService()): Promise<{ notes: string[] }> {
  const pb = new PaperBroker(acct, { now, quotes: changes.quotes, vix }, dhanList);
  const notes = pb.housekeeping();
  const all: Record<string, PaperTrade> = {};
  for (const t of Object.values(allTrades)) if (tradable.has(t.instrument) && (t.status !== "closed" || acct.links[t.id])) all[t.id] = withLinks(t, acct);
  const changed = changes.trades.filter((t) => tradable.has(t.instrument)).map((t) => withLinks(t, acct));
  const ups = await mirrorLive(changed, all, { envEnabled: true, ownerEnabled: true, killSwitch }, pb, now, (m) => notes.push(m.replace("[LIVE]", "[SIM]")), 0);
  for (const u of ups) {
    const link: Record<string, unknown> = {};
    for (const k of BROKER_KEYS) if ((u as unknown as Record<string, unknown>)[k] !== undefined) link[k] = (u as unknown as Record<string, unknown>)[k];
    acct.links[u.id] = link;
  }
  pb.mark();
  return { notes };
}
