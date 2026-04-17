/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import { GoogleGenAI } from "@google/genai";
import { 
  AGENT_A_PROMPT, AGENT_B_PROMPT, AGENT_C_PROMPT, AGENT_RESPONSE_SCHEMA,
  BFSI_AGENT_1_1_PROMPT, BFSI_AGENT_1_2_PROMPT, BFSI_AGENT_1_3_PROMPT,
  BFSI_AGENT_2_1_PROMPT, BFSI_AGENT_2_2_PROMPT, BFSI_AGENT_2_3_PROMPT,
  BFSI_AGENT_3_1_PROMPT, BFSI_AGENT_3_2_PROMPT, BFSI_AGENT_3_3_PROMPT,
  BFSI_FINAL_REPORT_SCHEMA,
  GLOBAL_MACRO_FINALIZER_PROMPT, COMMODITIES_CURRENCY_FINALIZER_PROMPT, APEX_SIGNAL_SCHEMA,
  EVENT_AGENT_PROMPT, EVENT_REPORT_SCHEMA
} from "../agents/prompts";
import { AgentReport, ApexSignal, BFSISectorReport } from "../types";

// Initialize Gemini on the frontend as required by platform guidelines
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runAgent(prompt: string, agentId: string, schema: any = AGENT_RESPONSE_SCHEMA): Promise<any> {
  // Add a small delay for every agent to prevent flooding the API
  await sleep(800); 
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error: any) {
    if (error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED') {
      console.warn(`[RATE LIMIT] Agent ${agentId} throttled. Retrying in 3s...`);
      await sleep(3000);
      return runAgent(prompt, agentId, schema);
    }
    console.error(`Error running agent ${agentId}:`, error);
    return null;
  }
}

export async function runApexPods(): Promise<ApexSignal[]> {
  const macro = await runAgent(GLOBAL_MACRO_FINALIZER_PROMPT, "APEX_GLOBAL_MACRO", APEX_SIGNAL_SCHEMA);
  const comm = await runAgent(COMMODITIES_CURRENCY_FINALIZER_PROMPT, "APEX_COMMODITIES", APEX_SIGNAL_SCHEMA);
  return [macro, comm].filter(r => r !== null);
}

export async function runBFSIAgency(): Promise<BFSISectorReport> {
  // Execute Tier 1 Sequentially to respect rate limits
  const collector1 = await runAgent(BFSI_AGENT_1_1_PROMPT, "BFSI_COLLECTOR_1.1");
  const collector2 = await runAgent(BFSI_AGENT_1_2_PROMPT, "BFSI_COLLECTOR_1.2");
  const collector3 = await runAgent(BFSI_AGENT_1_3_PROMPT, "BFSI_COLLECTOR_1.3");
  
  const tier1Results = [collector1, collector2, collector3].filter(r => r !== null);
  const tier1Data = JSON.stringify(tier1Results);

  // Execute Tier 2 Sequentially
  const analyzer1 = await runAgent(`${BFSI_AGENT_2_1_PROMPT}\n\nDATA:\n${tier1Data}`, "BFSI_ANALYZER_2.1");
  const analyzer2 = await runAgent(`${BFSI_AGENT_2_2_PROMPT}\n\nDATA:\n${tier1Data}`, "BFSI_ANALYZER_2.2");
  const analyzer3 = await runAgent(`${BFSI_AGENT_2_3_PROMPT}\n\nDATA:\n${tier1Data}`, "BFSI_ANALYZER_2.3");

  const tier2Results = [analyzer1, analyzer2, analyzer3].filter(r => r !== null);
  const tier2Data = JSON.stringify(tier2Results);

  // Final Tier
  const bullishAdvocate = await runAgent(`${BFSI_AGENT_3_1_PROMPT}\n\nANALYSIS:\n${tier2Data}`, "BFSI_FINALIZER_3.1");
  const bearishAdvocate = await runAgent(`${BFSI_AGENT_3_2_PROMPT}\n\nANALYSIS:\n${tier2Data}`, "BFSI_FINALIZER_3.2");

  const debateContext = `BULLISH_ARGUMENTS: ${JSON.stringify(bullishAdvocate)}\nBEARISH_ARGUMENTS: ${JSON.stringify(bearishAdvocate)}`;

  const finalReport = await runAgent(
    `${BFSI_AGENT_3_3_PROMPT}\n\nDEBATE_CONTEXT:\n${debateContext}`,
    "BFSI_JUDGE_3.3",
    BFSI_FINAL_REPORT_SCHEMA
  );

  return finalReport || {
    sector: "BFSI",
    bias: "Neutral",
    conviction: 0,
    volatilityScore: 5,
    reasoning: "Agency pipeline failed.",
    triggerFibLogic: false
  };
}

export async function getAgentSwarmReport(): Promise<AgentReport[]> {
  const a = await runAgent(AGENT_A_PROMPT, "GIFT_NIFTY_AGENT").then(data => ({ agentId: "GIFT_NIFTY_AGENT", ...data }));
  const b = await runAgent(AGENT_B_PROMPT, "FII_DII_AGENT").then(data => ({ agentId: "FII_DII_AGENT", ...data }));
  const c = await runAgent(AGENT_C_PROMPT, "DOMESTIC_CATALYST_AGENT").then(data => ({ agentId: "DOMESTIC_CATALYST_AGENT", ...data }));
  
  return [a, b, c];
}

export async function runEventAgent(): Promise<any> {
  return runAgent(EVENT_AGENT_PROMPT, "EVENT_SENTINEL", EVENT_REPORT_SCHEMA);
}
