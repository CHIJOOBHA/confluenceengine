/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Brain, TrendingUp, Clock, Hash, AlertTriangle, Sparkles } from "lucide-react";
import { motion, useScroll, useSpring, AnimatePresence } from "motion/react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";
import { EngineState, LogEntry } from "./types";
import { WealthSymbol } from "./components/WealthSymbol";
import { LoginGate } from "./components/LoginGate";
import { BrokerConnect } from "./components/BrokerConnect";
import { CustomCursor } from "./components/CustomCursor";
import { auth } from "./lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { getAgentSwarmReport, runBFSIAgency, runApexPods, runEventAgent } from "./services/geminiFrontendService";

export default function App() {
  const [state, setState] = useState<EngineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

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
        const data = await res.json();
        setState(data);
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch engine state:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [user]);

  // Agent Polling Logic (Frontend-driven to comply with security guidelines)
  useEffect(() => {
    if (!user || !state) return;

    const runAgents = async () => {
      console.log("[FRONTEND] Triggering Agent Swarm...");
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
      }
    };

    // Check if we should run agents
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();

    const isPreMarketTime = hours === 8 && minutes === 30;
    const isPostMarketTime = hours === 16 && minutes === 30;

    // Run agents if it's the right time and we don't have reports yet, or if simulation is active
    if ((isPreMarketTime || isPostMarketTime) && state.agentReports.length === 0) {
      runAgents();
    }
    
    // If simulation just started, trigger agents once
    if (state.isSimulating && state.agentReports.length === 0) {
      runAgents();
    }

  }, [user, state?.isSimulating, state?.agentReports.length]);

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
      }
    } catch (err) {
      console.error("Safety toggle failed", err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const handleConnectBroker = async (apiKey: string, accessToken: string) => {
    setIsConnecting(true);
    try {
      const res = await fetch("/api/broker/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, accessToken })
      });
      if (res.ok) {
        const data = await res.json();
        if (state) setState({ ...state, isBrokerConnected: data.connected });
      }
    } catch (err) {
      console.error("Connection failed", err);
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
        <div className="absolute top-phi-lg right-phi-xl flex flex-col items-end opacity-60 pointer-events-none">
          <span className="text-[9px] text-gold/40 font-mono uppercase tracking-[0.3em]">Market Bias</span>
          <span className={`text-2xl font-mono ${state.marketBiasScore > 0 ? "text-emerald" : state.marketBiasScore < 0 ? "text-gold" : "text-ivory/40"}`}>
            {state.marketBiasScore > 0 ? "+" : ""}{state.marketBiasScore.toFixed(1)}
          </span>
          <div className="mt-4 flex flex-col items-end">
            <span className="text-[9px] text-gold/40 font-mono uppercase tracking-[0.3em]">{state.isMarketOpen ? "Market Pulse" : "System pulse"}</span>
            <span className={`text-xl font-mono ${state.isMarketOpen ? "text-emerald" : "text-gold"}`}>{new Date(state.currentTime).toLocaleTimeString()}</span>
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
            className="px-4 py-2 text-[10px] font-mono border border-gold/20 text-gold/60 hover:bg-gold hover:text-obsidian hover:border-gold transition-all uppercase tracking-widest"
          >
            RUN SIMULATION
          </button>
          <button 
            onClick={handleReset}
            className="px-4 py-2 text-[10px] font-mono border border-gold/10 text-gold/30 hover:bg-gold/10 transition-all uppercase tracking-widest"
          >
            RESET
          </button>
          <button 
            onClick={handleKill}
            className="px-4 py-2 text-[10px] font-mono border border-red-500/20 text-red-500/40 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500 transition-all uppercase tracking-widest"
          >
            KILL SWITCH
          </button>
          <div className="hidden md:block h-3 w-px bg-gold/10 mx-2" />
          <button 
            onClick={handleLogout}
            className="px-4 py-2 text-[10px] font-mono border border-gold/10 text-gold/30 hover:bg-gold/10 transition-all uppercase tracking-widest"
          >
            LOGOUT
          </button>
          {state.isBrokerConnected && (
            <button 
              onClick={handleToggleSafety}
              className={`px-phi-xl py-2 text-[10px] font-mono border transition-all uppercase tracking-[0.2em] relative overflow-hidden group shadow-lg ${
                state.isSafetyOn 
                  ? "border-emerald/30 text-emerald hover:bg-emerald/10" 
                  : "border-red-500/50 text-red-500 bg-red-500/5 hover:bg-red-500/10 shadow-[0_0_30px_rgba(239,68,68,0.2)]"
              }`}
            >
              <div className="absolute inset-0 bg-gold/5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
              <span className="relative z-10">{state.isSafetyOn ? "GO LIVE" : "EXIT LIVE"}</span>
            </button>
          )}
          <Badge variant="outline" className={`ml-phi-lg px-phi-lg py-1 rounded-full border-gold/20 ${state.isMarketOpen ? "bg-emerald/10 text-emerald border-emerald/30 shadow-[0_0_15px_rgba(6,78,59,0.2)]" : "bg-gold/5 text-gold/60"}`}>
            <Sparkles className="w-3 h-3 mr-2" />
            {state.isMarketOpen ? "MARKET ACTIVE" : "MARKET DORMANT"}
          </Badge>
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
                <Card className="bg-card backdrop-blur-xl border-gold/10 hover:border-gold/30 transition-colors duration-500 relative overflow-hidden group">
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
                  <div className="h-[350px] flex flex-col items-center justify-center text-gold/20 border border-dashed border-gold/10 rounded-2xl">
                    <motion.div
                      animate={{ opacity: [0.2, 0.5, 0.2] }}
                      transition={{ duration: 4, repeat: Infinity }}
                    >
                      <Clock className="w-16 h-16 mb-phi-sm" />
                    </motion.div>
                    <p className="text-xs font-serif italic tracking-[0.3em] uppercase">Awaiting Natural Alignment</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Agent Section */}
          <Card className="bg-card backdrop-blur-xl border-gold/10 relative">
            <div className="hud-corner hud-corner-bl" />
            <div className="hud-corner hud-corner-br" />
            <CardHeader>
              <CardTitle className="text-xl font-serif flex items-center gap-phi-sm">
                <Brain className="w-5 h-5 text-gold" />
                The Senses • Agent Swarm
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="reports" className="w-full">
                <TabsList className="bg-obsidian/50 border border-gold/10 mb-phi-lg p-1 rounded-full">
                  <TabsTrigger value="reports" className="rounded-full px-phi-lg data-[state=active]:bg-gold data-[state=active]:text-obsidian">Insights</TabsTrigger>
                  <TabsTrigger value="audit" className="rounded-full px-phi-lg data-[state=active]:bg-gold data-[state=active]:text-obsidian">Audit Chain</TabsTrigger>
                </TabsList>
                <TabsContent value="reports">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-phi-lg">
                    {state.agentReports.length > 0 ? state.agentReports.map((report, idx) => (
                      <motion.div 
                        key={idx}
                        whileHover={{ y: -5, borderColor: 'rgba(212, 175, 55, 0.4)' }}
                        className="p-phi-lg bg-obsidian/30 border border-gold/5 rounded-2xl hover:border-gold/20 transition-all duration-700 relative group"
                      >
                        <div className="hud-corner hud-corner-tl opacity-0 group-hover:opacity-100 scale-75 transition-all" />
                        <div className="flex items-center justify-between mb-phi-sm">
                          <span className="text-[9px] font-mono text-gold/40 uppercase tracking-widest">{report.agentId.split('_')[0]}</span>
                          <div className={`w-2 h-2 rounded-full ${report.bias === "Bullish" ? "bg-emerald shadow-[0_0_10px_rgba(6,78,59,0.5)]" : "bg-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]"}`} />
                        </div>
                        <p className="text-xs text-ivory/70 font-serif leading-relaxed italic mb-phi-sm line-clamp-4">"{report.reasoning}"</p>
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
                <TabsContent value="audit">
                  <ScrollArea className="h-[250px] rounded-2xl border border-gold/5 bg-obsidian/40 p-phi-lg">
                    <div className="space-y-phi-lg">
                      {state.agentReports.map((r, i) => (
                        <div key={i} className="flex items-start gap-phi-lg group">
                          <div className="mt-1 p-2 bg-gold/5 rounded-full group-hover:bg-gold/10 transition-colors">
                            <Hash className="w-3 h-3 text-gold/60" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-mono text-gold/80 uppercase tracking-wider">BLOCK_{i+1}_VERIFIED</p>
                            <p className="text-[9px] text-gold/20 font-mono break-all mt-1">{state.lastHash}</p>
                            <Separator className="mt-phi-sm bg-gold/5" />
                          </div>
                        </div>
                      ))}
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
                <Card className="bg-card backdrop-blur-xl border-gold/20 relative overflow-hidden">
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
                        <div className="p-phi-sm bg-obsidian/40 border border-gold/10 rounded-xl">
                          <p className="text-[8px] font-mono text-gold/40 uppercase tracking-widest mb-1">Sector Bias</p>
                          <p className={`text-xl font-serif ${state.bfsiReport.bias === "Bullish" ? "text-emerald" : "text-gold"}`}>{state.bfsiReport.bias}</p>
                        </div>
                        <div className="p-phi-sm bg-obsidian/40 border border-gold/10 rounded-xl">
                          <p className="text-[8px] font-mono text-gold/40 uppercase tracking-widest mb-1">Conviction</p>
                          <p className="text-xl font-serif text-gold">{state.bfsiReport.conviction}/10</p>
                        </div>
                        <div className="p-phi-sm bg-obsidian/40 border border-gold/10 rounded-xl">
                          <p className="text-[8px] font-mono text-gold/40 uppercase tracking-widest mb-1">Volatility</p>
                          <p className="text-xl font-serif text-gold">{state.bfsiReport.volatilityScore}/10</p>
                        </div>
                      </div>
                      <div className="md:col-span-3 p-phi-lg bg-obsidian/20 border border-gold/5 rounded-2xl relative">
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
