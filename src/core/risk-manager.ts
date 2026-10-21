/**
 * CONFLUENCE ENGINE - RISK MANAGER
 *
 * Playbook Rule 2: a small fixed rupee risk per trade, a wide safety stop
 * (1 ADR, never a tight one), and a hard cap on live trades and losses per day.
 * All limits come from server environment variables.
 */

const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && !isNaN(Number(v)) ? Number(v) : d);

export const RISK = {
  riskPerTradeInr: num(process.env.RISK_PER_TRADE_INR, 2000), // loss if the safety stop is hit
  maxLiveTradesPerDay: num(process.env.MAX_LIVE_TRADES_PER_DAY, 1), // Rule 2: one trade a day
  dailyLossLimitInr: num(process.env.DAILY_LOSS_LIMIT_INR, 4000), // live engine stops for the day past this
  maxCapitalPerTradeInr: num(process.env.MAX_CAPITAL_PER_TRADE_INR, 100000), // stock positions only
};

export interface SizeResult {
  quantity: number; // shares, or contracts (lots x lot size) for futures
  lots: number;
  note: string;
}

/**
 * Position size so that hitting the safety stop loses about riskPerTradeInr.
 * Returns 0 when even one lot would risk more than the limit.
 */
export function sizePosition(price: number, stopDistance: number, lotSize: number): SizeResult {
  if (!(stopDistance > 0) || !(price > 0) || !(lotSize > 0)) return { quantity: 0, lots: 0, note: "bad size inputs" };
  const riskPerLot = stopDistance * lotSize;
  let lots = Math.floor(RISK.riskPerTradeInr / riskPerLot);
  if (lotSize === 1) lots = Math.min(lots, Math.floor(RISK.maxCapitalPerTradeInr / price));
  if (lots < 1) {
    return { quantity: 0, lots: 0, note: `One ${lotSize > 1 ? "lot" : "share"} would risk Rs ${Math.round(riskPerLot)} at the 1 ADR safety stop, above the Rs ${RISK.riskPerTradeInr} limit` };
  }
  return { quantity: lots * lotSize, lots, note: `${lots} ${lotSize > 1 ? "lot(s)" : "share(s)"}, about Rs ${Math.round(lots * riskPerLot)} at risk` };
}
