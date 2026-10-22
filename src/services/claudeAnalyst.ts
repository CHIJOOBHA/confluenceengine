/**
 * ROKI - CLAUDE ANALYST
 *
 * Turns the brain's real numbers into a short plain-language brief, using
 * Anthropic's Claude (server-side; ANTHROPIC_API_KEY never reaches the browser).
 *
 * Claude does not decide trades. The brain's tested rules decide; Claude only
 * explains what they did and what they will watch next, using the numbers it
 * is given and nothing else.
 */

import Anthropic from "@anthropic-ai/sdk";
import { totals } from "../core/markets.js";
import { BrainState } from "../core/engineRunner.js";

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

const SYSTEM = `You are the analyst inside Roki, a rule-based research and paper-trading system for Indian and US markets.
You receive the engine's own data as JSON: next-session levels with odds, recent calls and their results, and paper trades.
Write a brief for the owner, who is not technical. Plain English, short sentences, no jargon.
Rules:
- Use only numbers that appear in the JSON. Never invent prices, news, flows or reasons.
- The odds are historical frequencies, not certainties. Say so once.
- Do not give buy or sell advice and do not suggest position sizes. Describe what the engine's rules did and will watch.
- Paper trades are simulated research positions.
Format: 1) What happened (calls scored and trades closed, with P&L in each market's own currency: Indian trades in rupees on Rs 1 lakh, US, gold, oil and crypto trades in US dollars on $1,000; never add rupees to dollars). 2) Open trades. 3) Next session: for Nifty, Sensex and Bank Nifty give yesterday's high / close / low, the odds that the high or low breaks, and any trade trigger; one line for other markets with triggers. Keep it under 250 words.`;

export function briefInput(state: BrainState) {
  const preds = Object.values(state.predictions).sort((a, b) => b.session.localeCompare(a.session));
  const trades = Object.values(state.trades).sort((a, b) => b.session.localeCompare(a.session));
  const closed = trades.filter((t) => t.status === "closed");
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    asOf: state.lastRun,
    nextSessionLevels: state.levels,
    recentScoredCalls: preds.filter((p) => p.result === "hit" || p.result === "miss").slice(0, 40),
    pendingCalls: preds.filter((p) => p.result === "pending").slice(0, 40),
    openTrades: trades.filter((t) => t.status === "open" || t.status === "pending"),
    recentClosedTrades: closed.slice(0, 20),
    totals: {
      activeClosed: closed.filter((t) => t.mode === "active").length,
      activePnl: totals(closed.filter((t) => t.mode === "active")),
      shadowClosed: closed.filter((t) => t.mode === "shadow").length,
      shadowPnl: totals(closed.filter((t) => t.mode === "shadow")),
    },
  };
}

/** Returns null when no API key is configured. */
export async function writeBrief(state: BrainState): Promise<{ text: string; at: string; model: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 900,
    system: SYSTEM,
    messages: [{ role: "user", content: `Engine data:\n${JSON.stringify(briefInput(state))}` }],
  });
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  return { text, at: new Date().toISOString(), model: CLAUDE_MODEL };
}
