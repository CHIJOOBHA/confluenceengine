/**
 * ROKI DAILY - the video. 1080x1920, 30 fps, silk-cream brand.
 * Everything on screen comes from props built from the day's data package.
 */
import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { money, amountOf, setCcy } from "./money";
import { loadFont } from "@remotion/fonts";
import { WORD_D, WORD_VB } from "./wordmark";

loadFont({ family: "Fraunces", url: staticFile("fonts/fraunces.woff2"), weight: "100 900" });
loadFont({ family: "Geist", url: staticFile("fonts/geist.woff2"), weight: "100 900" });

export const C = {
  canvas: "#FAF6F0", surface: "#FFFDF9", sunken: "#F3ECE2", line: "#E9E0D3", ink: "#241C17", ink2: "#6E645B", ink3: "#9C9188",
  roki: "#5E45C8", rokiHi: "#7B66E0", rokiSoft: "#EFEAFB", sun: "#F2A93B", gain: "#2E7D57", gainSoft: "#E6F2EA", loss: "#C0433C", lossSoft: "#F8E6E2",
};
const SERIF = "Fraunces, Georgia, serif";
const SANS = "Geist, system-ui, sans-serif";
const soft = { fontVariationSettings: '"SOFT" 100, "WONK" 0' } as const;

// ------------------------------------------------------------------ types
export type Line = { cap: string; start: number; end: number };
type Tone = "gain" | "loss" | "brand" | "neutral";
export type Scene =
  | { kind: "hook"; from: number; to: number; text: string; accent?: string; tone?: Tone }
  | { kind: "intro"; from: number; to: number; chips: string[]; day: string }
  | { kind: "chart"; from: number; to: number; title: string; sub: string; bars: { t: number; open: number; high: number; low: number; close: number }[]; pdh: number; pdc: number; pdl: number;
      entry?: { t: number; price: number; side: 1 | -1 }; exit?: { t: number; price: number }; target?: number; notes: { at: number; text: string; tone: Tone }[] }
  | { kind: "predictions"; from: number; to: number; title: string; sub: string; rows: { name: string; text: string; ok: boolean }[] }
  | { kind: "trades"; from: number; to: number; title: string; cards: { name: string; sub: string; money?: number; inr?: number; badge: string; note: string }[]; total?: { label: string; money?: number; inr?: number } }
  | { kind: "testing"; from: number; to: number; title: string; rows: { q: string; done: number; need: number; finding: string }[] }
  | { kind: "next"; from: number; to: number; title: string; text: string; sub: string }
  | { kind: "lesson"; from: number; to: number; text: string; sub: string }
  | { kind: "scoreboard"; from: number; to: number; title: string; tiles: { label: string; value: number; kind: "money" | "inr" | "ratio"; of?: number; foot: string }[] }
  | { kind: "close"; from: number; to: number; text: string; sub: string };
export type Props = { label: string; audio: string; duration: number; lines: Line[]; scenes: Scene[]; day?: number; ccy?: "INR" | "USD" };

// ------------------------------------------------------------------ helpers
const Sfx: React.FC<{ at: number; name: "chime" | "thud" | "whoosh" | "pop"; volume?: number }> = ({ at, name, volume = 0.5 }) => (
  <Sequence from={Math.max(0, Math.round(at))} durationInFrames={30} layout="none"><Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} /></Sequence>
);
const inrTxt = (v: number, signed = true) => money(v, signed);
const toneColor = (t: Tone) => ({ gain: C.gain, loss: C.loss, brand: C.roki, neutral: C.ink })[t];
function useIn(delay = 0, damping = 18) {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, stiffness: 120, mass: 0.9 } });
}
const rise = (p: number, px = 40): React.CSSProperties => ({ opacity: p, transform: `translateY(${(1 - p) * px}px)` });

export const Mark: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 32 32" width={size} height={size}>
    <defs><linearGradient id="vshell" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stopColor={C.rokiHi} /><stop offset="1" stopColor={C.roki} /></linearGradient></defs>
    <path d="M13 10.5C12 7 10 4.5 7.5 3.2M19 10.5C20 7 22 4.5 24.5 3.2" fill="none" stroke={C.roki} strokeWidth="2" strokeLinecap="round" />
    <ellipse cx="16" cy="19.5" rx="10" ry="10.5" fill="url(#vshell)" />
    <ellipse cx="12.5" cy="14.5" rx="4" ry="2.2" fill="#fff" opacity="0.16" transform="rotate(-30 12.5 14.5)" />
    <polyline points="9.5,23.5 13.5,19.5 16.5,21.5 21.5,15" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="21.8" cy="14.7" r="2.1" fill={C.sun} />
  </svg>
);
const Word: React.FC<{ h: number; color?: string }> = ({ h, color = C.ink }) => {
  const [, , w, hh] = WORD_VB.split(" ").map(Number);
  return <svg viewBox={WORD_VB} height={h} width={(h * w) / hh} fill={color}><path d={WORD_D} /></svg>;
};

