/**
 * CONFLUENCE ENGINE - SERVER
 *
 * Runs the brain on real market data every few minutes (or on a cron ping),
 * keeps its paper trades and calls, optionally mirrors active Indian trades to
 * Dhan, and serves the owner's dashboard. Every route except /api/health needs
 * the owner's Firebase login; /api/cron needs CRON_SECRET.
 */

import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { adminAuth, adminDb } from "./src/lib/firebase-admin";
import { runCycle, BrainState } from "./src/core/engineRunner";
import { openStore, Store, Meta } from "./src/services/stateStore";
import { writeBrief, CLAUDE_MODEL } from "./src/services/claudeAnalyst";
import { BrokerService } from "./src/services/brokerService";
import { mirrorLive } from "./src/core/liveExecutor";
import { RISK } from "./src/core/risk-manager";
import { STRATEGIES } from "./src/core/brain";
import { INSTRUMENTS } from "./src/core/instruments";
import { LedgerService } from "./src/services/ledgerService";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "chijobha@gmail.com").toLowerCase();
const ENV_LIVE = process.env.LIVE_TRADING_ENABLED === "true";
const RUN_EVERY_MIN = Number(process.env.RUN_EVERY_MIN || 5);

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: "100kb" }));

const broker = new BrokerService();
let storePromise: Promise<Store> | null = null;
const store = () => (storePromise ??= openStore(() => adminDb));

// ---------------------------------------------------------------- auth
async function requireOwner(req: Request, res: Response, next: NextFunction) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return res.status(401).json({ error: "Sign in required" });
  try {
    const tok = await adminAuth.verifyIdToken(m[1]);
    if (!tok.email_verified || (tok.email || "").toLowerCase() !== ADMIN_EMAIL) return res.status(403).json({ error: "Not allowed" });
    next();
  } catch {
    res.status(401).json({ error: "Session expired, sign in again" });
  }
}

function requireCron(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization === `Bearer ${secret}`) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ---------------------------------------------------------------- engine
let running: Promise<void> | null = null;
let lastError: string | null = null;
let ledgerHead: { hash: string; index: number } | null = null;

async function audit(st: Store, type: "TRADE" | "SYSTEM", data: unknown) {
  if (st.kind !== "firestore") return;
  try {
    if (!ledgerHead) {
      const snap = await adminDb.collection("ledger").orderBy("index", "desc").limit(1).get();
      ledgerHead = snap.empty ? { hash: "0", index: 0 } : { hash: snap.docs[0].data().hash, index: snap.docs[0].data().index + 1 };
    }
    const block = LedgerService.createBlock(data, type, ledgerHead.hash, ledgerHead.index);
    await adminDb.collection("ledger").add(block);
    ledgerHead = { hash: block.hash, index: block.index + 1 };
  } catch (e) {
    console.warn("[LEDGER]", e instanceof Error ? e.message : e);
  }
}

