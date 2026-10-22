/**
 * ROKI INK - the video style.
 * Ink on warm paper: hand-lettered marker headlines, a brush script for emphasis, three accents
 * (Roki violet, sun amber, sky blue), halftone dots, brush underlines and splats, zigzag wipes,
 * marker-drawn charts. Roki is the host: a drawn character who points, cheers, thinks and winces.
 * Green and red are used only for money.
 */
import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/fonts";
import type { Props, Scene, Line } from "./Video";
import { money, amountOf, setCcy } from "./money";

loadFont({ family: "Marker", url: staticFile("fonts/marker.woff2"), weight: "400" });
loadFont({ family: "Brush", url: staticFile("fonts/brush.woff2"), weight: "400" });
loadFont({ family: "Geist", url: staticFile("fonts/geist.woff2"), weight: "100 900" });

const K = {
  paper: "#EFECE6", paper2: "#E6E1D8", ink: "#17130F", ink2: "#5B534B", ink3: "#9A9086",
  violet: "#5E45C8", amber: "#F2A93B", sky: "#2FA3DE", gain: "#1E8A57", loss: "#D23B3B", white: "#FFFDF8",
};
const MARK = "Marker, 'Permanent Marker', sans-serif";
const BRUSH = "Brush, 'Caveat Brush', cursive";
const SANS = "Geist, system-ui, sans-serif";
type Tone = "gain" | "loss" | "brand" | "neutral";
const toneC = (t?: Tone) => (t === "gain" ? K.gain : t === "loss" ? K.loss : t === "brand" ? K.violet : K.ink);
const inr = (v: number, signed = true) => money(v, signed); // name kept: formats in the video's currency

function useSpring(delay = 0, damping = 14, stiffness = 140) {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, stiffness } });
}
const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume = 0.5 }) => (
  <Sequence from={Math.max(0, Math.round(at))} durationInFrames={30} layout="none"><Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} /></Sequence>
);

// ------------------------------------------------------------------ texture and devices
const Paper: React.FC = () => (
  <AbsoluteFill>
    <AbsoluteFill style={{ background: `radial-gradient(1200px 1400px at 50% 35%, ${K.paper}, ${K.paper2})` }} />
    <svg width="1080" height="1920" style={{ position: "absolute", inset: 0, opacity: 0.35, mixBlendMode: "multiply" }}>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" /><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.35  0 0 0 0.09 0" /></filter>
      <rect width="1080" height="1920" filter="url(#grain)" />
    </svg>
  </AbsoluteFill>
);

/** A dotted halftone disc, like printed comics. */
const Halftone: React.FC<{ size: number; color: string; style?: React.CSSProperties }> = ({ size, color, style }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", backgroundImage: `radial-gradient(${color} 32%, transparent 34%)`, backgroundSize: "18px 18px", ...style }} />
);

/** A brush stroke drawn on under a word. */
const BrushLine: React.FC<{ width: number; color: string; delay?: number; height?: number; seed?: number }> = ({ width, color, delay = 0, height = 34, seed = 1 }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [delay, delay + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const w = width, h = height, j = (n: number) => (random(seed + n) - 0.5) * h * 0.35;
  const d = `M4 ${h * 0.55 + j(1)} C ${w * 0.25} ${h * 0.3 + j(2)}, ${w * 0.55} ${h * 0.75 + j(3)}, ${w - 4} ${h * 0.4 + j(4)}`;
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <path d={d} stroke={color} strokeWidth={h * 0.7} strokeLinecap="round" fill="none" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} opacity={0.92} />
    </svg>
  );
};

/** A paint splat (seeded so it never jitters between frames). */
const Splat: React.FC<{ size: number; color: string; seed: number; style?: React.CSSProperties; delay?: number }> = ({ size, color, seed, style, delay = 0 }) => {
  const p = useSpring(delay, 11, 180);
  const pts = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2, r = size * (0.32 + random(seed + i) * 0.16) * (i % 3 === 0 ? 1.25 : 1);
    return [size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r];
  });
  const d = pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ") + "Z";
  const drops = Array.from({ length: 6 }, (_, i) => {
    const a = random(seed + 40 + i) * Math.PI * 2, r = size * (0.52 + random(seed + 60 + i) * 0.14);
    return <circle key={i} cx={size / 2 + Math.cos(a) * r} cy={size / 2 + Math.sin(a) * r} r={size * (0.015 + random(seed + 80 + i) * 0.03)} fill={color} />;
  });
  return (
    <svg width={size} height={size} style={{ transform: `scale(${p})`, ...style }}>
      <path d={d} fill={color} style={{ filter: "url(#rough)" }} />{drops}
      <defs><filter id="rough"><feTurbulence baseFrequency="0.04" numOctaves="2" seed={seed} /><feDisplacementMap in="SourceGraphic" scale={size * 0.06} /></filter></defs>
    </svg>
  );
};

