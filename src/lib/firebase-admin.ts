/**
 * CONFLUENCE ENGINE - FIREBASE ADMIN (server only)
 *
 * Login checks need only the project id. Firestore (where the brain keeps its
 * trades) also needs a service account: put the whole JSON key in the
 * FIREBASE_SERVICE_ACCOUNT environment variable on Vercel.
 */

import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

let fileCfg: { projectId?: string; firestoreDatabaseId?: string } = {};
try {
  fileCfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));
} catch {
  /* optional */
}

const projectId = process.env.VITE_FIREBASE_PROJECT_ID || fileCfg.projectId;
const databaseId = process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || fileCfg.firestoreDatabaseId;

let keyProject = "none";
if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  let sa: { project_id?: string } | null = null;
  try { sa = raw ? JSON.parse(raw) : null; } catch { keyProject = "unreadable (not valid JSON)"; }
  if (sa) keyProject = sa.project_id || "unknown";
  admin.initializeApp(sa ? { credential: admin.credential.cert(sa as admin.ServiceAccount), projectId } : { projectId });
}
/** Non-secret facts for the log: which project the key is for vs which project the app uses. */
export const firebaseInfo = { appProject: projectId, keyProject, database: databaseId || "(default)" };

export const adminDb = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore(admin.app());
export const adminAuth = admin.auth();
