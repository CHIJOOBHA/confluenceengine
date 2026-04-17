/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, Key, Lock, Globe } from "lucide-react";
import { motion } from "motion/react";

interface BrokerConnectProps {
  onConnect: (apiKey: string, accessToken: string) => void;
  isConnecting: boolean;
}

export function BrokerConnect({ onConnect, isConnecting }: BrokerConnectProps) {
  const [apiKey, setApiKey] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey && accessToken) {
      onConnect(apiKey, accessToken);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-2xl mx-auto"
    >
      <Card className="bg-card backdrop-blur-3xl border-gold/10 relative overflow-hidden p-phi-lg">
        <div className="hud-corner hud-corner-tl" />
        <div className="hud-corner hud-corner-tr" />
        <CardHeader className="text-center pb-phi-lg">
          <div className="mx-auto w-16 h-16 bg-gold/10 rounded-full flex items-center justify-center mb-phi-sm border border-gold/10 shadow-[0_0_20px_rgba(212,175,55,0.1)]">
            <ShieldCheck className="w-8 h-8 text-gold" />
          </div>
          <CardTitle className="text-3xl font-serif tracking-wide">Broker Quick Link</CardTitle>
          <CardDescription className="text-gold/40 italic text-sm mt-2">
            No technical knowledge needed. Paste your keys to start live execution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-phi-xl">
            <div className="space-y-3">
              <label className="text-[10px] font-mono text-gold/40 uppercase tracking-[0.3em] flex items-center gap-2">
                <Key className="w-3 h-3" /> Broker API Key
              </label>
              <input 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Ex: kite_api_12345..."
                className="w-full bg-obsidian/40 border border-gold/10 text-ivory placeholder:text-gold/10 h-14 px-phi-lg rounded-2xl focus:outline-none focus:border-gold/40 transition-all font-mono text-sm"
                required
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-mono text-gold/40 uppercase tracking-[0.3em] flex items-center gap-2">
                <Lock className="w-3 h-3" /> API Secret / Token
              </label>
              <input 
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                type="password"
                placeholder="••••••••••••••••"
                className="w-full bg-obsidian/40 border border-gold/10 text-ivory placeholder:text-gold/10 h-14 px-phi-lg rounded-2xl focus:outline-none focus:border-gold/40 transition-all font-mono text-sm"
                required
              />
            </div>
            <button 
              type="submit" 
              disabled={isConnecting}
              className={`w-full ${isConnecting ? 'bg-gold/50 cursor-not-allowed' : 'bg-gold hover:bg-gold/80'} text-obsidian font-bold tracking-[0.3em] uppercase text-xs h-14 rounded-2xl transition-all shadow-[0_10px_30px_rgba(212,175,55,0.1)] flex items-center justify-center`}
            >
              {isConnecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-obsidian/30 border-t-obsidian rounded-full animate-spin mr-3" />
                  AUTHENTICATING BRIDGE...
                </>
              ) : "LINK LIVE TRADING ACCOUNT"}
            </button>
            <div className="flex items-center justify-center gap-4 py-2 border-t border-gold/5 mt-phi-lg">
              <div className="flex items-center gap-2 text-[9px] text-gold/30 font-mono">
                <Globe className="w-2.5 h-2.5" /> ENCRYPTED TRANSIT
              </div>
              <div className="flex items-center gap-2 text-[9px] text-emerald/50 font-mono">
                <ShieldCheck className="w-2.5 h-2.5" /> SECURE HANDSHAKE
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
