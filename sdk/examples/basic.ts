/**
 * AIGENT SDK — Basic usage example
 *
 * Run: npx tsx sdk/examples/basic.ts
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";
import { AigentClient } from "../src/index.js";

async function main() {
  // ── Setup ──
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.log("Set PRIVATE_KEY in .env to run this example");
    return;
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: xLayer,
    transport: http("https://rpc.xlayer.tech"),
  });
  const walletClient = createWalletClient({
    account,
    chain: xLayer,
    transport: http("https://rpc.xlayer.tech"),
  });

  const aigent = new AigentClient({
    publicClient,
    walletClient,
    account,
  });

  console.log(`👤 Address: ${account.address}`);

  // ── Read: Airdrop Status ──
  console.log("\n📊 Airdrop Status:");
  const status = await aigent.getStatus();
  console.log(`  Today: ${aigent.format(status.todayClaimed)} / ${aigent.format(status.dailyCap)}`);
  console.log(`  Remaining: ${status.remainingPercent}%`);
  console.log(`  Total Allocated: ${aigent.format(status.totalAllocated)}`);

  // ── Read: Player Stats ──
  console.log("\n👤 Player Stats:");
  try {
    const player = await aigent.getPlayer();
    console.log(`  Tier: ${aigent.tierName(player.tier)} (L${player.tier})`);
    console.log(`  Points: ${player.points}`);
    console.log(`  Total Claimed: ${aigent.format(player.totalClaimed)}`);
    console.log(`  Referrals: ${player.referralCount}`);
  } catch {
    console.log("  Not registered yet. Claim L1 first!");
  }

  // ── Read: Balance ──
  const balance = await aigent.getBalance();
  console.log(`\n💰 Balance: ${aigent.format(balance)} AIGENT`);

  // ── Read: Stake Info ──
  const stake = await aigent.getStake();
  if (stake.active) {
    console.log("\n🔒 Active Stake:");
    console.log(`  Amount: ${aigent.format(stake.amount)}`);
    console.log(`  Duration: ${aigent.formatDuration(stake.duration)} days`);
    console.log(`  Remaining: ${aigent.formatDuration(aigent.calcRemainingLock(stake))} days`);
    console.log(`  Bonus: ${aigent.format(aigent.calcUnlockReward(stake.amount, stake.duration))}`);
  } else {
    console.log("\n🔓 No active stake");
  }

  // ── Write Examples (uncomment to use) ──
  // console.log("\n🚀 Claiming L1...");
  // const claimHash = await aigent.claimL1();
  // console.log(`  TX: ${claimHash}`);

  // console.log("\n🔒 Staking 1,000 AIGENT for 90 days...");
  // const stakeAmount = aigent.parse("1000");
  // const stakeHash = await aigent.stake(stakeAmount, 90);
  // console.log(`  TX: ${stakeHash}`);

  // console.log("\n➕ Adding 500 AIGENT to stake...");
  // const addAmount = aigent.parse("500");
  // const addHash = await aigent.addStake(addAmount);
  // console.log(`  TX: ${addHash}`);

  // console.log("\n🔓 Unstaking...");
  // const unstakeHash = await aigent.unstake();
  // console.log(`  TX: ${unstakeHash}`);

  console.log("\n✅ Done");
}

main().catch(console.error);
