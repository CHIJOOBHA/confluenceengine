/**
 * CONFLUENCE ENGINE - BRAIN STORAGE
 *
 * Keeps the brain's trades, calls and levels between cycles. Uses Firestore
 * (server-side Admin SDK) when it is reachable, otherwise a local JSON file,
 * so the engine also runs on a laptop or a plain server.
 */

import fs from "fs";
import path from "path";
import { BrainState, CycleChanges, emptyState, Prediction, LevelRow } from "../core/engineRunner.js";
import { PaperTrade } from "../core/brain.js";
import type { SimAccount } from "../sim/paperBroker.js";

export interface Meta {
  levels: LevelRow[];
  lastRun: string | null;
  notes: string[];
  brief?: { text: string; at: string; model: string } | null;
  killSwitch?: boolean;
  liveEnabled?: boolean;
}

export interface Store {
  kind: "firestore" | "file";
  load(): Promise<BrainState & { meta: Meta }>;
  save(state: BrainState, changes: CycleChanges): Promise<void>;
  saveMeta(patch: Partial<Meta>): Promise<void>;
  loadSim(): Promise<SimAccount | null>;
  saveSim(acct: SimAccount): Promise<void>;
}

const safeId = (s: string) => s.replace(/[\/#\[\]\.]/g, "_");

export function firestoreStore(db: FirebaseFirestore.Firestore): Store {
  const metaRef = db.collection("brain").doc("meta");
  return {
    kind: "firestore",
    async load() {
      const [metaSnap, tradeSnap, predSnap] = await Promise.all([
        metaRef.get(),
        db.collection("brain_trades").get(),
        db.collection("brain_predictions").orderBy("session", "desc").limit(3000).get(),
      ]);
      const meta = (metaSnap.data() as Meta) || { levels: [], lastRun: null, notes: [] };
      const trades: Record<string, PaperTrade> = {};
      tradeSnap.forEach((d) => { const t = d.data() as PaperTrade; trades[t.id] = t; });
      const predictions: Record<string, Prediction> = {};
      predSnap.forEach((d) => { const p = d.data() as Prediction; predictions[p.key] = p; });
      return { trades, predictions, levels: meta.levels || [], lastRun: meta.lastRun || null, notes: meta.notes || [], meta };
    },
    async save(state, changes) {
      const writes: Promise<unknown>[] = [];
      // Firestore batches hold at most 500 writes
      const items: [string, string, object][] = [
        ...changes.trades.map((t) => ["brain_trades", safeId(t.id), t] as [string, string, object]),
        ...changes.predictions.map((p) => ["brain_predictions", safeId(p.key), p] as [string, string, object]),
      ];
      for (let i = 0; i < items.length; i += 400) {
        const batch = db.batch();
        for (const [col, id, data] of items.slice(i, i + 400)) batch.set(db.collection(col).doc(id), JSON.parse(JSON.stringify(data)));
        writes.push(batch.commit());
      }
      writes.push(metaRef.set({ levels: state.levels, lastRun: state.lastRun, notes: state.notes }, { merge: true }));
      await Promise.all(writes);
    },
    async saveMeta(patch) {
      await metaRef.set(JSON.parse(JSON.stringify(patch)), { merge: true });
    },
    async loadSim() {
      const d = await db.collection("brain").doc("sim").get();
      return d.exists ? (d.data() as SimAccount) : null;
    },
    async saveSim(acct) {
      await db.collection("brain").doc("sim").set(JSON.parse(JSON.stringify(acct)));
    },
  };
}

export function fileStore(file = process.env.VERCEL ? "/tmp/brain-state.json" : path.join(process.cwd(), "data", "brain-state.json")): Store {
  const read = (): BrainState & { meta: Meta } => {
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8"));
      return { ...emptyState(), ...j, meta: j.meta || { levels: [], lastRun: null, notes: [] } };
    } catch {
      return { ...emptyState(), meta: { levels: [], lastRun: null, notes: [] } };
    }
  };
  const write = (j: unknown) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify(j));
    fs.renameSync(file + ".tmp", file);
  };
  return {
    kind: "file",
    async load() { return read(); },
    async save(state) {
      const cur = read();
      write({ trades: state.trades, predictions: state.predictions, levels: state.levels, lastRun: state.lastRun, notes: state.notes,
        meta: { ...cur.meta, levels: state.levels, lastRun: state.lastRun, notes: state.notes } });
    },
    async saveMeta(patch) {
      const cur = read();
      write({ ...cur, meta: { ...cur.meta, ...patch } });
    },
    async loadSim() {
      try { return JSON.parse(fs.readFileSync(file.replace(/\.json$/, "-sim.json"), "utf8")) as SimAccount; } catch { return null; }
    },
    async saveSim(acct) {
      const f = file.replace(/\.json$/, "-sim.json");
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f + ".tmp", JSON.stringify(acct));
      fs.renameSync(f + ".tmp", f);
    },
  };
}

/** Firestore if the server can reach it, otherwise a local file. */
export async function openStore(getDb: () => FirebaseFirestore.Firestore): Promise<Store> {
  if (process.env.BRAIN_STORE === "file") return fileStore();
  try {
    const db = getDb();
    await db.collection("brain").doc("meta").get();
    return firestoreStore(db);
  } catch (e) {
    console.warn("[STORE] Firestore not reachable, using local file store:", e instanceof Error ? e.message : e);
    return fileStore();
  }
}
