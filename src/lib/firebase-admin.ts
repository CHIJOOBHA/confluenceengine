/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Robust initialization for both local and Vercel environments
const projectId = process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const databaseId = process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: projectId,
  });
}

export const adminDb = getFirestore(admin.app(), databaseId);
export const adminAuth = admin.auth();