/** Zigzag wipe between scenes: three layers sweep across. */
const Wipe: React.FC<{ dur?: number }> = ({ dur = 12 }) => {
  const f = useCurrentFrame();
  const layers = [K.amber, K.violet, K.ink];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {layers.map((c, i) => {
        const x = interpolate(f, [i * 1.5, i * 1.5 + dur], [-1300, 1300], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
        const zig = Array.from({ length: 13 }, (_, k) => `${k % 2 ? 1180 : 1080} ${k * 160}`).join(" L ");
        return (
          <svg key={i} width="2400" height="1920" style={{ position: "absolute", left: x - 1080, top: 0 }}>
            <path d={`M0 0 L ${zig} L 0 1920 Z`} fill={c} />
          </svg>
        );
      })}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ Roki, the host
type Pose = "wave" | "point" | "cheer" | "think" | "oops" | "idle";
const Roki: React.FC<{ pose: Pose; size: number; flip?: boolean; style?: React.CSSProperties; delay?: number }> = ({ pose, size, flip, style, delay = 0 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const enter = spring({ frame: f - delay, fps, config: { damping: 12, stiffness: 120 } });
  const bob = Math.sin((f / fps) * Math.PI * 1.2) * 6;
  const wig = Math.sin((f / fps) * Math.PI * 3.2) * 5;
  const blink = (Math.floor(f / 6) % 25) === 0;
  const arm = { wave: [-130, -40 + Math.sin(f / 4) * 18], point: [-20, -100], cheer: [-150, -30], think: [-20, 40], oops: [-40, 40], idle: [-20, 20] }[pose];
  const eyes = pose === "oops" ? "x" : pose === "cheer" ? "happy" : pose === "think" ? "side" : "dot";
  const mouth = { wave: "M42 74 Q50 82 58 74", point: "M43 75 Q50 80 57 75", cheer: "M40 72 Q50 88 60 72 Z", think: "M44 77 L56 75", oops: "M43 79 Q50 72 57 79", idle: "M43 75 Q50 79 57 75" }[pose];
  return (
    <div style={{ width: size, height: size * 1.25, transform: `translateY(${(1 - enter) * 300 + bob}px) scaleX(${flip ? -1 : 1})`, ...style }}>
      <svg viewBox="0 0 100 125" width={size} height={size * 1.25} style={{ overflow: "visible" }}>
        {/* antennae */}
        <path d={`M40 30 C37 18 ${30 + wig} 10 ${22 + wig} 5`} stroke={K.ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d={`M60 30 C63 18 ${70 - wig} 10 ${78 - wig} 5`} stroke={K.ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <circle cx={22 + wig} cy={5} r="3.4" fill={K.amber} /><circle cx={78 - wig} cy={5} r="3.4" fill={K.amber} />
        {/* legs */}
        <path d="M40 104 L36 121 M60 104 L64 121" stroke={K.ink} strokeWidth="3.6" strokeLinecap="round" />
        <path d="M30 121 L40 121 M60 121 L70 121" stroke={K.ink} strokeWidth="3.6" strokeLinecap="round" />
        {/* arms: left arm rests, right arm poses */}
        <path d={`M24 70 l-14 ${pose === "cheer" ? -28 : 16}`} stroke={K.ink} strokeWidth="3.6" strokeLinecap="round" />
        <g transform={`rotate(${arm[0] + 90} 76 70)`}><path d={`M76 70 l0 26`} stroke={K.ink} strokeWidth="3.6" strokeLinecap="round" transform={`rotate(${arm[1]} 76 70)`} /></g>
        {/* shell */}
        <ellipse cx="50" cy="68" rx="30" ry="37" fill={K.violet} stroke={K.ink} strokeWidth="3.4" />
        <ellipse cx="38" cy="50" rx="10" ry="5" fill="#fff" opacity="0.22" transform="rotate(-30 38 50)" />
        <path d="M30 92 Q50 100 70 92" stroke={K.ink} strokeWidth="2" fill="none" opacity="0.35" />
        {/* face */}
        <ellipse cx="50" cy="66" rx="20" ry="17" fill={K.white} stroke={K.ink} strokeWidth="2.4" />
        {eyes === "dot" && !blink && <><circle cx="43" cy="63" r="2.8" fill={K.ink} /><circle cx="57" cy="63" r="2.8" fill={K.ink} /></>}
        {eyes === "dot" && blink && <path d="M40 63 h6 M54 63 h6" stroke={K.ink} strokeWidth="2.2" strokeLinecap="round" />}
        {eyes === "side" && <><circle cx="46" cy="61" r="2.6" fill={K.ink} /><circle cx="60" cy="61" r="2.6" fill={K.ink} /></>}
        {eyes === "happy" && <path d="M40 64 q3 -4 6 0 M54 64 q3 -4 6 0" stroke={K.ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />}
        {eyes === "x" && <path d="M40 60 l5 5 m0 -5 l-5 5 M55 60 l5 5 m0 -5 l-5 5" stroke={K.ink} strokeWidth="2.2" strokeLinecap="round" />}
        <path d={mouth} stroke={K.ink} strokeWidth="2.4" fill={pose === "cheer" ? K.loss : "none"} strokeLinecap="round" transform="translate(0 -6)" />
        {/* rising line on the belly: the brand mark */}
        <polyline points="34,92 42,86 48,89 58,80" fill="none" stroke={K.amber} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {pose === "think" && <text x="80" y="30" fontFamily={BRUSH} fontSize="26" fill={K.ink}>?</text>}
        {pose === "cheer" && <path d="M10 30 l-6 -6 M14 22 l-2 -9 M90 30 l6 -6 M86 22 l2 -9" stroke={K.amber} strokeWidth="3" strokeLinecap="round" />}
      </svg>
    </div>
  );
};

// ------------------------------------------------------------------ type helpers
const Letter: React.FC<{ text: string; size: number; color?: string; delay?: number; step?: number; rotate?: number; font?: string; lineHeight?: number }> = ({ text, size, color = K.ink, delay = 0, step = 3, rotate = -3, font = MARK, lineHeight = 1.0 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return (
    <div style={{ fontFamily: font, fontSize: size, lineHeight, color, transform: `rotate(${rotate}deg)`, letterSpacing: font === MARK ? "-0.01em" : 0 }}>
      {text.split(" ").map((w, i) => {
        const p = spring({ frame: f - delay - i * step, fps, config: { damping: 12, stiffness: 160 } });
        return <span key={i} style={{ display: "inline-block", marginRight: "0.22em", opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${0.8 + 0.2 * p})` }}>{w}</span>;
      })}
    </div>
  );
};
const Count: React.FC<{ to: number; delay: number; kind?: "inr" | "plain" }> = ({ to, delay, kind = "inr" }) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [delay, delay + 22], [0, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <>{kind === "inr" ? inr(v) : Math.round(v)}</>;
};
const Sticker: React.FC<{ text: string; color: string; size: number; rotate?: number; delay?: number; ink?: string; style?: React.CSSProperties; children?: React.ReactNode }> = ({ text, color, size, rotate = -6, delay = 0, ink = "#fff", style, children }) => {
  const p = useSpring(delay, 10, 170);
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color, border: `5px solid ${K.ink}`, display: "grid", placeItems: "center", textAlign: "center",
      fontFamily: MARK, fontSize: size * 0.16, lineHeight: 1.0, color: ink, padding: size * 0.12, transform: `rotate(${rotate}deg) scale(${p})`, boxShadow: `8px 8px 0 ${K.ink}`, ...style }}>{children ?? text}</div>
  );
};

// ------------------------------------------------------------------ scenes
const len = (s: Scene, fps: number) => (s.to - s.from) * fps;

const Hook: React.FC<{ s: Extract<Scene, { kind: "hook" }> }> = ({ s }) => {
  const { fps } = useVideoConfig(); const L = len(s, fps);
  const parts = s.accent && s.text.includes(s.accent) ? [s.text.slice(0, s.text.indexOf(s.accent)).trim(), s.accent] : [s.text, ""];
  const words = parts[0].split(" ").length;
  return (
    <AbsoluteFill style={{ padding: "260px 70px 0" }}>
      <Halftone size={620} color={s.tone === "loss" ? "rgba(210,59,59,.28)" : "rgba(94,69,200,.25)"} style={{ position: "absolute", right: -160, top: 160 }} />
      <Letter text={parts[0]} size={118} rotate={-3} />
      {parts[1] && (
        <div style={{ marginTop: 40, position: "relative", display: "inline-block" }}>
          <div style={{ position: "absolute", left: -10, top: 70 }}><BrushLine width={760} height={60} color={s.tone === "loss" ? "rgba(210,59,59,.85)" : K.amber} delay={words * 3 + 6} /></div>
          <div style={{ position: "relative" }}><Letter text={parts[1]} size={150} font={BRUSH} color={toneC(s.tone)} delay={words * 3 + 4} rotate={-4} /></div>
        </div>
      )}
      <div style={{ position: "absolute", right: 40, bottom: 470 }}><Roki pose={s.tone === "loss" ? "oops" : "point"} size={290} flip delay={Math.min(L * 0.3, 18)} /></div>
    </AbsoluteFill>
  );
};

const Intro: React.FC<{ s: Extract<Scene, { kind: "intro" }> }> = ({ s }) => {
  const colors = [K.violet, K.amber, K.sky];
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 210 }}>
      <Splat size={760} color="rgba(242,169,59,.9)" seed={7} style={{ position: "absolute", top: 170 }} />
      <div style={{ position: "relative", marginTop: 40 }}><Roki pose="wave" size={430} /></div>
      <div style={{ marginTop: -10 }}><Letter text="I'm Roki" size={150} font={BRUSH} rotate={-4} delay={8} /></div>
      <div style={{ fontFamily: MARK, fontSize: 46, color: K.ink2, marginTop: 6 }}>AN AI LEARNING TO TRADE, IN PUBLIC</div>
      <div style={{ position: "absolute", top: 1080, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 26 }}>
        {[...s.chips.slice(0, 2), s.day].map((c, i) => <Sticker key={c} text={c.toUpperCase()} color={colors[i % 3]} ink={i === 1 ? K.ink : "#fff"} size={230} rotate={[-8, 5, -3][i]} delay={16 + i * 5} />)}
      </div>
    </AbsoluteFill>
  );
};

const Chart: React.FC<{ s: Extract<Scene, { kind: "chart" }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const L = len(s, fps);
  const reveal = interpolate(f, [6, L * 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const W = 940, H = 760, pl = 20, pr = 170, pt = 40, pb = 40;
  const vals = s.bars.flatMap((b) => [b.high, b.low]).concat([s.pdh, s.pdl, s.pdc]);
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
  const y = (v: number) => pt + (1 - (v - lo) / sp) * (H - pt - pb);
  const n = s.bars.length, x = (i: number) => pl + (i / Math.max(1, n - 1)) * (W - pl - pr);
  const shown = Math.max(2, Math.floor(reveal * n));
  const jitter = (i: number) => (random(i) - 0.5) * 2.2;
  const path = s.bars.slice(0, shown).map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${(y(b.close) + jitter(i)).toFixed(1)}`).join(" ");
  const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: v < 1000 ? 2 : 0 });
  const ly = (() => { // label positions, pushed apart when levels sit close together
    const raw = [y(s.pdh), y(s.pdc), y(s.pdl)]; const out = [...raw];
    if (out[1] - out[0] < 34) out[0] = out[1] - 34;
    if (out[2] - out[1] < 34) out[2] = out[1] + 34;
    return out;
  })();
  const lvl = (v: number, lab: string, c: string, labelY: number) => (
    <g>
      <path d={`M${pl} ${y(v)} L${W - pr + 12} ${y(v) + 2}`} stroke={c} strokeWidth="4" strokeDasharray="16 12" strokeLinecap="round" />
      <text x={W - pr + 22} y={labelY + 11} fontFamily={MARK} fontSize="30" fill={c}>{lab}</text>
    </g>
  );
  const idx = (t: number) => s.bars.findIndex((b) => b.t >= t);
  const ei = s.entry ? idx(s.entry.t) : -1, xi = s.exit ? idx(s.exit.t) : -1;
  const head = useSpring(0);
  return (
    <AbsoluteFill style={{ paddingTop: 200 }}>
      <div style={{ padding: "0 60px", opacity: head }}>
        <div style={{ fontFamily: MARK, fontSize: 34, color: K.violet }}>{s.sub.toUpperCase()}</div>
        <Letter text={s.title} size={92} rotate={-2} />
      </div>
      <div style={{ position: "relative", margin: "24px 40px 0", width: W, height: H }}>
        <svg width={W} height={H} style={{ overflow: "visible" }}>
          {lvl(s.pdh, "HIGH", K.ink3, ly[0])}{lvl(s.pdc, "CLOSE", K.violet, ly[1])}{lvl(s.pdl, "LOW", K.ink3, ly[2])}
          <path d={`M${pl} ${pt - 10} L${pl - 2} ${H - pb + 6} L${W - pr + 4} ${H - pb + 8}`} stroke={K.ink} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d={path} stroke={K.ink} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {s.entry && ei >= 0 && ei < shown && (
            <g>
              <circle cx={x(ei)} cy={y(s.entry.price)} r="20" fill={K.amber} stroke={K.ink} strokeWidth="5" />
              <text x={x(ei) + 30} y={y(s.entry.price) + (s.entry.side === 1 ? 64 : -34)} fontFamily={BRUSH} fontSize="54" fill={K.ink}>{s.entry.side === 1 ? "bought!" : "sold!"}</text>
            </g>
          )}
          {s.exit && xi >= 0 && xi < shown && (
            <g>
              <circle cx={x(xi)} cy={y(s.exit.price)} r="20" fill={K.sky} stroke={K.ink} strokeWidth="5" />
              <text x={Math.min(x(xi) - 40, W - pr - 160)} y={y(s.exit.price) - 36} fontFamily={BRUSH} fontSize="54" fill={K.ink}>closed</text>
            </g>
          )}
        </svg>
      </div>
      <div style={{ padding: "26px 60px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {s.notes.map((nt, i) => {
          const at = nt.at * L; const p = spring({ frame: f - at, fps, config: { damping: 13, stiffness: 150 } });
          return f >= at ? (
            <div key={i} style={{ fontFamily: MARK, fontSize: 44, color: toneC(nt.tone), transform: `translateX(${(1 - p) * -60}px) rotate(${i % 2 ? 0.8 : -0.8}deg)`, opacity: p }}>
              <Sfx at={at} name="pop" volume={0.3} />→ {nt.text}
            </div>
          ) : null;
        })}
      </div>
      <div style={{ position: "absolute", right: 30, bottom: 440 }}><Roki pose="point" size={200} flip delay={10} /></div>
    </AbsoluteFill>
  );
};

const Predictions: React.FC<{ s: Extract<Scene, { kind: "predictions" }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const L = len(s, fps);
  const [hit, of] = s.title.split(" came true")[0].split(" of ");
  return (
    <AbsoluteFill style={{ paddingTop: 200 }}>
      <div style={{ padding: "0 60px", display: "flex", alignItems: "center", gap: 30 }}>
        <div style={{ position: "relative", width: 330, height: 330, flex: "none" }}>
          <Halftone size={330} color="rgba(47,163,222,.4)" style={{ position: "absolute" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MARK, color: K.ink, transform: "rotate(-5deg)", whiteSpace: "nowrap" }}><span style={{ fontSize: 150 }}>{hit}</span><span style={{ fontSize: 64, marginLeft: 6, marginTop: 50 }}>/{of}</span></div>
        </div>
        <div><div style={{ fontFamily: MARK, fontSize: 34, color: K.violet }}>{s.sub.toUpperCase()}</div><Letter text="came true" size={110} font={BRUSH} rotate={-4} /></div>
      </div>
      <div style={{ padding: "30px 60px 0", display: "flex", flexDirection: "column", gap: 20 }}>
        {s.rows.map((r, i) => {
          const at = 12 + (i * L * 0.65) / s.rows.length; const p = spring({ frame: f - at, fps, config: { damping: 12, stiffness: 160 } });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 26, opacity: f >= at ? 1 : 0.0, transform: `translateX(${(1 - p) * 80}px)` }}>
              {f >= at && <Sfx at={at} name={r.ok ? "chime" : "thud"} volume={r.ok ? 0.3 : 0.45} />}
              <svg width="92" height="92" style={{ flex: "none" }}>
                <circle cx="46" cy="46" r="40" fill={r.ok ? K.amber : K.white} stroke={K.ink} strokeWidth="5" />
                {r.ok ? <path d="M26 48 L41 62 L68 30" stroke={K.ink} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} />
                      : <path d="M30 30 L62 62 M62 30 L30 62" stroke={K.loss} strokeWidth="8" strokeLinecap="round" />}
              </svg>
              <div>
                <div style={{ fontFamily: MARK, fontSize: 50, color: K.ink }}>{r.name}</div>
                <div style={{ fontFamily: SANS, fontSize: 32, color: K.ink2, fontWeight: 500 }}>{r.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Trades: React.FC<{ s: Extract<Scene, { kind: "trades" }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const L = len(s, fps);
  const colors = [K.sky, K.amber, K.violet];
  return (
    <AbsoluteFill style={{ paddingTop: 200 }}>
      <div style={{ padding: "0 60px" }}><Letter text={s.title} size={92} rotate={-2} /></div>
      <div style={{ padding: "34px 50px 0", display: "flex", flexDirection: "column", gap: 34 }}>
        {s.cards.map((c, i) => {
          const at = 6 + (i * L * 0.45) / s.cards.length; const p = spring({ frame: f - at, fps, config: { damping: 11, stiffness: 150 } });
          return (
            <div key={i} style={{ position: "relative", background: K.white, border: `5px solid ${K.ink}`, borderRadius: 24, padding: "28px 34px", boxShadow: `12px 12px 0 ${colors[i % 3]}`,
              transform: `rotate(${[-1.5, 1.2, -0.8][i % 3]}deg) scale(${0.85 + 0.15 * p})`, opacity: p }}>
              <Sfx at={at} name="pop" volume={0.4} />
              <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                <span style={{ fontFamily: MARK, fontSize: 56, color: K.ink }}>{c.name}</span>
                <span style={{ marginLeft: "auto", fontFamily: MARK, fontSize: 64, color: amountOf(c) >= 0 ? K.gain : K.loss }}><Count to={amountOf(c)} delay={at + 4} /></span>
              </div>
              <div style={{ fontFamily: BRUSH, fontSize: 44, color: amountOf(c) >= 0 ? K.gain : K.loss, marginTop: 2 }}>{c.badge.toLowerCase()}</div>
              <div style={{ fontFamily: SANS, fontSize: 32, color: K.ink2, marginTop: 6, fontWeight: 500 }}>{c.note}</div>
            </div>
          );
        })}
        {s.total && (() => {
          const at = L * 0.58; const p = spring({ frame: f - at, fps, config: { damping: 10, stiffness: 160 } });
          return f >= at ? (
            <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 6, transform: `scale(${p}) rotate(-2deg)`, transformOrigin: "left" }}>
              <span style={{ fontFamily: BRUSH, fontSize: 60, color: K.ink }}>{s.total.label}:</span>
              <span style={{ fontFamily: MARK, fontSize: 96, color: amountOf(s.total) >= 0 ? K.gain : K.loss }}><Count to={amountOf(s.total)} delay={at} /></span>
            </div>
          ) : null;
        })()}
      </div>
    </AbsoluteFill>
  );
};

const Testing: React.FC<{ s: Extract<Scene, { kind: "testing" }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const L = len(s, fps);
  return (
    <AbsoluteFill style={{ paddingTop: 200 }}>
      <div style={{ padding: "0 60px" }}>
        <div style={{ fontFamily: MARK, fontSize: 34, color: K.violet }}>RESEARCH IN PROGRESS</div>
        <Letter text={s.title} size={100} rotate={-2} />
      </div>
      <div style={{ padding: "40px 60px 0", display: "flex", flexDirection: "column", gap: 54 }}>
        {s.rows.map((r, i) => {
          const at = 6 + (i * L * 0.45) / s.rows.length; const p = spring({ frame: f - at, fps, config: { damping: 13 } });
          const fill = interpolate(f, [at + 6, at + 34], [0, r.done / r.need], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
          return (
            <div key={i} style={{ opacity: p }}>
              <div style={{ fontFamily: MARK, fontSize: 46, color: K.ink, lineHeight: 1.1 }}>{r.q}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 18 }}>
                <svg width="760" height="56">
                  <rect x="4" y="8" width="752" height="40" rx="20" fill={K.white} stroke={K.ink} strokeWidth="5" />
                  <rect x="10" y="14" width={Math.max(0, 740 * fill)} height="28" rx="14" fill={K.violet} />
                  {Array.from({ length: 19 }, (_, k) => <line key={k} x1={4 + ((k + 1) * 752) / 20} x2={4 + ((k + 1) * 752) / 20} y1="40" y2="48" stroke={K.ink} strokeWidth="2" opacity="0.4" />)}
                </svg>
                <span style={{ fontFamily: MARK, fontSize: 52, color: K.violet }}>{r.done}<span style={{ fontSize: 32, color: K.ink3 }}>/{r.need}</span></span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 32, color: K.ink2, marginTop: 12, fontWeight: 500 }}>{r.finding}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", right: 40, bottom: 440 }}><Roki pose="think" size={220} flip delay={8} /></div>
    </AbsoluteFill>
  );
};

const Next: React.FC<{ s: Extract<Scene, { kind: "next" }> }> = ({ s }) => (
  <AbsoluteFill style={{ paddingTop: 230 }}>
    <div style={{ position: "absolute", right: 30, top: 170, fontFamily: BRUSH, fontSize: 520, color: "rgba(47,163,222,.25)", transform: "rotate(8deg)" }}>?</div>
    <div style={{ padding: "0 60px" }}>
      <div style={{ fontFamily: MARK, fontSize: 34, color: K.violet }}>{s.title.toUpperCase()}</div>
      <div style={{ marginTop: 20 }}><Letter text={s.text} size={96} rotate={-2} step={2} lineHeight={1.08} /></div>
      <div style={{ fontFamily: SANS, fontSize: 36, color: K.ink2, marginTop: 34, fontWeight: 500, lineHeight: 1.35 }}>{s.sub}</div>
    </div>
    <div style={{ position: "absolute", left: 40, bottom: 440 }}><Roki pose="think" size={250} delay={10} /></div>
  </AbsoluteFill>
);

const Lesson: React.FC<{ s: Extract<Scene, { kind: "lesson" }> }> = ({ s }) => (
  <AbsoluteFill style={{ paddingTop: 250 }}>
    <Splat size={980} color="rgba(94,69,200,.14)" seed={21} style={{ position: "absolute", left: 50, top: 180 }} />
    <div style={{ padding: "0 70px", position: "relative" }}>
      <div style={{ fontFamily: MARK, fontSize: 34, color: K.violet }}>WHAT I LEARNED</div>
      <div style={{ marginTop: 18 }}><Letter text={`“${s.text}”`} size={104} font={BRUSH} rotate={-3} step={2} lineHeight={1.05} /></div>
      <div style={{ fontFamily: SANS, fontSize: 36, color: K.ink2, marginTop: 30, fontWeight: 500 }}>{s.sub}</div>
    </div>
    <div style={{ position: "absolute", right: 50, bottom: 440 }}><Roki pose="idle" size={230} flip delay={10} /></div>
  </AbsoluteFill>
);

const Scoreboard: React.FC<{ s: Extract<Scene, { kind: "scoreboard" }> }> = ({ s }) => {
  const main = s.tiles[0], rest = s.tiles.slice(1);
  return (
    <AbsoluteFill style={{ paddingTop: 210 }}>
      <div style={{ padding: "0 60px" }}><Letter text={s.title} size={92} rotate={-2} /></div>
      <div style={{ position: "relative", height: 560, marginTop: 10 }}>
        <Halftone size={540} color={main.value >= 0 ? "rgba(30,138,87,.28)" : "rgba(210,59,59,.25)"} style={{ position: "absolute", left: 270, top: 10 }} />
        <div style={{ position: "absolute", left: 60, right: 60, top: 150, textAlign: "center" }}>
          <div style={{ fontFamily: BRUSH, fontSize: 56, color: K.ink }}>{main.label}</div>
          <div style={{ fontFamily: MARK, fontSize: 190, color: main.value >= 0 ? K.gain : K.loss, transform: "rotate(-3deg)", lineHeight: 1 }}><Count to={main.value} delay={6} /></div>
          <div style={{ fontFamily: SANS, fontSize: 30, color: K.ink2, fontWeight: 500 }}>{main.foot}</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 40 }}>
        {rest.map((t, i) => (
          <Sticker key={i} text="" color={[K.sky, K.amber][i % 2]} ink={i % 2 ? K.ink : "#fff"} size={310} rotate={[-6, 5][i % 2]} delay={14 + i * 6}
            style={{ flexDirection: "column", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 92, lineHeight: 1 }}>{t.value}<span style={{ fontSize: 44 }}>/{t.of}</span></span>
            <span style={{ fontSize: 30, lineHeight: 1.05, marginTop: 8 }}>{t.label.toUpperCase()}</span>
          </Sticker>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Close: React.FC<{ s: Extract<Scene, { kind: "close" }> }> = ({ s }) => (
  <AbsoluteFill style={{ alignItems: "center", paddingTop: 230 }}>
    <Splat size={640} color="rgba(242,169,59,.85)" seed={33} style={{ position: "absolute", top: 760 }} />
    <div style={{ padding: "0 70px", textAlign: "center" }}><Letter text={s.text} size={98} rotate={-2} step={2} lineHeight={1.06} /></div>
    <div style={{ fontFamily: BRUSH, fontSize: 58, color: K.ink2, marginTop: 20 }}>{s.sub}</div>
    <div style={{ position: "relative", marginTop: 40 }}><Roki pose="cheer" size={330} delay={6} /></div>
    <div style={{ marginTop: 10 }}><Sticker text="FOLLOW ROKI" color={K.violet} size={240} rotate={-8} delay={14} /></div>
  </AbsoluteFill>
);

// ------------------------------------------------------------------ captions, frame
const Captions: React.FC<{ lines: Line[] }> = ({ lines }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const t = f / fps;
  const ln = lines.find((l) => t >= l.start - 0.05 && t < l.end + 0.2);
  if (!ln) return null;
  const words = ln.cap.split(" "), total = ln.cap.length; let acc = 0;
  const prog = (t - ln.start) / Math.max(0.3, ln.end - ln.start);
  return (
    <div style={{ position: "absolute", left: 50, right: 50, bottom: 175, display: "flex", justifyContent: "center" }}>
      <div style={{ background: K.ink, borderRadius: 22, padding: "22px 30px", maxWidth: 980, textAlign: "center", fontFamily: SANS, fontSize: 44, lineHeight: 1.25, fontWeight: 650, letterSpacing: "-0.01em", boxShadow: `8px 8px 0 ${K.amber}` }}>
        {words.map((w, i) => { const at = acc / total; acc += w.length + 1; return <span key={i} style={{ color: at <= prog ? "#fff" : "rgba(255,255,255,.4)" }}>{w}{i < words.length - 1 ? " " : ""}</span>; })}
      </div>
    </div>
  );
};

const SceneWrap: React.FC<{ dur: number; first: boolean; children: React.ReactNode }> = ({ dur, first, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 4, dur - 4, dur], [first ? 1 : 0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: o }}>
      {children}
      {!first && <Sequence from={0} durationInFrames={16} layout="none"><Wipe /><Sfx at={0} name="whoosh" volume={0.3} /></Sequence>}
    </AbsoluteFill>
  );
};

export const RokiInk: React.FC<Props> = (props) => {
  setCcy(props.ccy);
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: K.paper }}>
      <Paper />
      <Audio src={staticFile(props.audio)} />
      {props.scenes.map((s, i) => {
        const from = Math.round(s.from * fps), dur = Math.max(1, Math.round((s.to - s.from) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <SceneWrap dur={dur} first={i === 0}>
              {s.kind === "hook" && <Hook s={s} />}{s.kind === "intro" && <Intro s={s} />}{s.kind === "chart" && <Chart s={s} />}
              {s.kind === "predictions" && <Predictions s={s} />}{s.kind === "trades" && <Trades s={s} />}{s.kind === "testing" && <Testing s={s} />}
              {s.kind === "next" && <Next s={s} />}{s.kind === "lesson" && <Lesson s={s} />}{s.kind === "scoreboard" && <Scoreboard s={s} />}{s.kind === "close" && <Close s={s} />}
            </SceneWrap>
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", top: 64, left: 56, right: 56, display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontFamily: BRUSH, fontSize: 64, color: K.ink, lineHeight: 1 }}>Roki</span>
        <span style={{ marginLeft: "auto", fontFamily: MARK, fontSize: 28, color: K.ink, background: K.white, border: `4px solid ${K.ink}`, borderRadius: 999, padding: "8px 22px", transform: "rotate(2deg)" }}>{props.label.toUpperCase()}</span>
      </div>
      <Captions lines={props.lines} />
      <div style={{ position: "absolute", bottom: 80, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontSize: 25, color: K.ink2, fontWeight: 500 }}>
        Paper trading with real prices · Not investment advice
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, height: 10, width: `${(f / (props.duration * fps)) * 100}%`, background: K.ink }} />
    </AbsoluteFill>
  );
};
