/**
 * AIGENT SDK — Main client for 5-tier loyalty system
 *
 * Usage:
 *   import { AigentClient } from "@aigent/sdk";
 *   const aigent = new AigentClient({ publicClient, walletClient, account });
 *   await aigent.claimL1(referrer);
 *   await aigent.stake(1000n, 90);
 */

import {
  type PublicClient,
  type WalletClient,
  type Account,
  type Hash,
  type WriteContractReturnType,
  parseUnits,
  formatUnits,
  maxUint256,
} from "viem";
import {
  LOYALTY_AIRDROP,
  AIGENT_TOKEN,
  LOYALTY_ABI,
  AIGENT_ABI,
  AIGENT_DECIMALS,
  DURATION_POINTS,
  DURATION_BONUS,
  MIN_STAKE_AMOUNT,
  TIER_NAMES,
  TIER_REWARDS,
} from "./constants.js";
import type {
  AigentSDKConfig,
  Player,
  StakeInfo,
  AirdropStatus,
  TaskStatus,
  StakeConfig,
} from "./types.js";

export class AigentClient {
  #publicClient: PublicClient;
  #walletClient?: WalletClient;
  #account?: Account;
  #loyaltyAddress: `0x${string}`;
  #tokenAddress: `0x${string}`;

  constructor(config: AigentSDKConfig) {
    this.#publicClient = config.publicClient;
    this.#walletClient = config.walletClient;
    this.#account = config.account;
    this.#loyaltyAddress = (config.loyaltyAddress ?? LOYALTY_AIRDROP) as `0x${string}`;
    this.#tokenAddress = (config.tokenAddress ?? AIGENT_TOKEN) as `0x${string}`;
  }

  // ═══════════════════════════════════
  //  READ — 查询
  // ═══════════════════════════════════

  /** Get player stats: tier, points, referrals, etc. */
  async getPlayer(address?: string): Promise<Player> {
    const [tier, totalClaimed, points, lastClaimTime, referrer, referralCount] =
      (await this.#publicClient.readContract({
        address: this.#loyaltyAddress,
        abi: LOYALTY_ABI,
        functionName: "getPlayer",
        args: [this.#resolveAddress(address)],
      })) as [number, bigint, bigint, bigint, string, bigint];

