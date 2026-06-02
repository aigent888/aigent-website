/**
 * AIGENT SDK — Contract addresses, ABIs, and configuration
 */

import type { Abi } from "viem";

// ── Network ──
export const CHAIN_ID = 196;
export const CHAIN_NAME = "X Layer";

// ── Contract Addresses ──
export const AIGENT_TOKEN = "0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39";
export const LOYALTY_AIRDROP = "0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822";
export const TIMELOCK = "0xb3d85a7571f1302f4ccc8842e6c8a672ad2799f6";

// ── Token ──
export const AIGENT_DECIMALS = 18;
export const AIGENT_SYMBOL = "$AIGENT";
export const TOTAL_SUPPLY = 500_000_000;

// ── Airdrop ──
export const DAILY_CAP = 1_000_000; // AIGENT per day
export const MAX_ALLOCATION = 400_000_000; // Total airdrop pool
export const MIN_STAKE_AMOUNT = 1_000; // Minimum AIGENT to stake
export const CHECKIN_REWARD = 100; // AIGENT per daily check-in

// ── Tiers ──
export enum Tier {
  None = 0,
  L1_Basic = 1,
  L2_Staker = 2,
  L3_Creator = 3,
  L4_Referrer = 4,
  L5_Ambassador = 5,
}

export const TIER_NAMES: Record<number, string> = {
  [Tier.None]: "未加入",
  [Tier.L1_Basic]: "基础用户",
  [Tier.L2_Staker]: "锁仓用户",
  [Tier.L3_Creator]: "内容创作者",
  [Tier.L4_Referrer]: "邀请达人",
  [Tier.L5_Ambassador]: "社区大使",
};

export const TIER_REWARDS: Record<number, number> = {
  [Tier.L1_Basic]: 1_000,
  [Tier.L2_Staker]: 5_000,
  [Tier.L3_Creator]: 10_000,
  [Tier.L4_Referrer]: 20_000,
  [Tier.L5_Ambassador]: 50_000,
};

export const TIER_POINTS_REQUIRED: Record<number, number> = {
  [Tier.L2_Staker]: 10,
  [Tier.L3_Creator]: 50,
  [Tier.L4_Referrer]: 200,
  [Tier.L5_Ambassador]: 1_000,
};

// ── Tasks ──
export enum Task {
  JoinDiscord = 0,
  InviteFriend = 1,
  OriginalPost = 2,
  CreateContent = 4, // Note: id 3 is skipped in contract
}

export const TASK_POINTS: Record<number, number> = {
  [Task.JoinDiscord]: 1,
  [Task.InviteFriend]: 5,
  [Task.OriginalPost]: 10,
  [Task.CreateContent]: 20,
};

// ── Staking ──
export const DURATION_OPTIONS = [30, 90, 180] as const;
export type DurationDays = (typeof DURATION_OPTIONS)[number];

export const DURATION_POINTS: Record<number, number> = {
  30: 5,
  90: 20,
  180: 50,
};

export const DURATION_BONUS: Record<number, number> = {
  30: 10, // +10%
  90: 30, // +30%
  180: 80, // +80%
};

// ── AIGENT Token ABI ──
export const AIGENT_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address", name: "account" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { type: "address", name: "to" },
      { type: "uint256", name: "amount" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { type: "address", name: "spender" },
      { type: "uint256", name: "amount" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { type: "address", name: "owner" },
      { type: "address", name: "spender" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const satisfies Abi;

// ── Loyalty Contract ABI ──
export const LOYALTY_ABI = [
  // ── Read ──
  {
    type: "function",
    name: "getPlayer",
    inputs: [{ type: "address", name: "player" }],
    outputs: [
      { type: "uint8", name: "tier" },
      { type: "uint256", name: "totalClaimed" },
      { type: "uint256", name: "points" },
      { type: "uint256", name: "lastClaimTime" },
      { type: "address", name: "referrer" },
      { type: "uint256", name: "referralCount" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getStake",
    inputs: [{ type: "address", name: "player" }],
    outputs: [
      { type: "uint256", name: "amount" },
      { type: "uint256", name: "startTime" },
      { type: "uint256", name: "duration" },
      { type: "bool", name: "active" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasCompletedTask",
    inputs: [
      { type: "address", name: "player" },
      { type: "uint8", name: "task" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "remainingToday",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tiers",
    inputs: [{ type: "uint8", name: "tier" }],
    outputs: [
      { type: "uint256", name: "reward" },
      { type: "string", name: "name" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "taskPoints",
    inputs: [{ type: "uint8", name: "task" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "dailyCap",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "todayClaimed",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalAllocated",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MIN_STAKE_AMOUNT",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "blacklisted",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  // ── Write ──
  {
    type: "function",
    name: "claimL1",
    inputs: [{ type: "address", name: "referrer" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitTask",
    inputs: [
      { type: "uint8", name: "task" },
      { type: "bytes", name: "signature" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "stake",
    inputs: [
      { type: "uint256", name: "amount" },
      { type: "uint256", name: "durationDays" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addStake",
    inputs: [{ type: "uint256", name: "amount" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unstake",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "emergencyUnstake",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;
