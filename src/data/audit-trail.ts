/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

import crypto from 'crypto';

export interface AuditBlock {
  timestamp: string;
  data: any;
  previousHash: string;
  hash: string;
}

/**
 * Generates a SHA-256 hash for a data block, linking it to the previous block.
 */
export function generateHash(data: any, previousHash: string): string {
  const content = JSON.stringify(data) + previousHash;
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Packages a report into a tamper-proof block.
 */
export function createAuditBlock(data: any, previousHash: string = '0'): AuditBlock {
  const timestamp = new Date().toISOString();
  const hash = generateHash(data, previousHash);
  
  return {
    timestamp,
    data,
    previousHash,
    hash,
  };
}
