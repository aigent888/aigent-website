/**
 * AIGENT SDK v2.0
 *
 * Two-layer architecture:
 *
 *   Layer 1 — EIP-2612 Permit (CORE):
 *     Gasless approvals for autonomous AI agents.
 *     Agents sign off-chain, relayers pay gas.
 *     No human intervention, no OKB required.
 *
 *   Layer 2 — 5-Tier Loyalty System:
 *     Stake, earn, claim airdrops, submit tasks.
 *     Full programmatic access to the loyalty contract.
 *
 * @example
 * ```ts
 * import { createWalletClient, createPublicClient, http } from "viem";
 * import { privateKeyToAccount } from "viem/accounts";
 * import { xLayer } from "viem/chains";
 * import { AigentClient, signPermit, gaslessTransfer } from "@aigent/sdk";
 *
 * const publicClient = createPublicClient({ chain: xLayer, transport: http() });
 * const account = privateKeyToAccount("0x...");
 * const wallet = createWalletClient({ account, chain: xLayer, transport: http() });
 *
 * // --- EIP-2612: Gasless transfer ---
 * const permit = await signPermit(wallet, account, publicClient, spender, amount);
 * const hash = await gaslessTransfer(wallet, account, publicClient, to, amount);
 *
 * // --- Loyalty: Stake and earn ---
 * const aigent = new AigentClient({ publicClient, walletClient: wallet, account });
 * await aigent.claimL1();
 * await aigent.stake(parseUnits("1000", 18), 90);
 * ```
 */

export { AigentClient } from "./aigent.js";

// ── EIP-2612 Permit (Layer 1) ──
export {
  signPermit,
  gaslessTransfer,
  buildRelayPayload,
  getNonce,
} from "./permit.js";
export type { PermitSignature } from "./permit.js";

// ── Constants ──
export {
  AIGENT_TOKEN,
  LOYALTY_AIRDROP,
  TIMELOCK,
  CHAIN_ID,
  CHAIN_NAME,
  AIGENT_DECIMALS,
  AIGENT_SYMBOL,
  TOTAL_SUPPLY,
  DAILY_CAP,
  MAX_ALLOCATION,
  MIN_STAKE_AMOUNT,
  CHECKIN_REWARD,
  Tier,
  TIER_NAMES,
  TIER_REWARDS,
  TIER_POINTS_REQUIRED,
  Task,
  TASK_POINTS,
  DURATION_OPTIONS,
  DURATION_POINTS,
  DURATION_BONUS,
  AIGENT_ABI,
  LOYALTY_ABI,
} from "./constants.js";

export type { DurationDays } from "./constants.js";

// ── Types ──
export type {
  Player,
  StakeInfo,
  AirdropStatus,
  TaskStatus,
  StakeConfig,
  AigentSDKConfig,
} from "./types.js";
