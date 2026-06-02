/**
 * AIGENT SDK — TypeScript types
 */

import type { Tier, Task, DurationDays } from "./constants.js";

// ── Player ──
export interface Player {
  tier: Tier;
  totalClaimed: bigint;
  points: bigint;
  lastClaimTime: bigint;
  referrer: string;
  referralCount: bigint;
}

// ── Stake ──
export interface StakeInfo {
  amount: bigint;
  startTime: bigint;
  duration: bigint; // seconds
  active: boolean;
}

// ── Airdrop Status ──
export interface AirdropStatus {
  todayClaimed: bigint;
  dailyCap: bigint;
  totalAllocated: bigint;
  remainingToday: bigint;
  remainingPercent: number;
}

// ── Task Status ──
export interface TaskStatus {
  taskId: Task;
  completed: boolean;
  points: bigint;
}

// ── Staking Config ──
export interface StakeConfig {
  durationDays: DurationDays;
  points: number;
  bonusPercent: number;
}

// ── SDK Config ──
export interface AigentSDKConfig {
  /** Wallet client (required for writes) */
  walletClient?: import("viem").WalletClient;
  /** Public client (required for reads) */
  publicClient: import("viem").PublicClient;
  /** User address */
  account?: import("viem").Account;
  /** Loyalty contract address override */
  loyaltyAddress?: string;
  /** AIGENT token address override */
  tokenAddress?: string;
}
