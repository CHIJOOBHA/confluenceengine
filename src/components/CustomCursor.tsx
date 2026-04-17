/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

export const CustomCursor = () => {
  // Use MotionValues for absolute zero-latency tracking
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Springs for the "aesthetic" lag on the outer ring
  const ringX = useSpring(mouseX, { stiffness: 150, damping: 20, mass: 0.5 });
  const ringY = useSpring(mouseY, { stiffness: 150, damping: 20, mass: 0.5 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <>
      {/* Primary Indicator - Minimal latency */}
      <motion.div 
        className="custom-cursor" 
        style={{ 
          x: mouseX, 
          y: mouseY,
          position: "fixed",
          top: 0,
          left: 0,
          marginLeft: "-6px", // Centering manually since x/y overwrite transform
          marginTop: "-6px"
        }}
      />
      
      {/* Outer Aesthetic Ring - Controlled lag */}
      <motion.div 
        className="custom-cursor-follower flex items-center justify-center" 
        style={{ 
          x: ringX, 
          y: ringY,
          position: "fixed",
          top: 0,
          left: 0,
          marginLeft: "-22px", // Centering manually (44px width)
          marginTop: "-22px"
        }}
      >
        <div className="w-1 h-1 bg-gold/40 rounded-full animate-pulse" />
      </motion.div>
    </>
  );
};