const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: `linear-gradient(180deg, #FFFEFC, ${C.surface})`, border: `2px solid ${C.line}`, borderRadius: 36,
    boxShadow: "0 2px 4px rgba(84,56,28,.04), 0 30px 60px -30px rgba(84,56,28,.22)", ...style }}>{children}</div>
);
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.ink2 }) => (
  <div style={{ fontFamily: SANS, fontSize: 34, color, fontWeight: 500, letterSpacing: "-0.01em" }}>{children}</div>
);
const Title: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 76 }) => (
  <div style={{ fontFamily: SERIF, ...soft, fontWeight: 500, fontSize: size, lineHeight: 1.08, letterSpacing: "-0.025em", color: C.ink }}>{children}</div>
);

// ------------------------------------------------------------------ scenes
const Hook: React.FC<{ s: Extract<Scene, { kind: "hook" }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const words = s.text.split(" ");
  const accentWords = new Set((s.accent ?? "").split(" ").filter(Boolean));
  const accentStart = s.accent ? s.text.indexOf(s.accent) : -1;
  let pos = 0;
  const step = Math.max(2, Math.min(5, Math.round(((s.to - s.from) * fps * 0.5) / words.length)));
  return (
    <div style={{ padding: "0 80px" }}>
      <div style={{ fontFamily: SERIF, ...soft, fontWeight: 500, fontSize: words.length > 12 ? 92 : 106, lineHeight: 1.06, letterSpacing: "-0.03em", color: C.ink }}>
        {words.map((w, i) => {
          const here = pos; pos += w.length + 1;
          const isAccent = accentStart >= 0 && here >= accentStart && accentWords.has(w);
          const p = spring({ frame: f - i * step, fps, config: { damping: 16, stiffness: 140 } });
          return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 30}px)`, color: isAccent ? toneColor(s.tone ?? "brand") : C.ink }}>{w}</span>;
        })}
      </div>
    </div>
  );
};

const Intro: React.FC<{ s: Extract<Scene, { kind: "intro" }> }> = ({ s }) => {
  const p = useIn(0, 14), q = useIn(10), r = useIn(20);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 44 }}>
      <div style={{ transform: `scale(${0.6 + p * 0.4}) rotate(${(1 - p) * -12}deg)`, opacity: p }}><Mark size={300} /></div>
      <div style={rise(q)}><Word h={130} /></div>
      <div style={{ ...rise(q), fontFamily: SANS, fontSize: 46, color: C.ink2 }}>An AI learning to trade, in public</div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18, maxWidth: 900, ...rise(r) }}>
        {s.chips.map((c) => <span key={c} style={{ fontFamily: SANS, fontSize: 34, fontWeight: 500, padding: "14px 28px", borderRadius: 999, background: C.surface, border: `2px solid ${C.line}`, color: C.ink }}>{c}</span>)}
        <span style={{ fontFamily: SANS, fontSize: 34, fontWeight: 600, padding: "14px 28px", borderRadius: 999, background: C.rokiSoft, color: C.roki }}>{s.day}</span>
      </div>
    </div>
  );
};

const Chart: React.FC<{ s: Extract<Scene, { kind: "chart" }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const len = (s.to - s.from) * fps;
  const reveal = interpolate(f, [8, len * 0.72], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const head = useIn(0);
  const W = 900, H = 720, padL = 10, padR = 215, padT = 30, padB = 30;
  const lo = Math.min(...s.bars.map((b) => b.low), s.pdl, s.pdc), hi = Math.max(...s.bars.map((b) => b.high), s.pdh, s.pdc);
  const span = hi - lo || 1, y = (v: number) => padT + (1 - (v - lo) / span) * (H - padT - padB);
  const n = s.bars.length, cw = (W - padL - padR) / n, x = (i: number) => padL + i * cw + cw / 2;
  const shown = Math.floor(reveal * n);
  const idxOf = (t: number) => s.bars.findIndex((b) => b.t >= t);
  const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: v < 1000 ? 2 : 0 });
  const level = (v: number, label: string, color: string, dash: string) => (
    <g>
      <line x1={padL} x2={W - padR + 16} y1={y(v)} y2={y(v)} stroke={color} strokeWidth={3} strokeDasharray={dash} opacity={0.9} />
      <text x={W - padR + 24} y={y(v) + (label === "Low" ? 30 : label === "High" ? -6 : 10)} fontFamily={SANS} fontSize={28} fill={color} fontWeight={600}>{label} <tspan fill={C.ink3} fontWeight={400} fontSize={24}>{fmt(v)}</tspan></text>
    </g>
  );
  const ei = s.entry ? idxOf(s.entry.t) : -1, xi = s.exit ? idxOf(s.exit.t) : -1;
  return (
    <div style={{ padding: "0 70px" }}>
      <div style={rise(head)}><Eyebrow>{s.sub}</Eyebrow><Title size={72}>{s.title}</Title></div>
      <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 28, color: C.ink3 }}>Dashed lines: yesterday's high, close and low</div>
      <Card style={{ marginTop: 26, padding: "26px 20px" }}>
        <svg width={W} height={H}>
          {level(s.pdh, "High", C.ink3, "8 10")}
          {level(s.pdc, "Close", C.roki, "14 8")}
          {level(s.pdl, "Low", C.ink3, "8 10")}
          {s.bars.slice(0, shown).map((b, i) => {
            const up = b.close >= b.open, col = up ? C.gain : C.loss;
            return (
              <g key={b.t}>
                <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={col} strokeWidth={Math.max(1.5, cw * 0.18)} opacity={0.75} />
                <rect x={x(i) - cw * 0.34} width={cw * 0.68} y={y(Math.max(b.open, b.close))} height={Math.max(2, Math.abs(y(b.open) - y(b.close)))} fill={col} rx={1.5} opacity={0.85} />
              </g>
            );
          })}
          {s.entry && ei >= 0 && ei < shown && (
            <g><circle cx={x(ei)} cy={y(s.entry.price)} r={16} fill={C.roki} stroke="#fff" strokeWidth={5} />
              <text x={x(ei) + 26} y={y(s.entry.price) + (s.entry.side === 1 ? 46 : -26)} fontFamily={SANS} fontSize={30} fontWeight={600} fill={C.roki} stroke="#FFFDF9" strokeWidth={10} paintOrder="stroke" strokeLinejoin="round">{s.entry.side === 1 ? "Bought" : "Sold"} {fmt(s.entry.price)}</text></g>
          )}
          {s.exit && xi >= 0 && xi < shown && (
            <g><circle cx={x(xi)} cy={y(s.exit.price)} r={16} fill={C.sun} stroke="#fff" strokeWidth={5} />
              <text x={Math.min(x(xi) + 26, W - padR - 220)} y={y(s.exit.price) + (s.entry?.side === 1 ? -26 : 50)} fontFamily={SANS} fontSize={30} fontWeight={600} fill={C.ink} stroke="#FFFDF9" strokeWidth={10} paintOrder="stroke" strokeLinejoin="round">Closed {fmt(s.exit.price)}</text></g>
          )}
        </svg>
      </Card>
      <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 16 }}>
        {s.notes.map((nt, i) => {
          const at = nt.at * len; const p = spring({ frame: f - at, fps, config: { damping: 18 } });
          return f >= at ? <div key={i} style={{ ...rise(p, 24), fontFamily: SANS, fontSize: 40, lineHeight: 1.25, color: toneColor(nt.tone), fontWeight: 500 }}>{nt.text}</div> : null;
        })}
      </div>
    </div>
  );
};

const Predictions: React.FC<{ s: Extract<Scene, { kind: "predictions" }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const len = (s.to - s.from) * fps;
  const head = useIn(0);
  return (
    <div style={{ padding: "0 70px" }}>
      <div style={rise(head)}><Eyebrow>{s.sub}</Eyebrow><Title>{s.title}</Title></div>
      <Card style={{ marginTop: 40, padding: "10px 0" }}>
        {s.rows.map((r, i) => {
          const at = 10 + (i * (len * 0.75)) / s.rows.length; const p = spring({ frame: f - at, fps, config: { damping: 18 } });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 28, padding: "26px 36px", borderTop: i ? `2px solid ${C.line}` : "none", ...rise(p, 20) }}>
              <Sfx at={at + 4} name={r.ok ? "chime" : "thud"} volume={r.ok ? 0.28 : 0.45} />
              <div style={{ width: 70, height: 70, borderRadius: 999, flex: "none", display: "grid", placeItems: "center", fontSize: 40, fontWeight: 700, fontFamily: SANS,
                background: r.ok ? C.gainSoft : C.lossSoft, color: r.ok ? C.gain : C.loss, transform: `scale(${p})` }}>{r.ok ? "✓" : "✕"}</div>
              <div style={{ fontFamily: SANS }}>
                <div style={{ fontSize: 40, fontWeight: 600, color: C.ink }}>{r.name}</div>
                <div style={{ fontSize: 34, color: C.ink2, lineHeight: 1.25 }}>{r.text}</div>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

const Count: React.FC<{ to: number; delay: number; kind?: "inr" | "plain" }> = ({ to, delay, kind = "inr" }) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [delay, delay + 24], [0, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <>{kind === "inr" ? inrTxt(v) : Math.round(v)}</>;
};

const Trades: React.FC<{ s: Extract<Scene, { kind: "trades" }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const len = (s.to - s.from) * fps;
  const head = useIn(0);
  return (
    <div style={{ padding: "0 70px" }}>
      <div style={rise(head)}><Title>{s.title}</Title></div>
      <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 28 }}>
        {s.cards.map((c, i) => {
          const at = 8 + (i * len * 0.55) / Math.max(1, s.cards.length); const p = spring({ frame: f - at, fps, config: { damping: 18 } });
          return (
            <Card key={i} style={{ padding: "34px 40px", ...rise(p, 40) }}>
              <Sfx at={at} name="pop" volume={0.4} />
              <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
                <span style={{ fontFamily: SANS, fontSize: 46, fontWeight: 650, color: C.ink, whiteSpace: "nowrap" }}>{c.name}</span>
                <span style={{ marginLeft: "auto", whiteSpace: "nowrap", fontFamily: SANS, fontSize: 56, fontWeight: 650, letterSpacing: "-0.02em", color: amountOf(c) >= 0 ? C.gain : C.loss, fontVariantNumeric: "tabular-nums" }}>
                  <Count to={amountOf(c)} delay={at + 6} /></span>
              </div>
              <div style={{ marginTop: 4, fontFamily: SANS, fontSize: 32, color: C.ink2 }}>{c.sub}</div>
              <div style={{ marginTop: 14, display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ fontFamily: SANS, fontSize: 28, fontWeight: 600, padding: "8px 20px", borderRadius: 999, background: amountOf(c) >= 0 ? C.gainSoft : C.lossSoft, color: amountOf(c) >= 0 ? C.gain : C.loss }}>{c.badge}</span>
              </div>
              <div style={{ marginTop: 16, fontFamily: SANS, fontSize: 34, lineHeight: 1.3, color: C.ink2 }}>{c.note}</div>
            </Card>
          );
        })}
        {s.total && (() => {
          const at = len * 0.62; const p = spring({ frame: f - at, fps, config: { damping: 18 } });
          return f >= at ? (
            <div style={{ ...rise(p, 24), display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 12px", fontFamily: SANS }}>
              <span style={{ fontSize: 40, color: C.ink2 }}>{s.total.label}</span>
              <span style={{ fontSize: 64, fontWeight: 700, color: amountOf(s.total) >= 0 ? C.gain : C.loss, fontVariantNumeric: "tabular-nums" }}><Count to={amountOf(s.total)} delay={at} /></span>
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
};

const Testing: React.FC<{ s: Extract<Scene, { kind: "testing" }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const len = (s.to - s.from) * fps;
  const head = useIn(0);
  return (
    <div style={{ padding: "0 70px" }}>
      <div style={rise(head)}><Eyebrow color={C.roki}>Research in progress</Eyebrow><Title>{s.title}</Title></div>
      <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 28 }}>
        {s.rows.map((r, i) => {
          const at = 6 + (i * len * 0.5) / s.rows.length; const p = spring({ frame: f - at, fps, config: { damping: 18 } });
          const fill = interpolate(f, [at + 8, at + 40], [0, r.done / r.need], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
          return (
            <Card key={i} style={{ padding: "34px 40px", ...rise(p, 40) }}>
              <Sfx at={at} name="pop" volume={0.35} />
              <div style={{ fontFamily: SANS, fontSize: 40, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{r.q}</div>
              <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{ flex: 1, height: 18, borderRadius: 999, background: C.sunken, overflow: "hidden" }}>
                  <div style={{ width: `${fill * 100}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${C.rokiHi}, ${C.roki})` }} />
                </div>
                <span style={{ fontFamily: SANS, fontSize: 36, fontWeight: 600, color: C.roki, fontVariantNumeric: "tabular-nums" }}>{r.done} of {r.need}</span>
              </div>
              <div style={{ marginTop: 18, fontFamily: SANS, fontSize: 34, lineHeight: 1.3, color: C.ink2 }}>{r.finding}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const Next: React.FC<{ s: Extract<Scene, { kind: "next" }> }> = ({ s }) => {
  const p = useIn(0), q = useIn(10);
  return (
    <div style={{ padding: "0 70px" }}>
      <div style={rise(p)}><Eyebrow color={C.roki}>{s.title}</Eyebrow></div>
      <Card style={{ marginTop: 34, padding: "56px 54px", ...rise(q, 50) }}>
        <div style={{ fontFamily: SERIF, ...soft, fontWeight: 500, fontSize: 72, lineHeight: 1.12, letterSpacing: "-0.025em", color: C.ink }}>{s.text}</div>
        <div style={{ marginTop: 30, fontFamily: SANS, fontSize: 36, lineHeight: 1.35, color: C.ink2 }}>{s.sub}</div>
      </Card>
    </div>
  );
};

const Lesson: React.FC<{ s: Extract<Scene, { kind: "lesson" }> }> = ({ s }) => {
  const p = useIn(0), q = useIn(12);
  return (
    <div style={{ padding: "0 80px" }}>
      <div style={rise(p)}><Eyebrow color={C.roki}>What I learned</Eyebrow></div>
      <div style={{ marginTop: 26, fontFamily: SERIF, ...soft, fontWeight: 400, fontStyle: "normal", fontSize: 80, lineHeight: 1.14, letterSpacing: "-0.025em", color: C.ink, ...rise(q, 40) }}>
        <span style={{ color: C.sun }}>“</span>{s.text}<span style={{ color: C.sun }}>”</span>
      </div>
      <div style={{ marginTop: 34, fontFamily: SANS, fontSize: 36, color: C.ink2, lineHeight: 1.35, ...rise(q, 20) }}>{s.sub}</div>
    </div>
  );
};

const Scoreboard: React.FC<{ s: Extract<Scene, { kind: "scoreboard" }> }> = ({ s }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const head = useIn(0);
  return (
    <div style={{ padding: "0 70px" }}>
      <div style={rise(head)}><Title>{s.title}</Title></div>
      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 }}>
        {s.tiles.map((t, i) => {
          const at = 6 + i * 8; const p = spring({ frame: f - at, fps, config: { damping: 18 } });
          const color = t.kind !== "ratio" ? (t.value >= 0 ? C.gain : C.loss) : C.ink;
          return (
            <Card key={i} style={{ padding: "36px 36px", ...rise(p, 40), gridColumn: i === 0 ? "1 / span 2" : undefined }}>
              <div style={{ fontFamily: SANS, fontSize: 34, color: C.ink2 }}>{t.label}</div>
              <div style={{ marginTop: 10, fontFamily: SANS, fontSize: i === 0 ? 104 : 80, fontWeight: 650, letterSpacing: "-0.03em", color, fontVariantNumeric: "tabular-nums" }}>
                {t.kind !== "ratio" ? <Count to={t.value} delay={at} /> : <><Count to={t.value} delay={at} kind="plain" /><span style={{ color: C.ink3, fontSize: "0.6em" }}> of {t.of}</span></>}
              </div>
              <div style={{ marginTop: 6, fontFamily: SANS, fontSize: 30, color: C.ink3 }}>{t.foot}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const Close: React.FC<{ s: Extract<Scene, { kind: "close" }> }> = ({ s }) => {
  const p = useIn(0, 14), q = useIn(10);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 90px", gap: 40 }}>
      <div style={{ transform: `scale(${0.7 + 0.3 * p})`, opacity: p }}><Mark size={220} /></div>
      <div style={{ fontFamily: SERIF, ...soft, fontWeight: 500, fontSize: 84, lineHeight: 1.1, letterSpacing: "-0.03em", color: C.ink, ...rise(q) }}>{s.text}</div>
      <div style={{ fontFamily: SANS, fontSize: 40, color: C.ink2, ...rise(q) }}>{s.sub}</div>
      <div style={{ ...rise(q), marginTop: 10, fontFamily: SANS, fontSize: 40, fontWeight: 600, color: "#fff", padding: "24px 56px", borderRadius: 999,
        background: `linear-gradient(180deg, ${C.rokiHi}, ${C.roki})`, boxShadow: "0 20px 40px -18px rgba(60,30,120,.6)" }}>Follow Roki</div>
    </div>
  );
};

// ------------------------------------------------------------------ captions
const Captions: React.FC<{ lines: Line[] }> = ({ lines }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const t = f / fps;
  const ln = lines.find((l) => t >= l.start - 0.05 && t < l.end + 0.25);
  if (!ln) return null;
  const words = ln.cap.split(" ");
  const total = ln.cap.length; let acc = 0;
  const prog = (t - ln.start) / Math.max(0.3, ln.end - ln.start);
  const p = interpolate(t, [ln.start - 0.05, ln.start + 0.15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 70, right: 70, bottom: 190, display: "flex", justifyContent: "center", opacity: p }}>
      <div style={{ background: "rgba(255,253,249,.92)", border: `2px solid ${C.line}`, borderRadius: 32, padding: "26px 36px", maxWidth: 940,
        boxShadow: "0 24px 50px -28px rgba(84,56,28,.35)", fontFamily: SANS, fontSize: 46, lineHeight: 1.28, fontWeight: 560, letterSpacing: "-0.01em", textAlign: "center" }}>
        {words.map((w, i) => {
          const at = acc / total; acc += w.length + 1;
          return <span key={i} style={{ color: at <= prog ? C.ink : C.ink3, transition: "none" }}>{w}{i < words.length - 1 ? " " : ""}</span>;
        })}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ root
export const RokiDaily: React.FC<Props> = (props) => {
  setCcy(props.ccy);
  const { fps } = useVideoConfig(); const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.canvas, fontFamily: SANS }}>
      <AbsoluteFill style={{ background: `radial-gradient(1100px 900px at 10% -5%, #FFFDF8, transparent 60%), radial-gradient(1000px 800px at 105% 105%, ${C.sunken}, transparent 60%)` }} />
      <Audio src={staticFile(props.audio)} />
      <div style={{ position: "absolute", top: 70, left: 70, right: 70, display: "flex", alignItems: "center", gap: 18 }}>
        <Mark size={64} /><Word h={40} />
        <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 30, fontWeight: 500, color: C.ink2, padding: "12px 24px", borderRadius: 999, background: "rgba(255,253,249,.8)", border: `2px solid ${C.line}` }}>{props.label}</span>
      </div>
      {props.scenes.map((s, i) => {
        const from = Math.round(s.from * fps), dur = Math.max(1, Math.round((s.to - s.from) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <SceneWrap dur={dur} first={i === 0}>
              <div style={{ position: "absolute", top: 230, left: 0, right: 0, bottom: 470, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                {s.kind === "hook" && <Hook s={s} />}{s.kind === "intro" && <Intro s={s} />}{s.kind === "chart" && <Chart s={s} />}
                {s.kind === "predictions" && <Predictions s={s} />}{s.kind === "trades" && <Trades s={s} />}{s.kind === "testing" && <Testing s={s} />}
                {s.kind === "next" && <Next s={s} />}{s.kind === "lesson" && <Lesson s={s} />}{s.kind === "scoreboard" && <Scoreboard s={s} />}{s.kind === "close" && <Close s={s} />}
              </div>
            </SceneWrap>
          </Sequence>
        );
      })}
      <Captions lines={props.lines} />
      <div style={{ position: "absolute", bottom: 80, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontSize: 26, color: C.ink3 }}>
        Paper trading with real prices · Not investment advice
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, height: 8, width: `${(f / (props.duration * fps)) * 100}%`, background: `linear-gradient(90deg, ${C.roki}, ${C.sun})` }} />
    </AbsoluteFill>
  );
};

const SceneWrap: React.FC<{ dur: number; first: boolean; children: React.ReactNode }> = ({ dur, first, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 7, dur - 7, dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const z = interpolate(f, [0, dur], [1, 1.025]);
  const x = interpolate(f, [0, 9], [36, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ opacity: o, transform: `translateX(${first ? 0 : x}px) scale(${z})` }}>
      {!first && <Sfx at={0} name="whoosh" volume={0.22} />}
      {children}
    </AbsoluteFill>
  );
};
