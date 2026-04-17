/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Brain, TrendingUp, Clock, Hash, AlertTriangle, Sparkles, ReceiptText, Microscope, Zap, RefreshCw, Database } from "lucide-react";
import { motion, useScroll, useSpring, AnimatePresence } from "motion/react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";
import { EngineState, LogEntry } from "./types";
import { WealthSymbol } from "./components/WealthSymbol";
import { LoginGate } from "./components/LoginGate";
import { BrokerConnect } from "./components/BrokerConnect";
import { CustomCursor } from "./components/CustomCursor";
import { auth, db } from "./lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { MemoryService } from "./services/memoryService";
import { getAgentSwarmReport, runBFSIAgency, runApexPods, runEventAgent } from "./services/geminiFrontendService";

export default function App() {
  const [state, setState] = useState<EngineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const brokerKeysRef = useRef<{ clientId: string; accessToken: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.email === "chijobha@gmail.com") {
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/engine-state");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Server responded with ${res.status}: ${text.slice(0, 100)}`);
        }
        const data: EngineState = await res.json();
        setState(data);
        setLoading(false);

        // Auto-Heal: If frontend has keys but server reports disconnected, re-sync
        if (brokerKeysRef.current && !data.isBrokerConnected) {
          console.log("[FRONTEND] Auto-Healing Broker Connection...");
          fetch("/api/broker/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(brokerKeysRef.current)
          }).catch(err => console.error("Auto-heal failed:", err));
        }
      } catch (err) {
        console.error("Failed to fetch engine state:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const [lastAgentRun, setLastAgentRun] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const isAgentRunningRef = useRef(false);

  const runAgents = useCallback(async () => {
    if (isAgentRunningRef.current) return;
    isAgentRunningRef.current = true;
    setIsAnalyzing(true);
    
    console.log("[FRONTEND] Triggering Agent Swarm...");
    setLastAgentRun(Date.now());
    try {
      const [reports, bfsiReport, apexSignals, eventReport] = await Promise.all([
        getAgentSwarmReport(),
        runBFSIAgency(),
        runApexPods(),
        runEventAgent()
      ]);

      await fetch("/api/update-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reports, bfsiReport, apexSignals, eventReport })
      });
    } catch (err) {
      console.error("[FRONTEND] Agent execution failed:", err);
    } finally {
      isAgentRunningRef.current = false;
      setIsAnalyzing(false);
    }
  }, []);

  // Agent Polling Logic (Frontend-driven to comply with security guidelines)
  useEffect(() => {
    if (!user || !state) return;

    const now = Date.now();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now + istOffset);
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const timeInMins = hours * 60 + minutes;

    // 7:00 AM to 4:00 PM IST
    const isWorkingHours = timeInMins >= 420 && timeInMins < 960;
    
    // Refresh interval: 2 minutes for high-frequency market analysis
    const REFRESH_INTERVAL = 2 * 60 * 1000;
    const timeSinceLastRun = now - lastAgentRun;
    const needsRefresh = timeSinceLastRun > REFRESH_INTERVAL;
    const hasNeverRun = lastAgentRun === 0;

    // Guard: Only trigger if we have never run OR if enough time has passed
    // This prevents infinite loops when state.agentReports.length is 0
    if (isWorkingHours && ((state.agentReports.length === 0 && hasNeverRun) || needsRefresh)) {
      runAgents();
    }
    
    // Polling interval check every 30 seconds
    const interval = setInterval(() => {
      const currentTime = Date.now();
      if (isWorkingHours && (currentTime - lastAgentRun) > REFRESH_INTERVAL) {
        runAgents();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [user, state?.isSimulating, state?.agentReports.length, lastAgentRun, runAgents]);

  const handleSimulate = async () => {
    try {
      await fetch("/api/simulate", { method: "POST" });
      // Trigger agents immediately for simulation
      console.log("[FRONTEND] Simulation Triggered: Waking Agents...");
      const [reports, bfsiReport, apexSignals, eventReport] = await Promise.all([
        getAgentSwarmReport(),
        runBFSIAgency(),
        runApexPods(),
        runEventAgent()
      ]);

      await fetch("/api/update-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reports, bfsiReport, apexSignals, eventReport })
      });
    } catch (err) {
      console.error("Simulation failed", err);
    }
  };

  const handleReset = async () => {
    try {
      await fetch("/api/reset", { method: "POST" });
    } catch (err) {
      console.error("Reset failed", err);
    }
  };

  const handleKill = async () => {
    try {
      await fetch("/api/kill", { method: "POST" });
    } catch (err) {
      console.error("Kill switch failed", err);
    }
  };

  const handleToggleSafety = async () => {
    if (!state) return;
    const newSafety = !state.isSafetyOn;
    try {
      const res = await fetch("/api/broker/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ safety: newSafety })
      });
      if (res.ok) {
        const data = await res.json();
        setState({ ...state, isSafetyOn: data.safety, brokerMode: data.mode });
        
        // If going LIVE, trigger a fresh swarm to ensure the engine has a bias
        if (!newSafety) {
          console.log("[FRONTEND] Entering LIVE Mode: Triggering Intelligence Swarm...");
          const [reports, bfsiReport, apexSignals, eventReport] = await Promise.all([
            getAgentSwarmReport(),
            runBFSIAgency(),
            runApexPods(),
            runEventAgent()
          ]);

          await fetch("/api/update-agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reports, bfsiReport, apexSignals, eventReport })
          });
        }
      }
    } catch (err) {
      console.error("Safety toggle failed", err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const handleTeachAgent = async (tradeId: string) => {
    const reason = window.prompt("Why did this trade result in a loss?");
    if (!reason) return;
    
    const correction = window.prompt("What should the agent do differently next time? (e.g., 'Wait for RSI confirmation', 'Check news first')");
    if (!correction) return;

    try {
      const lastLesson = state.lessons[0];
      const previousHash = lastLesson ? lastLesson.hash : "0";
      const index = lastLesson ? lastLesson.index + 1 : 0;

      await MemoryService.recordLesson({
        tradeId,
        outcome: "LOSS",
        reasonForLoss: reason,
        agentCorrection: correction,
        confidence: 0.9
      }, previousHash, index);
      
      alert(`Proof of Learning Block #${index} Generated. AI Neural Weights Updated.`);
      // Trigger a server sync to update the state
      await fetch("/api/sync-memory", { method: "POST" });
    } catch (err) {
      console.error("Failed to teach agent:", err);
    }
  };

  const handleConnectBroker = async (clientId: string, accessToken: string) => {
    setIsConnecting(true);
    brokerKeysRef.current = { clientId, accessToken };
    
    try {
      // 1. Save to Firestore DIRECTLY from frontend (bypassing server permission issues)
      const configRef = doc(db, "config", "main");
      await setDoc(configRef, {
        brokerClientId: clientId,
        brokerAccessToken: accessToken,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. Tell the server to sync the new config
      const res = await fetch("/api/broker/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, accessToken })
      });

      if (res.ok) {
        const data = await res.json();
        if (state) setState({ ...state, isBrokerConnected: data.connected });
      } else {
        const errData = await res.json();
        console.error("Broker sync failed:", errData.error);
        alert(`BROKER SYNC FAILED: ${errData.error || "Unknown Server Error"}`);
      }
    } catch (err) {
      console.error("Broker connection error:", err);
      alert(`BROKER LINK ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsConnecting(false);
    }
  };

  if (authChecking) {
    return (
      <div className="flex items-center justify-center h-screen bg-obsidian text-gold">
        <WealthSymbol className="w-12 h-12 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <CustomCursor />
        <LoginGate onLogin={(u) => setUser(u)} />
      </>
    );
  }

  if (loading || !state) {
    return (
      <div className="flex items-center justify-center h-screen bg-obsidian text-gold overflow-hidden relative">
        <div className="scan-line" />
        <div className="flex flex-col items-center z-10">
          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.5, 1, 0.5]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <WealthSymbol className="w-16 h-16 mb-phi-sm" />
          </motion.div>
          <span className="font-serif text-2xl tracking-widest uppercase italic">Confluence Engine</span>
          <div className="w-phi-2xl h-px bg-gold/20 mt-phi-sm overflow-hidden">
            <motion.div 
              animate={{ x: [-100, 100] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-full h-full bg-gold"
            />
          </div>
          <span className="text-[10px] font-mono mt-phi-lg tracking-[0.5em] text-gold/40">INITIALIZING AI CORE</span>
        </div>
      </div>
    );
  }

  const chartData = state.fibLevels ? [
    { name: "-5", price: state.fibLevels.levelMinus5 },
    { name: "-4", price: state.fibLevels.levelMinus4 },
    { name: "-3", price: state.fibLevels.levelMinus3 },
    { name: "-2", price: state.fibLevels.levelMinus2 },
    { name: "-1", price: state.fibLevels.levelMinus1 },
    { name: "0", price: state.fibLevels.level0 },
    { name: "1", price: state.fibLevels.level1 },
    { name: "2", price: state.fibLevels.level2 },
    { name: "3", price: state.fibLevels.level3 },
    { name: "4", price: state.fibLevels.level4 },
    { name: "5", price: state.fibLevels.level5 },
  ] : [];

  return (
    <div className="min-h-screen bg-obsidian text-ivory p-phi-lg font-sans selection:bg-gold/30 relative overflow-x-hidden">
      <div className="scan-line" />
      
      {/* Custom Cursor */}
      <CustomCursor />

      {/* Header */}
      <motion.header 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="flex flex-col items-center mb-phi-xl border-b border-gold/10 pb-phi-xl pt-phi-lg relative overflow-hidden text-center justify-center"
      >
        <div className="hud-corner hud-corner-tl" />
        <div className="hud-corner hud-corner-tr" />
        
        {/* Global Stats - Floating HUD Overlays */}
        <div className="absolute top-phi-lg right-phi-xl flex flex-col items-end gap-3 pointer-events-none">
          <div className="neon-box-gold bg-obsidian/40 backdrop-blur-md p-2 px-4 rounded-sm flex flex-col items-end min-w-[120px]">
            <span className="text-[9px] text-gold/60 font-mono uppercase tracking-[0.3em] mb-1">Market Bias</span>
            <span className={`text-3xl font-mono ${state.marketBiasScore > 0 ? "neon-text-gold" : state.marketBiasScore < 0 ? "neon-text-emerald" : "text-gold/40"}`}>
              {state.marketBiasScore > 0 ? "+" : ""}{state.marketBiasScore.toFixed(1)}
            </span>
          </div>

          <div className="neon-box-emerald bg-obsidian/40 backdrop-blur-md p-2 px-4 rounded-sm flex flex-col items-end min-w-[120px]">
            <span className="text-[9px] text-emerald/60 font-mono uppercase tracking-[0.3em] mb-1">{state.isMarketOpen ? "Market Pulse" : "System pulse"}</span>
            <span className={`text-2xl font-mono neon-text-emerald`}>
              {new Date(state.currentTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Vertical Branding Stack */}
        <div className="flex flex-col items-center gap-phi-lg z-10">
          <motion.div
            animate={{ 
              y: [0, -10, 0],
              scale: [1, 1.05, 1],
              filter: [
                "drop-shadow(0 0 10px rgba(212,175,55,0.1))",
                "drop-shadow(0 0 30px rgba(212,175,55,0.4))",
                "drop-shadow(0 0 10px rgba(212,175,55,0.1))"
              ]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <WealthSymbol className="w-24 h-24" />
          </motion.div>

          <div className="space-y-phi-sm">
            <motion.h1 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.5, delay: 0.2 }}
              className="text-4xl md:text-8xl font-medium uppercase tracking-[0.3em] leading-none"
            >
              CONFLUENCE <span className="font-light italic text-gold/20">ENGINE</span>
            </motion.h1>
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="flex items-center justify-center gap-phi-lg opacity-40"
            >
              <div className="h-px w-phi-xl bg-gradient-to-r from-transparent to-gold/30" />
              <p className="text-[10px] font-mono tracking-[0.6em] uppercase">Quantitative architecture</p>
              <div className="h-px w-phi-xl bg-gradient-to-l from-transparent to-gold/30" />
            </motion.div>
          </div>
        </div>

        {/* Action Command Belt */}
        <div className="mt-phi-xl flex flex-wrap items-center justify-center gap-phi-lg pt-phi-lg border-t border-gold/5 w-full max-w-5xl px-phi-lg">
          <button 
            onClick={handleSimulate}
            className="neon-box-gold px-4 py-2 text-[10px] font-mono text-gold/80 hover:bg-gold/5 transition-all uppercase tracking-widest rounded-sm"
          >
            RUN SIMULATION
          </button>
          <button 
            onClick={handleReset}
            className="neon-box-gold px-4 py-2 text-[10px] font-mono text-gold/60 hover:bg-gold/5 transition-all uppercase tracking-widest rounded-sm"
          >
            RESET
          </button>
          <button 
            onClick={handleKill}
            className="neon-box-red px-4 py-2 text-[10px] font-mono text-red-500/80 hover:bg-red-500/5 transition-all uppercase tracking-widest rounded-sm"
          >
            KILL SWITCH
          </button>
          <div className="hidden md:block h-3 w-px bg-gold/10 mx-2" />
          <button 
            onClick={handleLogout}
            className="neon-box-gold opacity-60 px-4 py-2 text-[10px] font-mono text-gold/60 hover:bg-gold/5 transition-all uppercase tracking-widest rounded-sm"
          >
            LOGOUT
          </button>
          {state.isBrokerConnected && (
            <button 
              onClick={handleToggleSafety}
              className={`px-phi-xl py-2 text-[10px] font-mono transition-all uppercase tracking-[0.2em] relative overflow-hidden group rounded-sm ${
                state.isSafetyOn 
                  ? "neon-box-emerald text-emerald hover:bg-emerald/5" 
                  : "neon-box-red text-red-500 bg-red-500/5 hover:bg-red-500/10"
              }`}
            >
              <div className="absolute inset-0 bg-white/5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
              <span className="relative z-10">{state.isSafetyOn ? "GO LIVE" : "EXIT LIVE"}</span>
            </button>
          )}
          <div className="neon-box-emerald bg-emerald/5 px-phi-lg py-1.5 rounded-full flex items-center shadow-lg transform scale-90 translate-y-0.5">
            <Sparkles className="w-3 h-3 mr-2 text-emerald animate-pulse" />
            <span className={`text-[9px] font-mono uppercase tracking-widest ${state.isMarketOpen ? "text-emerald" : "text-emerald/60"}`}>
              {state.isMarketOpen ? "MARKET ACTIVE" : "MARKET DORMANT"}
            </span>
          </div>
        </div>
      </motion.header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-phi-lg">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-phi-lg">
          {!state.isBrokerConnected && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="col-span-12"
            >
              <BrokerConnect onConnect={handleConnectBroker} isConnecting={isConnecting} />
            </motion.div>
          )}

          {/* Apex Pods Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-phi-lg">
            {state.apexSignals.map((signal, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1, duration: 0.8 }}
              >
                <Card className="bg-card backdrop-blur-xl border-gold/10 relative overflow-hidden group">
                  <div className="hud-corner hud-corner-tl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="pb-phi-sm">
                    <CardTitle className="text-[10px] font-mono uppercase text-gold/40 flex items-center gap-2">
                      <Activity className="w-3 h-3" /> {signal.pod}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div>
                      <div className={`text-xl font-serif ${signal.score > 0 ? "text-emerald" : signal.score < 0 ? "text-gold" : "text-ivory/40"}`}>
                        {signal.signal}
                      </div>
                      <p className="text-[9px] text-gold/30 mt-1 uppercase tracking-tighter line-clamp-1">{signal.reasoning}</p>
                    </div>
                    <div className={`text-2xl font-mono ${signal.score > 0 ? "text-emerald" : signal.score < 0 ? "text-gold" : "text-ivory/40"}`}>
                      {signal.score > 0 ? "+" : ""}{signal.score}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-phi-lg">
            {[
              { title: "Consensus", value: state.consensus, icon: Brain, sub: "Weighted Voting Quorum" },
              { title: "Market Bias", value: state.agentReports[0]?.bias || "NEUTRAL", icon: TrendingUp, sub: "Aggregated Sentiment", color: state.agentReports[0]?.bias === "Bullish" ? "text-emerald" : "text-gold" },
              { title: "Audit Chain", value: state.lastHash.substring(0, 12) + "...", icon: Hash, sub: "Tamper-Proof SHA-256", mono: true }
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1, duration: 0.8 }}
              >
                <Card className="bg-card backdrop-blur-xl border-gold/10 hover:border-gold/30 transition-colors duration-500 relative overflow-hidden group neon-box-gold">
                  <div className="hud-corner hud-corner-tl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="hud-corner hud-corner-br opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="pb-phi-sm">
                    <CardTitle className="text-[10px] font-mono uppercase text-gold/40 flex items-center gap-2">
                      <item.icon className="w-3 h-3" /> {item.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-serif tracking-wide ${item.color || "text-gold"}`}>
                      {item.value}
                    </div>
                    <p className="text-[9px] text-gold/30 mt-1 uppercase tracking-tighter">{item.sub}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Chart Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 1 }}
          >
            <Card className="bg-card backdrop-blur-2xl border-gold/10 overflow-hidden relative">
              <div className="hud-corner hud-corner-tl" />
              <div className="hud-corner hud-corner-tr" />
              <CardHeader className="border-b border-gold/5">
                <CardTitle className="text-xl font-serif flex items-center gap-phi-sm">
                  <Activity className="w-5 h-5 text-gold" />
                  Natural Geometry Extensions
                </CardTitle>
                <CardDescription className="text-gold/40 italic">
                  ORB Fibonacci Proportions • 30m Opening Range
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-phi-lg">
                {state.fibLevels ? (
                  <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#d4af37" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#d4af37" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="10 10" stroke="rgba(212, 175, 55, 0.05)" vertical={false} />
                        <XAxis dataKey="name" stroke="rgba(212, 175, 55, 0.3)" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="rgba(212, 175, 55, 0.3)" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'rgba(8, 9, 10, 0.95)', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '1rem', backdropFilter: 'blur(10px)' }}
                          itemStyle={{ color: '#d4af37', fontFamily: 'serif' }}
                        />
                        <Area type="monotone" dataKey="price" stroke="#d4af37" strokeWidth={1} fillOpacity={1} fill="url(#colorPrice)" />
                        <ReferenceLine y={state.fibLevels.level1} stroke="rgba(212, 175, 55, 0.2)" strokeDasharray="3 3" />
                        <ReferenceLine y={state.fibLevels.level0} stroke="rgba(212, 175, 55, 0.2)" strokeDasharray="3 3" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[350px] flex flex-col items-center justify-center neon-box-gold bg-gold/5 rounded-2xl relative">
                    <div className="hud-corner hud-corner-tl" />
                    <div className="hud-corner hud-corner-br" />
                    <motion.div
                      animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.1, 1] }}
                      transition={{ duration: 4, repeat: Infinity }}
                    >
                      <Clock className="w-16 h-16 mb-phi-sm text-gold" />
                    </motion.div>
                    <p className="text-xs font-serif italic tracking-[0.3em] uppercase neon-text-gold">Awaiting Natural Alignment</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Agent Section */}
          <Card className="bg-card backdrop-blur-xl border-gold/10 relative">
            <div className="hud-corner hud-corner-bl" />
            <div className="hud-corner hud-corner-br" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-serif flex items-center gap-phi-sm">
                <Brain className="w-5 h-5 text-gold" />
                The Senses • Agent Swarm
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={runAgents}
                disabled={isAnalyzing}
                className="neon-box-gold border-gold/20 text-[10px] uppercase tracking-widest font-mono"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                    Analyzing
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3 mr-2" />
                    Sync Intelligence
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="reports" className="w-full">
                <TabsList className="bg-obsidian/50 border border-gold/10 mb-phi-lg p-1 rounded-full">
                  <TabsTrigger value="reports" className="rounded-full px-phi-lg data-[state=active]:bg-gold data-[state=active]:text-obsidian">Insights</TabsTrigger>
                  <TabsTrigger value="trades" className="rounded-full px-phi-lg data-[state=active]:bg-gold data-[state=active]:text-obsidian">Journal</TabsTrigger>
                  <TabsTrigger value="memory" className="rounded-full px-phi-lg data-[state=active]:bg-gold data-[state=active]:text-obsidian">Memory</TabsTrigger>
                  <TabsTrigger value="audit" className="rounded-full px-phi-lg data-[state=active]:bg-gold data-[state=active]:text-obsidian">Audit Chain</TabsTrigger>
                </TabsList>
                <TabsContent value="reports">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-phi-lg">
                      {state.agentReports.length > 0 ? state.agentReports.map((report, idx) => (
                        <motion.div 
                          key={idx}
                          whileHover={{ y: -5 }}
                          className={`p-phi-lg bg-obsidian/30 border rounded-2xl transition-all duration-700 relative group ${report.bias === 'Bullish' ? 'neon-box-emerald border-emerald/20' : 'neon-box-gold border-gold/20'}`}
                        >
                          <div className="hud-corner hud-corner-tl" />
                          <div className="flex items-center justify-between mb-phi-sm">
                            <span className={`${report.bias === 'Bullish' ? 'neon-text-emerald' : 'neon-text-gold'} text-[9px] font-mono uppercase tracking-widest`}>{report.agentId.split('_')[0]}</span>
                            <div className={`w-2 h-2 rounded-full ${report.bias === "Bullish" ? "bg-emerald shadow-[0_0_15px_rgba(16,185,129,0.8)]" : "bg-gold shadow-[0_0_15px_rgba(212,175,55,0.8)]"}`} />
                          </div>
                          <p className={`text-xs ${report.bias === 'Bullish' ? 'neon-text-emerald' : 'neon-text-gold'} font-serif leading-relaxed italic mb-phi-sm line-clamp-4`}>"{report.reasoning}"</p>
                        <div className="flex items-center gap-phi-sm">
                          <div className="h-[2px] flex-1 bg-gold/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${report.intensity * 10}%` }}
                              transition={{ duration: 2, delay: idx * 0.2 }}
                              className="h-full bg-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]" 
                            />
                          </div>
                          <span className="text-[9px] font-mono text-gold/40">{report.intensity}/10</span>
                        </div>
                      </motion.div>
                    )) : (
                      <div className="col-span-3 py-phi-xl text-center text-gold/10 font-serif text-xl italic tracking-widest">
                        Agents in deep meditation...
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="trades">
                  <ScrollArea className="h-[250px] rounded-2xl border border-gold/5 bg-obsidian/40">
                    <Table>
                      <TableHeader className="bg-gold/5 sticky top-0 z-10">
                        <TableRow className="border-gold/10 hover:bg-transparent">
                          <TableHead className="text-gold font-serif text-[10px] uppercase tracking-widest px-phi-lg">Time</TableHead>
                          <TableHead className="text-gold font-serif text-[10px] uppercase tracking-widest">Symbol</TableHead>
                          <TableHead className="text-gold font-serif text-[10px] uppercase tracking-widest text-right">Side</TableHead>
                          <TableHead className="text-gold font-serif text-[10px] uppercase tracking-widest text-right px-phi-lg flex items-center justify-end gap-1">
                            Status <ReceiptText className="w-2 h-2 opacity-50" />
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {state.trades && state.trades.length > 0 ? state.trades.map((trade, idx) => (
                          <TableRow key={idx} className="border-gold/5 hover:bg-gold/5 transition-colors group relative overflow-hidden">
                            <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 ${trade.type === 'BUY' ? 'bg-emerald shadow-[0_0_10px_#10b981]' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'}`} />
                            <TableCell className="font-mono text-[10px] text-gold/40 px-phi-lg">{new Date(trade.time).toLocaleTimeString()}</TableCell>
                            <TableCell className="font-serif text-ivory text-xs font-semibold">
                              <div className="flex flex-col">
                                <span>{trade.symbol}</span>
                                <button 
                                  onClick={() => handleTeachAgent(trade.symbol + idx)}
                                  className="text-[8px] text-gold/40 hover:text-gold uppercase tracking-tighter w-fit font-mono mt-0.5"
                                >
                                  [Teach Agent]
                                </button>
                              </div>
                            </TableCell>
                            <TableCell className={`text-right font-mono text-[10px] ${trade.type === 'BUY' ? 'text-emerald' : 'text-red-400'}`}>
                              {trade.type} [{trade.qty}]
                            </TableCell>
                            <TableCell className="text-right px-phi-lg">
                              <Badge variant="outline" className={`text-[8px] border-gold/20 ${trade.status === 'SUCCESS' ? 'bg-emerald/10 text-emerald' : 'bg-gold/5 text-gold'}`}>
                                {trade.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={4} className="h-32 text-center text-gold/10 font-serif italic uppercase tracking-widest">
                              No execution signatures recorded
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="memory">
                  <ScrollArea className="h-[250px] rounded-2xl border border-gold/5 bg-obsidian/40 p-phi-lg">
                    <div className="space-y-phi-lg">
                      {state.lessons && state.lessons.length > 0 ? state.lessons.map((lesson, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="p-phi-lg bg-obsidian/40 border border-gold/10 rounded-2xl relative group neon-box-gold"
                        >
                          <div className="hud-corner hud-corner-tr" />
                          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                            <span className="text-[7px] font-mono text-gold uppercase tracking-tighter">SHARD:</span>
                            <span className="text-[7px] font-mono text-gold break-all max-w-[60px] truncate">{lesson.hash}</span>
                          </div>
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-mono text-gold/60 flex items-center gap-2">
                              <Database className="w-3 h-3" /> COGNITIVE_BLOCK_{lesson.index}
                            </span>
                            <Badge variant="outline" className="text-[8px] bg-red-900/10 text-red-400 border-red-900/20">{lesson.outcome}</Badge>
                          </div>
                          <p className="text-xs text-ivory/80 font-serif italic mb-2">"{lesson.reasonForLoss}"</p>
                          <div className="flex items-center gap-2 bg-gold/5 p-2 rounded-lg border border-gold/5">
                            <Microscope className="w-3 h-3 text-gold" />
                            <p className="text-[10px] text-gold/80 font-mono tracking-tight">{lesson.agentCorrection}</p>
                          </div>
                        </motion.div>
                      )) : (
                        <div className="h-32 flex flex-col items-center justify-center gap-4 text-gold/10 border border-dashed border-gold/10 rounded-2xl">
                          <Brain className="w-12 h-12 mb-2 opacity-20" />
                          <p className="font-serif italic uppercase tracking-widest text-sm">Artificial mind is currently pristine</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="audit">
                  <ScrollArea className="h-[250px] rounded-2xl border border-gold/5 bg-obsidian/40 p-phi-lg">
                    <div className="space-y-phi-sm">
                      {state.logs && state.logs.length > 0 ? [...state.logs].reverse().map((log, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-start gap-phi-sm font-mono text-[9px] group"
                        >
                          <span className="text-gold/20 font-serif tabular-nums min-w-[60px]">{log.time}</span>
                          <span className="text-gold/20 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-tighter">BLOCK_REF_</span>
                          <span className={`${
                            log.type === 'error' ? 'text-red-400' : 
                            log.type === 'success' ? 'text-emerald' : 
                            log.type === 'market' ? 'text-gold' : 'text-gold/60'
                          } flex-1`}>
                            {log.msg}
                          </span>
                        </motion.div>
                      )) : (
                        <div className="h-32 flex items-center justify-center text-[10px] uppercase font-mono tracking-tighter text-gold/10">
                          Empty Ledger Cache // No Network Activity
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* BFSI Sector Agency Section */}
          <AnimatePresence>
            {state.bfsiReport && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 1 }}
              >
                <Card className="bg-card backdrop-blur-xl border-gold/20 relative overflow-hidden neon-box-gold">
                  <div className="hud-corner hud-corner-tl" />
                  <div className="hud-corner hud-corner-tr" />
                  <div className="absolute top-0 right-0 p-2">
                    <Badge variant="outline" className="text-[8px] border-gold/20 bg-gold/5">MOE ARCHITECTURE</Badge>
                  </div>
                  <CardHeader>
                    <CardTitle className="text-xl font-serif flex items-center gap-phi-sm">
                      <WealthSymbol className="w-5 h-5" />
                      BFSI Sector Agency Matrix
                    </CardTitle>
                    <CardDescription className="text-gold/40 italic">
                      Mixture of Experts (MoE) • 3-Tier Synthesis
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-phi-lg">
                      <div className="md:col-span-1 space-y-phi-sm">
                        <div className="p-phi-sm bg-obsidian/40 border border-gold/10 rounded-xl neon-box-gold">
                          <p className="text-[8px] font-mono text-gold/40 uppercase tracking-widest mb-1">Sector Bias</p>
                          <p className={`text-xl font-serif ${state.bfsiReport.bias === "Bullish" ? "neon-text-emerald" : "neon-text-gold"}`}>{state.bfsiReport.bias}</p>
                        </div>
                        <div className="p-phi-sm bg-obsidian/40 border border-gold/10 rounded-xl neon-box-gold">
                          <p className="text-[8px] font-mono text-gold/40 uppercase tracking-widest mb-1">Conviction</p>
                          <p className="text-xl font-serif neon-text-gold">{state.bfsiReport.conviction}/10</p>
                        </div>
                        <div className="p-phi-sm bg-obsidian/40 border border-gold/10 rounded-xl neon-box-gold">
                          <p className="text-[8px] font-mono text-gold/40 uppercase tracking-widest mb-1">Volatility</p>
                          <p className="text-xl font-serif neon-text-gold">{state.bfsiReport.volatilityScore}/10</p>
                        </div>
                      </div>
                      <div className="md:col-span-3 p-phi-lg bg-obsidian/20 border border-gold/5 rounded-2xl relative neon-box-gold">
                        <div className="absolute top-2 right-2">
                          <div className={`flex items-center gap-2 text-[8px] font-mono ${state.bfsiReport.triggerFibLogic ? "text-emerald" : "text-gold/40"}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${state.bfsiReport.triggerFibLogic ? "bg-emerald animate-pulse" : "bg-gold/20"}`} />
                            {state.bfsiReport.triggerFibLogic ? "FIB LOGIC ARMED" : "FIB LOGIC VETOED"}
                          </div>
                        </div>
                        <p className="text-[10px] font-mono text-gold/40 uppercase tracking-widest mb-phi-sm flex items-center gap-2">
                          <Activity className="w-3 h-3" /> The Judge's Verdict
                        </p>
                        <p className="text-sm text-ivory/80 font-serif leading-relaxed italic">
                          "{state.bfsiReport.reasoning}"
                        </p>
                        {state.bfsiReport.keyLevels && state.bfsiReport.keyLevels.length > 0 && (
                          <div className="mt-phi-lg flex gap-phi-sm">
                            {state.bfsiReport.keyLevels.map((lvl, i) => (
                              <Badge key={i} variant="secondary" className="bg-gold/10 text-gold border-gold/20 font-mono text-[10px]">
                                LVL_{i+1}: {lvl}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-phi-lg">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 1 }}
          >
            <Card className="bg-card backdrop-blur-xl border-gold/10 relative">
              <div className="hud-corner hud-corner-tr" />
              <CardHeader>
                <CardTitle className="text-xs font-mono uppercase text-gold/40 tracking-widest">Natural Wealth Levels</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-phi-sm">
                  {state.fibLevels ? [
                    { label: "Fib 5.0", price: state.fibLevels.level5, color: "text-emerald" },
                    { label: "Fib 4.0", price: state.fibLevels.level4, color: "text-emerald/80" },
                    { label: "Fib 3.0", price: state.fibLevels.level3, color: "text-emerald/60" },
                    { label: "Fib 2.0", price: state.fibLevels.level2, color: "text-emerald/40" },
                    { label: "Fib 1.0 (High)", price: state.fibLevels.level1, color: "text-emerald/30" },
                    { label: "Fib 0.0 (Low)", price: state.fibLevels.level0, color: "text-gold", bold: true },
                    { label: "Fib -1.0", price: state.fibLevels.levelMinus1, color: "text-gold/80" },
                    { label: "Fib -2.0", price: state.fibLevels.levelMinus2, color: "text-gold/60" },
                    { label: "Fib -3.0", price: state.fibLevels.levelMinus3, color: "text-gold/40" },
                    { label: "Fib -4.0", price: state.fibLevels.levelMinus4, color: "text-gold/30" },
                    { label: "Fib -5.0", price: state.fibLevels.levelMinus5, color: "text-gold/20" }
                  ].map((level, i) => (
                    <div key={i} className={`flex justify-between items-center p-phi-sm rounded-xl border border-transparent hover:border-gold/5 hover:bg-gold/5 transition-all duration-500 ${level.bold ? "bg-gold/5 border-gold/10 shadow-[0_0_15px_rgba(212,175,55,0.05)]" : ""}`}>
                      <span className="text-[11px] font-serif italic">{level.label}</span>
                      <span className={`font-mono text-sm ${level.color}`}>{level.price.toFixed(2)}</span>
                    </div>
                  )) : (
                    <div className="py-phi-xl text-center text-gold/10 font-serif italic">Awaiting Calculation</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <Card className="bg-card backdrop-blur-xl border-gold/10 relative">
            <div className="hud-corner hud-corner-br" />
            <CardHeader>
              <CardTitle className="text-xs font-mono uppercase text-gold/40 tracking-widest">Live Execution Log</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[350px] pr-phi-sm">
                <div className="space-y-phi-sm">
                  {state.logs.map((log, i) => (
                    <div key={i} className="flex gap-phi-sm group border-b border-gold/5 pb-2 last:border-0">
                      <span className="text-[9px] font-mono text-gold/20 mt-1 shrink-0">{log.time}</span>
                      <p className={`text-[10px] font-mono uppercase tracking-tighter transition-colors ${
                        log.type === "success" ? "text-emerald" : 
                        log.type === "error" ? "text-gold" : 
                        log.type === "agent" ? "text-ivory/80" : "text-gold/60"
                      }`}>
                        {log.msg}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Risk Warning */}
          <motion.div 
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 5, repeat: Infinity }}
            className="p-phi-lg bg-gold/5 border border-gold/10 rounded-2xl flex gap-phi-sm items-start relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gold/5 to-transparent animate-pulse" />
            <AlertTriangle className="w-4 h-4 text-gold shrink-0 mt-1 z-10" />
            <p className="text-[9px] text-gold/60 font-serif leading-relaxed italic uppercase tracking-widest z-10">
              Proprietary Capital Protection Active. Maximum Daily Drawdown (2%) Enforced by Geometric Principles.
            </p>
          </motion.div>
        </div>
      </div>
      
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 180, 270, 360]
          }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full border border-gold/5 opacity-20"
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            rotate: [360, 270, 180, 90, 0]
          }}
          transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-30%] right-[-10%] w-[80vw] h-[80vw] rounded-full border border-emerald/5 opacity-10"
        />
      </div>
    </div>
  );
}
