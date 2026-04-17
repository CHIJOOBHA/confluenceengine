/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import { collection, addDoc, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import CryptoJS from 'crypto-js';
import { Lesson } from "../types";
import { handleFirestoreError, OperationType } from "../lib/firestoreUtils";

/**
 * Memory Service
 * Manages the "Proof of Learning" cognitive chain for agents.
 */
export const MemoryService = {
  /**
   * Generates a SHA-256 hash for a lesson block.
   */
  calculateHash(lesson: Omit<Lesson, "hash">): string {
    const payload = `${lesson.index}${lesson.timestamp}${lesson.tradeId}${lesson.outcome}${lesson.reasonForLoss}${lesson.agentCorrection}${lesson.previousHash}`;
    return CryptoJS.SHA256(payload).toString();
  },

  /**
   * Records a new lesson block in the chain.
   */
  async recordLesson(
    lessonData: Omit<Lesson, "timestamp" | "hash" | "previousHash" | "index">, 
    previousHash: string, 
    index: number
  ) {
    const timestamp = new Date().toISOString();
    const partialLesson = {
      ...lessonData,
      timestamp,
      previousHash,
      index
    };
    
    const hash = this.calculateHash(partialLesson);
    const completeLesson: Lesson = { ...partialLesson, hash };

    try {
      const docRef = await addDoc(collection(db, "lessons"), completeLesson);
      console.log(`[MEMORY] Proof of Learning Block ${index} persisted: ${hash.substring(0, 10)}...`);
      return completeLesson;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "lessons");
      return null;
    }
  },

  /**
   * Fetches the latest N lessons to provide context for AI agents.
   */
  async getLatestLessons(count: number = 5): Promise<Lesson[]> {
    try {
      const q = query(collection(db, "lessons"), orderBy("index", "desc"), limit(count));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as Lesson);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, "lessons");
      return [];
    }
  }
};
