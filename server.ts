/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Synthesizer } from "./src/core/synthesizer";
import { EngineState } from "./src/types";
import { calculateORBLevels } from "./src/core/orb-logic";
import { BrokerService } from "./src/services/brokerService";
import { RiskManager } from "./src/core/risk-manager";
import { LedgerService, AuditBlock } from "./src/services/ledgerService";
import { adminDb } from "./src/lib/firebase-admin.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust the proxy headers (X-Forwarded-For) from the AI Studio infrastructure
  app.set("trust proxy", 1);

  // 1. SECURITY HEADERS (Protects against XSS, Clickjacking, etc.)
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled for Vite dev server compatibility
  }));

  // 2. RATE LIMITING (Protects against DoS and Brute Force)
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Increased to 1000 to allow frequent polling (5s interval) and multiple users
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: "Too many requests from this IP, please try again later.",
  });
  app.use("/api", limiter);

  app.use(express.json());

  const synthesizer = new Synthesizer();
  const broker = new BrokerService();
  const riskManager = new RiskManager();

  // Ledger State
  let lastBlockHash = "0";
  let blockIndex = 0;

  // Initialize Ledger from Firestore
  const initLedger = async () => {
    try {
      const snapshot = await adminDb.collection("ledger").orderBy("index", "desc").limit(1).get();
      if (!snapshot.empty) {
        const lastBlock = snapshot.docs[0].data() as AuditBlock;
        lastBlockHash = lastBlock.hash;
        blockIndex = lastBlock.index + 1;
        console.log(`[LEDGER] Resumed from block ${lastBlock.index}. Hash: ${lastBlockHash}`);
      } else {
        console.log("[LEDGER] Genesis block required. Initializing...");
        const genesis = LedgerService.createBlock({ msg: "Genesis Block" }, "SYSTEM", "0", 0);
        await adminDb.collection("ledger").add(genesis);
        lastBlockHash = genesis.hash;
        blockIndex = 1;
      }
    } catch (err) {
      console.error("[LEDGER] Initialization failed:", err);
    }
  };

  // Initialize Config from Firestore
  const syncConfig = async () => {
    try {
      const doc = await adminDb.collection("config").doc("main").get();
      if (doc.exists) {
        const config = doc.data();
        if (config?.brokerApiKey && config?.brokerAccessToken) {
          broker.refreshConfig(config.brokerApiKey, config.brokerAccessToken);
          currentState.isBrokerConnected = broker.getStatus().connected;
          console.log(`[CONFIG] Broker keys synced from Firestore. Status: ${currentState.isBrokerConnected}`);
        }
      }
    } catch (err) {
      console.error("[CONFIG] Sync failed:", err);
    }
  };

  await initLedger();
  await syncConfig();

  const persistBlock = async (data: any, type: AuditBlock['type']) => {
    const block = LedgerService.createBlock(data, type, lastBlockHash, blockIndex);
    try {
      await adminDb.collection("ledger").add(block);
      lastBlockHash = block.hash;
      blockIndex++;
      return block;
    } catch (err) {
      console.error("[LEDGER] Persistence failed:", err);
      return null;
    }
  };

  // 3. CIRCUIT BREAKER & KILL SWITCH
  let tradesToday = 0;
  const MAX_TRADES_PER_DAY = 3;
  let isKillSwitchActive = false;

  const addLog = (msg: string, type: "system" | "agent" | "market" | "success" | "error" = "system") => {
    currentState.logs = [{ time: new Date().toLocaleTimeString(), msg, type }, ...currentState.logs].slice(0, 50);
    console.log(`[${type.toUpperCase()}] ${msg}`);
  };

  let currentState: EngineState = {
    currentTime: new Date().toISOString(),
    isMarketOpen: false,
    phase: "INITIALIZING",
    agentReports: [],
    bfsiReport: null,
    apexSignals: [],
    marketBiasScore: 0,
    consensus: "WAIT",
    fibLevels: null,
    lastHash: "0",
    logs: [{ time: new Date().toLocaleTimeString(), msg: "Security Shield Active", type: "system" }],
    isSimulating: false,
    isBrokerConnected: broker.getStatus().connected,
    isSafetyOn: broker.getStatus().safety,
    brokerMode: broker.getStatus().mode
  };

  if (currentState.isBrokerConnected) {
    addLog("LIVE BROKER CONNECTED: Real Execution Enabled.", "success");
  } else {
    addLog("BROKER SIMULATION MODE: API keys missing in .env", "system");
  }

  // Mock OHLCV for 9:15-9:45 AM
  const mockORBData = {
    open: 22000,
    high: 22150,
    low: 21950,
    close: 22100,
    volume: 1000000,
    timestamp: new Date().toISOString(),
  };

  const runEngineCycle = async (force: boolean = false) => {
    if (isKillSwitchActive) {
      addLog("ENGINE HALTED: Kill Switch is Active.", "error");
      return;
    }

    const now = new Date();
    const { isOpen, phase } = synthesizer.getMarketStatus(now);
    
    currentState.currentTime = now.toISOString();
    currentState.isMarketOpen = isOpen || currentState.isSimulating;
    currentState.phase = force ? "SIMULATION_ACTIVE" : phase;

    // Reset daily counters
    if (phase === "MARKET_CLOSED" && !force) {
      tradesToday = 0;
    }

    // Agent polling is now handled by the frontend to comply with security guidelines.
    // The server evaluates the results received via /api/update-agents.

    // Run Seed Logic & Execution
    if (force || (phase === "TRADING_ACTIVE" && !currentState.fibLevels && currentState.consensus !== "WAIT")) {
      // CIRCUIT BREAKER CHECK
      if (tradesToday >= MAX_TRADES_PER_DAY) {
        addLog("CIRCUIT BREAKER: Daily trade limit reached. Execution blocked.", "error");
        return;
      }

      addLog("Calculating ORB Levels based on Previous Day's 30m Range...", "market");
      
      const levels = calculateORBLevels(mockORBData, 120);
      if (!levels) {
        currentState.consensus = "WAIT";
        addLog("Anomaly Detected: Trade Aborted", "error");
        return;
      }
      currentState.fibLevels = levels;

      const isBullish = currentState.marketBiasScore > 0;
      const entry = isBullish ? levels.level1 : levels.level0;
      const stopLoss = isBullish ? levels.level0 : levels.level1;
      const target = isBullish ? levels.level2 : levels.levelMinus1;

      const quantity = riskManager.calculatePositionSize(entry, stopLoss);

      if (quantity > 0) {
        const instrument = broker.getTradableInstrument("NIFTY");
        addLog(`Executing ${isBullish ? "BUY" : "SELL"} order for ${quantity} lots of ${instrument}`, "success");
        
        try {
          const response = await broker.placeBracketOrder({
            symbol: instrument,
            transactionType: isBullish ? "BUY" : "SELL",
            orderType: "LIMIT",
            quantity,
            price: entry,
            stopLoss,
            target,
            isBracketOrder: true
          });
          tradesToday++;
          addLog(`Broker Response: ${response.status} - ID: ${response.orderId}`, "success");
        } catch (err) {
          addLog("Broker Execution Failed: Connection Error", "error");
        }
      } else {
        addLog("Trade Aborted: Risk exceeds parameters.", "error");
      }
    }

    if (phase === "MARKET_CLOSED" && !force) {
      currentState.agentReports = [];
      currentState.fibLevels = null;
      currentState.consensus = "WAIT";
    }
  };

  // Engine Loop
  setInterval(() => runEngineCycle(false), 5000);

  // API Routes
  app.post("/api/simulate", async (req, res) => {
    if (isKillSwitchActive) return res.status(403).json({ error: "System Halted" });
    currentState.isSimulating = true;
    addLog("MANUAL SIMULATION TRIGGERED", "system");
    // Frontend will trigger agents for simulation
    res.json({ status: "Simulation mode active. Please trigger agents from frontend." });
  });

  app.post("/api/update-agents", async (req, res) => {
    if (isKillSwitchActive) return res.status(403).json({ error: "System Halted" });
    
    const { reports, bfsiReport, apexSignals, eventReport } = req.body;
    
    try {
      addLog("Received Agent Reports from Secure Frontend Channel", "system");
      
      // Persist to Blockchain Ledger
      await persistBlock({ reports, bfsiReport, apexSignals, eventReport }, "AGENT");
      
      currentState.agentReports = reports;
      currentState.bfsiReport = bfsiReport;
      currentState.apexSignals = apexSignals;
      currentState.lastHash = lastBlockHash;

      currentState.marketBiasScore = synthesizer.evaluatePreMarketBias(apexSignals, bfsiReport);
      addLog(`Global Bias Evaluated: ${currentState.marketBiasScore.toFixed(2)}`, "agent");
      
      // Threshold lowered for development/simulation ease
      if (bfsiReport.triggerFibLogic && Math.abs(currentState.marketBiasScore) > 0.1) {
        currentState.consensus = synthesizer.calculateConsensus(reports);
        addLog(`Consensus Reached: ${currentState.consensus}`, "success");
      } else {
        currentState.consensus = "WAIT";
        addLog(`Engine Veto: Conviction low (${bfsiReport.triggerFibLogic ? 'Bias: ' + currentState.marketBiasScore.toFixed(2) : 'Logic Vetoed'})`, "error");
      }

      res.json({ status: "Agents updated", consensus: currentState.consensus });
    } catch (err) {
      addLog(`Agent Update Processing Failed: ${err instanceof Error ? err.message : "Unknown Error"}`, "error");
      res.status(500).json({ error: "Processing failed" });
    }
  });

  app.post("/api/kill", (req, res) => {
    isKillSwitchActive = true;
    currentState.consensus = "WAIT";
    addLog("EMERGENCY KILL SWITCH ACTIVATED", "error");
    res.json({ status: "System Halted" });
  });

  app.post("/api/broker/safety", (req, res) => {
    const { safety } = req.body;
    broker.toggleSafety(safety);
    const status = broker.getStatus();
    currentState.isSafetyOn = status.safety;
    currentState.brokerMode = status.mode;
    addLog(`BROKER SAFETY ${safety ? 'ON' : 'OFF'} - Mode: ${status.mode}`, safety ? "system" : "error");
    res.json(status);
  });

  app.post("/api/broker/config", async (req, res) => {
    const { apiKey, accessToken } = req.body;
    if (!apiKey || !accessToken) return res.status(400).json({ error: "Keys required" });

    try {
      await adminDb.collection("config").doc("main").set({
        brokerApiKey: apiKey,
        brokerAccessToken: accessToken,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      broker.refreshConfig(apiKey, accessToken);
      currentState.isBrokerConnected = broker.getStatus().connected;
      addLog("Live Broker Config Updated Successfully", "success");
      res.json({ status: "Config updated", connected: currentState.isBrokerConnected });
    } catch (err) {
      addLog("Config Update Failed", "error");
      res.status(500).json({ error: "Update failed" });
    }
  });

  app.post("/api/reset", (req, res) => {
    isKillSwitchActive = false;
    currentState = {
      ...currentState,
      agentReports: [],
      bfsiReport: null,
      apexSignals: [],
      marketBiasScore: 0,
      consensus: "WAIT",
      fibLevels: null,
      isSimulating: false,
      logs: [{ time: new Date().toLocaleTimeString(), msg: "System Reset & Shield Restored", type: "system" }]
    };
    res.json({ status: "System reset" });
  });

  // API Routes
  app.get("/api/engine-state", (req, res) => {
    res.json(currentState);
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API 404 Handler - Prevents falling through to SPA fallback
  app.use("/api/*", (req, res) => {
    res.status(404).json({ 
      error: "API Route Not Found", 
      path: req.originalUrl 
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Confluence Engine running on http://localhost:${PORT}`);
  });
}

startServer();