    return { tier, totalClaimed, points, lastClaimTime, referrer, referralCount };
  }

  /** Get current stake info for an address */
  async getStake(address?: string): Promise<StakeInfo> {
    const [amount, startTime, duration, active] =
      (await this.#publicClient.readContract({
        address: this.#loyaltyAddress,
        abi: LOYALTY_ABI,
        functionName: "getStake",
        args: [this.#resolveAddress(address)],
      })) as [bigint, bigint, bigint, boolean];

    return { amount, startTime, duration, active };
  }

  /** Check if a task has been completed */
  async hasCompletedTask(taskId: number, address?: string): Promise<boolean> {
    return (await this.#publicClient.readContract({
      address: this.#loyaltyAddress,
      abi: LOYALTY_ABI,
      functionName: "hasCompletedTask",
      args: [this.#resolveAddress(address), taskId],
    })) as boolean;
  }

  /** Get all task completion statuses */
  async getAllTasks(address?: string): Promise<TaskStatus[]> {
    const results: TaskStatus[] = [];
    for (const taskId of [0, 1, 2, 4]) {
      const [completed, points] = await Promise.all([
        this.hasCompletedTask(taskId, address),
        this.#publicClient.readContract({
          address: this.#loyaltyAddress,
          abi: LOYALTY_ABI,
          functionName: "taskPoints",
          args: [taskId],
        }),
      ]);
      results.push({ taskId, completed, points: points as bigint });
    }
    return results;
  }

  /** Check remaining daily allocation */
  async remainingToday(): Promise<bigint> {
    return (await this.#publicClient.readContract({
      address: this.#loyaltyAddress,
      abi: LOYALTY_ABI,
      functionName: "remainingToday",
    })) as bigint;
  }

  /** Get airdrop status overview */
  async getStatus(): Promise<AirdropStatus> {
    const [todayClaimed, dailyCap, totalAllocated, remaining] =
      await Promise.all([
        this.#publicClient.readContract({
          address: this.#loyaltyAddress,
          abi: LOYALTY_ABI,
          functionName: "todayClaimed",
        }),
        this.#publicClient.readContract({
          address: this.#loyaltyAddress,
          abi: LOYALTY_ABI,
          functionName: "dailyCap",
        }),
        this.#publicClient.readContract({
          address: this.#loyaltyAddress,
          abi: LOYALTY_ABI,
          functionName: "totalAllocated",
        }),
        this.remainingToday(),
      ]);

    const tc = todayClaimed as bigint;
    const dc = dailyCap as bigint;
    const ta = totalAllocated as bigint;
    const rt = remaining as bigint;

    return {
      todayClaimed: tc,
      dailyCap: dc,
      totalAllocated: ta,
      remainingToday: rt,
      remainingPercent: dc > 0n ? Number((rt * 10000n) / dc) / 100 : 0,
    };
  }

  /** Get tier name */
  tierName(tier: number): string {
    return TIER_NAMES[tier] ?? "未知";
  }

  /** Get tier reward amount */
  tierReward(tier: number): number {
    return TIER_REWARDS[tier] ?? 0;
  }

  /** Get AIGENT balance */
  async getBalance(address?: string): Promise<bigint> {
    return (await this.#publicClient.readContract({
      address: this.#tokenAddress,
      abi: AIGENT_ABI,
      functionName: "balanceOf",
      args: [this.#resolveAddress(address)],
    })) as bigint;
  }

  /** Check if address is blacklisted */
  async isBlacklisted(address?: string): Promise<boolean> {
    return (await this.#publicClient.readContract({
      address: this.#loyaltyAddress,
      abi: LOYALTY_ABI,
      functionName: "blacklisted",
      args: [this.#resolveAddress(address)],
    })) as boolean;
  }

  /** Get staking config for a duration */
  getStakeConfig(durationDays: number): StakeConfig {
    return {
      durationDays: durationDays as StakeConfig["durationDays"],
      points: DURATION_POINTS[durationDays] ?? 0,
      bonusPercent: DURATION_BONUS[durationDays] ?? 0,
    };
  }

  // ═══════════════════════════════════
  //  WRITE — 交易
  // ═══════════════════════════════════

  /** Claim L1 basic airdrop (1,000 AIGENT). Optionally provide a referrer address. */
  async claimL1(referrer?: string): Promise<Hash> {
    this.#requireWallet();
    return this.#walletClient!.writeContract({
      address: this.#loyaltyAddress,
      abi: LOYALTY_ABI,
      functionName: "claimL1",
      args: [(referrer ?? "0x0000000000000000000000000000000000000000") as `0x${string}`],
      account: this.#account,
      chain: this.#walletClient!.chain,
    });
  }

  /** Submit a completed task with the verifier's signature */
  async submitTask(taskId: number, signature: `0x${string}`): Promise<Hash> {
    this.#requireWallet();
    return this.#walletClient!.writeContract({
      address: this.#loyaltyAddress,
      abi: LOYALTY_ABI,
      functionName: "submitTask",
      args: [taskId, signature],
      account: this.#account,
      chain: this.#walletClient!.chain,
    });
  }

  /** Stake AIGENT for a duration in days (30, 90, or 180) */
  async stake(amount: bigint, durationDays: 30 | 90 | 180): Promise<Hash> {
    this.#requireWallet();
    // Ensure allowance first
    await this.#ensureAllowance(amount);

    return this.#walletClient!.writeContract({
      address: this.#loyaltyAddress,
      abi: LOYALTY_ABI,
      functionName: "stake",
      args: [amount, BigInt(durationDays)],
      account: this.#account,
      chain: this.#walletClient!.chain,
    });
  }

  /** Add more AIGENT to an existing active stake */
  async addStake(amount: bigint): Promise<Hash> {
    this.#requireWallet();
    await this.#ensureAllowance(amount);

    return this.#walletClient!.writeContract({
      address: this.#loyaltyAddress,
      abi: LOYALTY_ABI,
      functionName: "addStake",
      args: [amount],
      account: this.#account,
      chain: this.#walletClient!.chain,
    });
  }

  /** Unstake after lock duration (earns bonus) */
  async unstake(): Promise<Hash> {
    this.#requireWallet();
    return this.#walletClient!.writeContract({
      address: this.#loyaltyAddress,
      abi: LOYALTY_ABI,
      functionName: "unstake",
      account: this.#account,
      chain: this.#walletClient!.chain,
    });
  }

  /** Emergency unstake (50% penalty) */
  async emergencyUnstake(): Promise<Hash> {
    this.#requireWallet();
    return this.#walletClient!.writeContract({
      address: this.#loyaltyAddress,
      abi: LOYALTY_ABI,
      functionName: "emergencyUnstake",
      account: this.#account,
      chain: this.#walletClient!.chain,
    });
  }

  // ═══════════════════════════════════
  //  PRIVATE
  // ═══════════════════════════════════

  #resolveAddress(address?: string): `0x${string}` {
    const addr = address ?? this.#account?.address;
    if (!addr) throw new Error("No address provided and no account configured");
    return addr as `0x${string}`;
  }

  #requireWallet() {
    if (!this.#walletClient || !this.#account) {
      throw new Error(
        "WalletClient and Account required for write operations. " +
        "Pass them in the constructor config."
      );
    }
  }

  async #ensureAllowance(amount: bigint) {
    const owner = this.#account!.address;
    const current = (await this.#publicClient.readContract({
      address: this.#tokenAddress,
      abi: AIGENT_ABI,
      functionName: "allowance",
      args: [owner, this.#loyaltyAddress],
    })) as bigint;

    if (current < amount) {
      await this.#walletClient!.writeContract({
        address: this.#tokenAddress,
        abi: AIGENT_ABI,
        functionName: "approve",
        args: [this.#loyaltyAddress, maxUint256],
        account: this.#account,
        chain: this.#walletClient!.chain,
      });
    }
  }

  // ═══════════════════════════════════
  //  UTILITY — 格式化
  // ═══════════════════════════════════

  /** Format AIGENT wei to human-readable string */
  format(wei: bigint, decimals?: number): string {
    return formatUnits(wei, decimals ?? AIGENT_DECIMALS);
  }

  /** Parse human-readable AIGENT to wei */
  parse(amount: string | number): bigint {
    return parseUnits(String(amount), AIGENT_DECIMALS);
  }

  /** Format stake duration from seconds to days */
  formatDuration(seconds: bigint): number {
    return Number(seconds) / 86400;
  }

  /** Calculate expected unlock reward */
  calcUnlockReward(amount: bigint, durationSeconds: bigint): bigint {
    const days = Number(durationSeconds) / 86400;
    const bonus = DURATION_BONUS[days] ?? 0;
    return (amount * BigInt(bonus)) / 100n;
  }

  /** Get remaining lock time in seconds */
  calcRemainingLock(stake: StakeInfo): bigint {
    const endTime = stake.startTime + stake.duration;
    const now = BigInt(Math.floor(Date.now() / 1000));
    return endTime > now ? endTime - now : 0n;
  }
}
