/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { WealthSymbol } from "./WealthSymbol";
import { auth } from "../lib/firebase";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";

export const LoginGate = ({ onLogin }: { onLogin: (user: any) => void }) => {
  const [step, setStep] = useState<'initial' | 'animating' | 'form'>('initial');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    setStep('animating');
    setTimeout(() => setStep('form'), 1200);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Authorization Check: Only allow the specific admin email
      if (user.email === "chijobha@gmail.com") {
        onLogin(user);
      } else {
        await signOut(auth);
        setError("UNAUTHORIZED SIGNATURE DETECTED");
        setTimeout(() => setError(null), 3000);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setError("ACCESS DENIED: CONNECTION ERROR");
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Geometric Constants
  const PHI = 1.618;
  const SYMBOL_SIZE = 96; // w-24
  const ESTIMATED_TEXT_WIDTH = 320; 
  const TARGET_GAP = SYMBOL_SIZE * 0.8; // Reduced gap for tighter lockup
  
  // Calculate offsets to center the resulting group
  const TOTAL_WIDTH = (SYMBOL_SIZE / 2) + TARGET_GAP + (ESTIMATED_TEXT_WIDTH / 2);
  const SYMBOL_OFFSET = -(TOTAL_WIDTH * 0.55); // Slightly more weight to left for balance
  const TEXT_OFFSET = (TOTAL_WIDTH * 0.45);

  return (
    <div className="fixed inset-0 bg-obsidian flex items-center justify-center z-[100] overflow-hidden">
      <div className="scan-line" />
      
      <div className="relative flex flex-col items-center justify-center w-full max-w-4xl h-full">
        <div className="relative flex items-center justify-center w-full">
          {/* Symbol */}
          <motion.div
            layout
            initial={false}
            animate={{
              x: step === 'initial' ? 0 : SYMBOL_OFFSET,
              scale: step === 'initial' ? PHI : 1,
              rotate: step === 'initial' ? 0 : -90,
            }}
            transition={{ type: "spring", stiffness: 80, damping: 20 }}
            onClick={step === 'initial' ? handleStart : undefined}
            className={`z-20 ${step === 'initial' ? 'cursor-pointer hover:scale-[1.7] transition-transform' : ''}`}
          >
            <WealthSymbol className="w-24 h-24" />
          </motion.div>

          {/* Text - Moving to the right */}
          <AnimatePresence>
            {step !== 'initial' && (
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: TEXT_OFFSET }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="absolute font-serif text-3xl tracking-[0.4em] uppercase italic text-gold whitespace-nowrap z-10 flex items-center"
              >
                Confluence Engine
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Login Form - Appears below */}
        <AnimatePresence>
          {step === 'form' && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="mt-24 flex flex-col items-center w-80"
            >
              <div className="w-full h-px bg-gold/20 mb-8" />
              
              <div className="space-y-6 w-full text-center">
                <p className="text-[10px] font-mono text-gold/60 tracking-[0.2em] uppercase leading-relaxed">
                  The Confluence Engine requires a verified identity signature for access.
                </p>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[10px] font-mono text-red-400 tracking-widest uppercase border border-red-500/20 bg-red-500/5 p-2"
                  >
                    {error}
                  </motion.div>
                )}

                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full py-4 bg-gold/10 border border-gold/30 text-gold text-[10px] font-mono tracking-[0.3em] hover:bg-gold/20 active:scale-95 transition-all uppercase flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="animate-pulse">Verifying Identity...</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Initialize Google Access
                    </>
                  )}
                </button>

                <p className="text-[8px] font-mono text-gold/30 tracking-widest uppercase">
                  Authorized Personnel Only
                </p>
              </div>
              
              <div className="mt-8 flex flex-col items-center space-y-2">
                <span className="text-[8px] font-mono text-gold/40 tracking-[0.5em] uppercase">Security Protocol: Active</span>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                      className="w-1 h-1 bg-gold/40 rounded-full"
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Background Accents */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-gold/5 rounded-full animate-pulse" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-gold/5 rounded-full" />
        </div>
      </div>
    </div>
  );
};
