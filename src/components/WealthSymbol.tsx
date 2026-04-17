/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import { motion } from "motion/react";

export const WealthSymbol = ({ className, onClick }: { className?: string; onClick?: () => void }) => (
  <motion.div 
    className={`relative flex items-center justify-center ${className}`}
    animate={{ filter: ["drop-shadow(0 0 2px #d4af37)", "drop-shadow(0 0 8px #d4af37)", "drop-shadow(0 0 2px #d4af37)"] }}
    transition={{ duration: 3, repeat: Infinity }}
    onClick={onClick}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full text-gold">
      {/* Outer Geometric Ring */}
      <circle cx="12" cy="12" r="10" strokeDasharray="4 4" className="opacity-30" />
      {/* The "Phi" Money Symbol - Representing Golden Ratio Wealth */}
      <path d="M12 3V21" />
      <ellipse cx="12" cy="12" rx="6" ry="8" />
      {/* Circuit Accents */}
      <path d="M7 7L5 5M17 7L19 5M7 17L5 19M17 17L19 19" className="opacity-60" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  </motion.div>
);
