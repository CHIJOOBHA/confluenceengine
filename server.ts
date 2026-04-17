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
import { EngineState, Lesson, Trade } from "./src/types";
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

  // Memory Chain State
  let lastLessonHash = "0";
  let lessonIndex = 0;

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
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        console.warn("[LEDGER] Permission Denied (Vercel Node restriction). Ledger is running in volatile memory.");
      } else {
        console.error("[LEDGER] Initialization failed:", err);
      }
    }
  };

  // Initialize Config from Firestore
  const syncConfig = async () => {
    try {
      const doc = await adminDb.collection("config").doc("main").get();
      if (doc.exists) {
        const config = doc.data();
        if (config?.brokerClientId && config?.brokerAccessToken) {
          broker.refreshConfig(config.brokerClientId, config.brokerAccessToken);
          currentState.isBrokerConnected = broker.getStatus().connected;
          console.log(`[CONFIG] Broker keys synced from Firestore. Status: ${currentState.isBrokerConnected}`);
        }
      }
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        // Silently fail config sync if permissions are missing; the frontend will provide keys via the sync logic
      } else {
        console.error("[CONFIG] Sync failed:", err);
      }
    }
  };

  const syncLessons = async () => {
    try {
      const snapshot = await adminDb.collection("lessons").orderBy("index", "desc").limit(5).get();
      if (!snapshot.empty) {
        const lessons = snapshot.docs.map(doc => doc.data() as Lesson);
        currentState.lessons = lessons;
        lastLessonHash = lessons[0].hash;
        lessonIndex = lessons[0].index + 1;
      }
    } catch (err) {
      // Permission issues on Vercel are ignored
    }
  };

  const syncPersistentState = async () => {
    try {
      const doc = await adminDb.collection("state").doc("current").get();
      if (doc.exists) {
        const savedState = doc.data();
        if (savedState) {
          currentState.agentReports = savedState.agentReports || [];
          currentState.bfsiReport = savedState.bfsiReport || null;
          currentState.apexSignals = savedState.apexSignals || [];
          currentState.marketBiasScore = savedState.marketBiasScore || 0;
          currentState.consensus = savedState.consensus || "WAIT";
          console.log("[STATE] Persistent intelligence state restored from Firestore.");
        }
      }
    } catch (err) {
      // Ignore sync errors
    }
  };

  const persistState = async () => {
    try {
      await adminDb.collection("state").doc("current").set({
        agentReports: currentState.agentReports,
        bfsiReport: currentState.bfsiReport,
        apexSignals: currentState.apexSignals,
        marketBiasScore: currentState.marketBiasScore,
        consensus: currentState.consensus,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      // Ignore persistence errors
    }
  };

  await initLedger();
  await syncConfig();
  await syncLessons();
  await syncPersistentState();

  const persistBlock = async (data: any, type: AuditBlock['type']) => {
    const block = LedgerService.createBlock(data, type, lastBlockHash, blockIndex);
    try {
      await adminDb.collection("ledger").add(block);
      lastBlockHash = block.hash;
      blockIndex++;
      return block;
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED')) {
        // Silently fail persistence if on Vercel Node without service account
        lastBlockHash = block.hash;
        blockIndex++;
        return block;
      } else {
        console.error("[LEDGER] Persistence failed:", err);
        return null;
      }
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
    trades: [],
    lessons: [],
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
    
    // If simulating, override phase to allow execution loop to trigger
    const isSimulating = currentState.isSimulating;
    const effectivePhase = (force || isSimulating) ? "TRADING_ACTIVE" : phase;
    currentState.phase = force ? "SIMULATION_ACTIVE" : (isSimulating ? "SIMULATION_ACTIVE" : phase);

    // Heartbeat logic for feedback
    if (now.getSeconds() % 30 === 0) {
      if (effectivePhase === "MARKET_CLOSED") {
        addLog("SYSTEM: Market Closed. Standing by for 9:15 AM IST.", "system");
      } else if (effectivePhase === "TRADING_ACTIVE" && !currentState.fibLevels) {
        addLog("BRAIN: Market Active. Awaiting ORB Formation (9:45 AM IST)...", "system");
      }
    }

    if (!force && !currentState.isSafetyOn && currentState.consensus === "WAIT" && effectivePhase === "TRADING_ACTIVE") {
      if (now.getSeconds() % 15 === 0) {
        addLog("LIVE MODE ACTIVE: Waiting for Intelligence Swarm Consensus...", "system");
      }
    }

    // Reset daily counters
    if (phase === "MARKET_CLOSED" && !force && !isSimulating) {
      tradesToday = 0;
    }

    // Agent polling is now handled by the frontend to comply with security guidelines.
    // The server evaluates the results received via /api/update-agents.

    // Run Seed Logic: Calculate ORB Levels once per day (or on reset)
    // We calculate levels as soon as market is active, WITHOUT waiting for consensus
    if (force || (effectivePhase === "TRADING_ACTIVE" && !currentState.fibLevels)) {
      addLog("CALCULATING: Establishing ORB Levels for Current Session...", "market");
      
      const levels = calculateORBLevels(mockORBData, 120);
      if (!levels) {
        addLog("ANOMALY: Level Calculation Matrix Failure", "error");
        return;
      }
      currentState.fibLevels = levels;
      addLog(`LEVELS SET: Entry(L1): ${levels.level1} | Protect(L0): ${levels.level0}`, "success");
    }

    // Execution Logic: Scan for breakouts whenever levels exist
    // Even if consensus is WAIT, we scan but don't execute yet
    if (effectivePhase === "TRADING_ACTIVE" && currentState.fibLevels) {
      // HEARTBEAT
      if (now.getSeconds() % 15 === 0) {
        const statusMsg = currentState.consensus === "WAIT" 
          ? "AWAITING AGENT ANALYSIS: Swarm intelligence not yet synchronized."
          : `MONITORING: Seeking ${currentState.consensus} triggers across indices.`;
        addLog(`ENGINE: ${statusMsg}`, "market");
      }

      if (currentState.consensus === "WAIT") return;

      if (tradesToday >= MAX_TRADES_PER_DAY) {
        if (now.getSeconds() % 60 === 0) {
          addLog("CIRCUIT BREAKER: Daily trade limit reached.", "error");
        }
        return;
      }

      const isBullish = currentState.marketBiasScore > 0;
      const symbolsToTrade = ["NIFTY 50", "NIFTY BANK", "SENSEX", "NIFTY MIDCAP SELECT"];
      const levels = currentState.fibLevels;

      for (const baseSymbol of symbolsToTrade) {
        // Multi-Index Filter: Conditional thresholds to ensure engine activity
        if (!currentState.isSimulating) {
          if (baseSymbol === "NIFTY BANK" && Math.abs(currentState.marketBiasScore) < 0.5) continue;
          if (baseSymbol === "SENSEX" && Math.abs(currentState.marketBiasScore) < 1.0) continue;
        }

        const entry = isBullish ? levels.level1 : levels.level0;
        const stopLoss = isBullish ? levels.level0 : levels.level1;
        const target = isBullish ? levels.level2 : levels.levelMinus1;

        const quantity = riskManager.calculatePositionSize(entry, stopLoss);

        if (quantity > 0) {
          const instrument = broker.getTradableInstrument(baseSymbol);
          
          // Prevent multiple entries for the same symbol in one session
          const alreadyTraded = currentState.trades.some(t => t.symbol === instrument && new Date(t.time).toDateString() === new Date().toDateString());
          if (alreadyTraded && !force) continue;

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
            
            // Log trade to the state
            currentState.trades = [{
              time: new Date().toISOString(),
              symbol: instrument,
              type: isBullish ? "BUY" : "SELL",
              qty: quantity,
              price: entry,
              status: response.status
            } as Trade, ...currentState.trades].slice(0, 10);

            addLog(`Broker Response: ${response.status} - ID: ${response.orderId}`, "success");
          } catch (err) {
            addLog(`Broker Execution Failed for ${instrument}: Connection Error`, "error");
          }
        }
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
      
      // Significantly lowered threshold to ensure action
      if (bfsiReport.triggerFibLogic || Math.abs(currentState.marketBiasScore) > 0.05) {
        currentState.consensus = synthesizer.calculateConsensus(reports);
        addLog(`Consensus Reached: ${currentState.consensus}`, "success");
      } else {
        // Fallback to MEAN_REVERSION if strictly not biased but agents active
        currentState.consensus = reports.length > 0 ? "MEAN_REVERSION" : "WAIT";
        addLog(`System using ${currentState.consensus} stance (Low Bias: ${currentState.marketBiasScore.toFixed(2)})`, "system");
      }

      await persistState();

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
    
    // CRITICAL: Clear state when going LIVE to force the engine to re-run its logic immediately
    if (!safety) {
       currentState.fibLevels = null;
       currentState.consensus = "WAIT";
       addLog("ENTERING LIVE MODE: Calibrating logic for fresh market pulse...", "system");
    }
    
    addLog(`BROKER SAFETY ${safety ? 'ON' : 'OFF'} - Mode: ${status.mode}`, "system");
    res.json(status);
  });

  app.post("/api/sync-memory", async (req, res) => {
    await syncLessons();
    res.json({ status: "Memory Synced", lessons: currentState.lessons });
  });

  app.post("/api/broker/sync", async (req, res) => {
    try {
      // We first try to sync from Firestore
      await syncConfig();
      
      // If the request body contains keys, we use those as an override/backup
      const { clientId, accessToken } = req.body;
      if (clientId && accessToken) {
        broker.refreshConfig(clientId, accessToken);
        currentState.isBrokerConnected = broker.getStatus().connected;
      }

      res.json({ 
        status: "Sync completed", 
        connected: currentState.isBrokerConnected,
        mode: currentState.brokerMode
      });
    } catch (err) {
      console.error("[SERVER] Sync route error:", err);
      res.status(500).json({ error: "Sync failed" });
    }
  });

  app.post("/api/broker/config", async (req, res) => {
    // This route is now a legacy proxy for the client-side write
    res.status(410).json({ error: "Use /api/broker/sync instead" });
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
