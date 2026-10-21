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

if (!admin.apps.length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  admin.initializeApp(sa ? { credential: admin.credential.cert(JSON.parse(sa)), projectId } : { projectId });
}

export const adminDb = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore(admin.app());
export const adminAuth = admin.auth();