function briefDue(meta: Meta, now: number): boolean {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  const ist = new Date(now + 5.5 * 3600000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const inWindow = (mins >= 8 * 60 + 30 && mins < 9 * 60 + 10) || (mins >= 15 * 60 + 40 && mins < 17 * 60);
  const last = meta.brief?.at ? Date.parse(meta.brief.at) : 0;
  return inWindow && now - last > 3 * 3600000;
}

async function cycle(opts: { forceBrief?: boolean } = {}): Promise<void> {
  if (running) return running;
  running = (async () => {
    const st = await store();
    const loaded = await st.load();
    const { meta, ...state } = loaded;
    const now = Date.now();
    const changes = await runCycle(state as BrainState, now);
    const liveUpdates = await mirrorLive(changes.trades, state.trades, { envEnabled: ENV_LIVE, ownerEnabled: !!meta.liveEnabled, killSwitch: !!meta.killSwitch }, broker, now);
    for (const t of liveUpdates) {
      state.trades[t.id] = t;
      const i = changes.trades.findIndex((x) => x.id === t.id);
      if (i >= 0) changes.trades[i] = t; else changes.trades.push(t);
    }
    await st.save(state as BrainState, changes);
    for (const t of changes.trades) if (t.status === "open" || t.status === "closed") await audit(st, "TRADE", t);
    if (opts.forceBrief || briefDue(meta, now)) {
      try {
        const brief = await writeBrief(state as BrainState);
        if (brief) await st.saveMeta({ brief });
      } catch (e) {
        console.warn("[BRIEF]", e instanceof Error ? e.message : e);
      }
    }
    lastError = null;
  })()
    .catch((e) => { lastError = e instanceof Error ? e.message : String(e); console.error("[ENGINE]", e); })
    .finally(() => { running = null; });
  return running;
}

// ---------------------------------------------------------------- routes
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/state", requireOwner, async (_req, res) => {
  const st = await store();
  const { meta, ...state } = await st.load();
  const preds = Object.values(state.predictions).sort((a, b) => b.session.localeCompare(a.session) || a.instrument.localeCompare(b.instrument)).slice(0, 600);
  res.json({
    lastRun: state.lastRun, notes: state.notes, lastError, running: !!running,
    levels: state.levels, predictions: preds, trades: Object.values(state.trades),
    brief: meta.brief || null, killSwitch: !!meta.killSwitch, liveEnabled: !!meta.liveEnabled,
    envLive: ENV_LIVE, brokerConfigured: broker.isConfigured(), claudeConfigured: !!process.env.ANTHROPIC_API_KEY, claudeModel: CLAUDE_MODEL,
    store: st.kind, risk: RISK, strategies: STRATEGIES, instruments: INSTRUMENTS.map((i) => ({ name: i.name, market: i.market, live: !!i.dhan })),
  });
});

app.post("/api/run", requireOwner, async (_req, res) => { await cycle(); res.json({ ok: !lastError, error: lastError }); });

app.post("/api/brief", requireOwner, async (_req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: "ANTHROPIC_API_KEY is not set on the server" });
  await cycle({ forceBrief: true });
  res.json({ ok: !lastError, error: lastError });
});

app.post("/api/kill", requireOwner, async (req, res) => {
  const on = req.body?.on !== false;
  const st = await store();
  await st.saveMeta(on ? { killSwitch: true, liveEnabled: false } : { killSwitch: false });
  await audit(st, "SYSTEM", { event: on ? "kill switch on" : "kill switch off" });
  res.json({ killSwitch: on });
});

app.post("/api/live", requireOwner, async (req, res) => {
  const enabled = req.body?.enabled === true;
  if (enabled && !ENV_LIVE) return res.status(400).json({ error: "Live trading is disabled on the server (LIVE_TRADING_ENABLED is not true)" });
  if (enabled && !broker.isConfigured()) return res.status(400).json({ error: "Dhan keys are not set on the server" });
  const st = await store();
  const { meta } = await st.load();
  if (enabled && meta.killSwitch) return res.status(400).json({ error: "Turn the kill switch off first" });
  await st.saveMeta({ liveEnabled: enabled });
  await audit(st, "SYSTEM", { event: enabled ? "live on" : "live off" });
  res.json({ liveEnabled: enabled });
});

// Vercel Cron (or any scheduler) calls this with "Authorization: Bearer <CRON_SECRET>"
app.get("/api/cron", requireCron, async (_req, res) => { await cycle(); res.json({ ok: !lastError, error: lastError }); });

app.use("/api/*", (req, res) => res.status(404).json({ error: "API route not found", path: req.originalUrl }));

// ---------------------------------------------------------------- start
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), "dist");
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
  const port = Number(process.env.PORT || 3000);
  app.listen(port, "0.0.0.0", () => console.log(`Confluence Engine on http://localhost:${port} (store: lazy, live env: ${ENV_LIVE})`));
  // Always-on hosts: run the brain on a timer. (Serverless hosts use /api/cron instead.)
  setTimeout(() => cycle(), 5000);
  setInterval(() => cycle(), RUN_EVERY_MIN * 60000);
}

if (!process.env.VERCEL) start();

export default app;
