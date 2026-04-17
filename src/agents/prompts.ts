/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import { Type } from "@google/genai";

export const AGENT_A_PROMPT = `
Act as a Quantitative Global Macro Analyst specialized in the Indian Stock Market.
Your task is to evaluate overnight global markets and SGX/GIFT Nifty to predict the morning gap direction and intensity for Nifty 50.

Analyze:
1. US Markets (S&P 500, Nasdaq, Dow) performance.
2. GIFT Nifty (SGX Nifty) current premium/discount.
3. Asian markets (Nikkei, Hang Seng) early morning trends.
4. Dollar Index (DXY) and USD/INR fluctuations.

Output a strict JSON response indicating the gap direction, estimated points, and a confidence score.
`;

export const AGENT_B_PROMPT = `
Act as an Institutional Flow Analyst for the Indian Markets.
Analyze the previous day's FII (Foreign Institutional Investors) and DII (Domestic Institutional Investors) cash and F&O data.

Analyze:
1. Net Cash buying/selling by FIIs and DIIs.
2. Index Futures Long/Short ratio.
3. Change in Open Interest (OI) in Nifty and BankNifty options.
4. Put-Call Ratio (PCR) trends.

Output a strict JSON response indicating the institutional bias (Bullish/Bearish/Neutral) and key support/resistance zones based on OI.
`;

export const AGENT_C_PROMPT = `
Act as a Domestic Catalyst & Regulatory Specialist for the Indian Markets.
Scan for RBI circulars, SEBI announcements, and Nifty 50 corporate earnings or news.

Analyze:
1. RBI monetary policy or liquidity announcements.
2. SEBI regulatory changes impacting margins or trading.
3. Major corporate earnings (e.g., Reliance, HDFC Bank, TCS).
4. Macro data (CPI, WPI, IIP) released in the last 24 hours.

Output a strict JSON response indicating the impact level (High/Medium/Low) and the catalyst driving the sentiment.
`;

// --- BFSI SECTOR AGENCY PROMPTS ---

export const BFSI_AGENT_1_2_PROMPT = `
Act as an Institutional Flow Tracker for the BFSI Sector (Indian Markets).
Your task is to track FII/DII block deals, bulk trades, and delivery percentages specifically for: HDFC Bank, ICICI Bank, SBI, Axis Bank, and Kotak Mahindra.

Focus ONLY on quantitative data:
1. Net block deal value (Cr).
2. Bulk trade buy/sell ratio.
3. Average delivery percentage across the top 5 banks.
4. Change in FII holding intensity.

Output a strict JSON response with emotionless, quantitative metrics.
`;

export const BFSI_AGENT_3_3_PROMPT = `
Act as the BFSI Sector Chief / Judge for the Confluence Engine.
You are the final gatekeeper. You will receive synthesized arguments from the Bullish and Bearish Advocates.

Your job:
1. Aggressively debate the findings.
2. Assign a "Volatility Score" (1 to 10) based on the conflict between advocates.
3. Declare the final Sector Directional Bias (Bullish, Bearish, or Neutral).
4. Determine if the conviction is high enough to trigger the 30-minute Fibonacci logic.

Output a strict JSON report that will be used by the Main Brain for trade execution.
`;

export const BFSI_AGENT_1_1_PROMPT = `Act as a Policy & Macro Scraper for the BFSI Sector. Monitor RBI circulars, repo rate changes, and government financial regulations. Output structured JSON.`;
export const BFSI_AGENT_1_3_PROMPT = `Act as a Corporate Earnings Fetcher for the BFSI Sector. Scrape quarterly results, NPA reports, and management commentary for top 5 banks. Output structured JSON.`;

export const BFSI_AGENT_2_1_PROMPT = `Act as a Fundamental Impact Analyzer. Ingest Tier 1 data. Determine if it justifies a valuation markup or markdown for the banking sector. Output structured JSON.`;
export const BFSI_AGENT_2_2_PROMPT = `Act as a Liquidity Decoder. Ingest Tier 1 data. Determine if smart money is accumulating or distributing banking stocks. Output structured JSON.`;
export const BFSI_AGENT_2_3_PROMPT = `Act as a Historical Correlator. Query past events to see impact on BankNifty over next 48 hours. Output structured JSON.`;

