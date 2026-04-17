/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import { useState, useEffect } from "react";
import { motion, useSpring } from "motion/react";

const useMousePosition = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const setFromEvent = (e: MouseEvent) => setPosition({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", setFromEvent);
    return () => window.removeEventListener("mousemove", setFromEvent);
  }, []);
  return position;
};

export const CustomCursor = () => {
  const mousePos = useMousePosition();
  const cursorSpringX = useSpring(mousePos.x, { stiffness: 500, damping: 28 });
  const cursorSpringY = useSpring(mousePos.y, { stiffness: 500, damping: 28 });
  const followerSpringX = useSpring(mousePos.x, { stiffness: 250, damping: 20 });
  const followerSpringY = useSpring(mousePos.y, { stiffness: 250, damping: 20 });

  useEffect(() => {
    cursorSpringX.set(mousePos.x);
    cursorSpringY.set(mousePos.y);
    followerSpringX.set(mousePos.x);
    followerSpringY.set(mousePos.y);
  }, [mousePos, cursorSpringX, cursorSpringY, followerSpringX, followerSpringY]);

  return (
    <>
      <motion.div 
        className="custom-cursor" 
        style={{ left: cursorSpringX, top: cursorSpringY, x: "-50%", y: "-50%" }}
      />
      <motion.div 
        className="custom-cursor-follower flex items-center justify-center" 
        style={{ left: followerSpringX, top: followerSpringY, x: "-50%", y: "-50%" }}
      >
        <div className="w-1 h-1 bg-gold/20 rounded-full" />
      </motion.div>
    </>
  );
};
