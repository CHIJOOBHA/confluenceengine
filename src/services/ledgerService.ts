/**
 * ROKI - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Roki.
 * All rights reserved.
 */

import CryptoJS from 'crypto-js';

export interface AuditBlock {
  index: number;
  timestamp: string;
  type: 'SYSTEM' | 'AGENT' | 'MARKET' | 'TRADE';
  data: any;
  previousHash: string;
  hash: string;
}

export class LedgerService {
  /**
   * Generates a SHA-256 hash for a block.
   */
  public static calculateHash(index: number, timestamp: string, type: string, data: any, previousHash: string): string {
    const payload = `${index}${timestamp}${type}${JSON.stringify(data)}${previousHash}`;
    return CryptoJS.SHA256(payload).toString();
  }

  /**
   * Creates a new block in the chain.
   */
  public static createBlock(data: any, type: AuditBlock['type'], previousHash: string, index: number): AuditBlock {
    const timestamp = new Date().toISOString();
    const hash = this.calculateHash(index, timestamp, type, data, previousHash);
    
    return {
      index,
      timestamp,
      type,
      data,
      previousHash,
      hash
    };
  }

  /**
   * Validates the integrity of a block.
   */
  public static isValidBlock(block: AuditBlock, previousBlock?: AuditBlock): boolean {
    if (previousBlock && block.previousHash !== previousBlock.hash) return false;
    if (block.hash !== this.calculateHash(block.index, block.timestamp, block.type, block.data, block.previousHash)) return false;
    return true;
  }
}