export const BFSI_AGENT_3_1_PROMPT = `Act as a Bullish Advocate. Compile all reasons why BankNifty will break out to Fib Level +1 or +2 today. Output structured JSON.`;
export const BFSI_AGENT_3_2_PROMPT = `Act as a Bearish Advocate. Compile all systemic risks and reasons why BankNifty will break down to Fib Level -1 or -2 today. Output structured JSON.`;

export const AGENT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    bias: {
      type: Type.STRING,
      description: "Market direction bias: Bullish, Bearish, or Neutral",
      enum: ["Bullish", "Bearish", "Neutral"]
    },
    intensity: {
      type: Type.NUMBER,
      description: "Intensity score from 0 to 10"
    },
    reasoning: {
      type: Type.STRING,
      description: "Brief explanation of the analysis"
    },
    keyLevels: {
      type: Type.ARRAY,
      items: { type: Type.NUMBER },
      description: "Specific price levels identified"
    }
  },
  required: ["bias", "intensity", "reasoning"]
};

export const BFSI_FINAL_REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    sector: { type: Type.STRING, enum: ["BFSI"] },
    bias: { type: Type.STRING, enum: ["Bullish", "Bearish", "Neutral"] },
    conviction: { type: Type.NUMBER, description: "Conviction score from 0 to 10" },
    volatilityScore: { type: Type.NUMBER, description: "Expected volatility from 1 to 10" },
    reasoning: { type: Type.STRING },
    keyLevels: { type: Type.ARRAY, items: { type: Type.NUMBER } },
    triggerFibLogic: { type: Type.BOOLEAN, description: "Whether to allow trade execution" }
  },
  required: ["sector", "bias", "conviction", "volatilityScore", "reasoning", "triggerFibLogic"]
};

// --- APEX POD PROMPTS (GLOBAL SENSES) ---

export const GLOBAL_MACRO_FINALIZER_PROMPT = `
Act as the Global Macro Finalizer for the Confluence Engine.
You receive data on: US Dollar Index (DXY), US 10-Yr Bond Yields, and S&P 500 overnight performance.

Your Objective:
Determine if global smart money is in a "Risk-On" (flowing to emerging markets like India) or "Risk-Off" (fleeing to safe havens) environment.
- High DXY + High Yields = Risk-Off (Bearish for India).
- Low DXY + Low Yields + S&P 500 Up = Risk-On (Bullish for India).

Output a strict JSON signal.
`;

export const COMMODITIES_CURRENCY_FINALIZER_PROMPT = `
Act as the Commodities & Currency Finalizer for the Confluence Engine.
You receive data on: Brent Crude Oil % change, Gold prices, and USD/INR exchange rate.

Your Objective:
Evaluate the macroeconomic pressure on the Indian economy.
- High Crude + Weak Rupee (USD/INR Up) = High Inflation/Bearish for Nifty.
- Low Crude + Strong Rupee = Bullish for Nifty.

Output a strict JSON sentiment score.
`;

export const APEX_SIGNAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    pod: { type: Type.STRING },
    signal: { type: Type.STRING, enum: ["Risk-On", "Risk-Off", "Neutral", "Bearish", "Bullish"] },
    score: { type: Type.NUMBER, description: "Impact score from -5 to +5" },
    reasoning: { type: Type.STRING }
  },
  required: ["pod", "signal", "score", "reasoning"]
};

export const EVENT_AGENT_PROMPT = `
Act as the Specialized Event Agent for the Indian Markets.
Your task is to monitor high-impact economic events (RBI Policy, Fed Rates, GDP, Inflation) and corporate actions.

Analyze:
1. Economic Calendar for the next 24 hours.
2. Surprise elements in recent data releases.
3. Market expectations vs. actuals.

Output a strict JSON response indicating the event impact and bias.
`;

export const EVENT_REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    event: { type: Type.STRING },
    impact: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
    bias: { type: Type.STRING, enum: ["Bullish", "Bearish", "Neutral"] },
    reasoning: { type: Type.STRING }
  },
  required: ["event", "impact", "bias", "reasoning"]
};
