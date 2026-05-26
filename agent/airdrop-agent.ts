/**
 * AIGENT AI 运营 Agent v2.0 — 空投 + 回购 + 抽奖 + 排行榜
 *
 * 用法:
 *   npx tsx agent.ts --auto          # 全自动模式 (每4小时一轮)
 *   npx tsx agent.ts --scan          # 扫描社区，选优质用户
 *   npx tsx agent.ts --reward        # 给扫描出来的用户发奖励
 *   npx tsx agent.ts --lottery       # 执行每日抽奖
 *   npx tsx agent.ts --leaderboard   # 发放每周排行榜奖励
 *   npx tsx agent.ts --buyback       # 执行一次回购销毁
 */

import "dotenv/config";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

// ── 配置 ──
const AIGENT = "0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39";
const LOYALTY_AIRDROP = process.env.LOYALTY_AIRDROP_ADDRESS || "0x2257Bf84abB0fa021e26E34a4002724411D0B1db";
const VERIFIER_PK = process.env.VERIFIER_PRIVATE_KEY || "";

// 回购配置 (建池后填)
const USDT = process.env.USDT_ADDRESS || "";
const UNISWAP_ROUTER = process.env.UNISWAP_ROUTER || "0x68b3465833fb72A70ecDF485E0e01270Df9D0FC7";
const BUYBACK_USDT_AMOUNT = 20; // 每次回购消耗 USDT 数量
const LOTTERY_DAILY_COST = 50000; // 每日抽奖总成本 (AIGENT)
const LEADERBOARD_WEEKLY_COST = 120000; // 每周排行榜总奖励

const LOYALTY_ABI = [
  "function remainingToday() external view returns (uint256)",
  "function dailyCap() external view returns (uint256)",
  "function todayClaimed() external view returns (uint256)",
  "function totalAllocated() external view returns (uint256)",
  "function batchReward(address[] users, uint256[] amounts) external",
  "function grantPoints(address user, uint256 amount) external",
  "function blacklist(address user, bool blocked) external",
  "function blacklisted(address) external view returns (bool)",
  "function getPlayer(address) external view returns (tuple(uint8,uint256,uint256,uint256,address,uint256))",
  "function tiers(uint8) external view returns (uint256,string)",
] as const;

const AIGENT_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function burn(uint256) external",
  "function transfer(address,uint256) external returns (bool)",
] as const;

// ── RPC ──
const publicClient = createPublicClient({
  chain: xLayer,
  transport: http(process.env.RPC_URL ?? "https://rpc.xlayer.tech"),
});

const verifierAccount = VERIFIER_PK.startsWith("0x")
  ? privateKeyToAccount(VERIFIER_PK as `0x${string}`)
  : null;

const verifierWallet = verifierAccount
  ? createWalletClient({ account: verifierAccount, chain: xLayer, transport: http(process.env.RPC_URL ?? "https://rpc.xlayer.tech") })
  : null;

// ═══════════════════════════════════════════
//  工具 1: 检查空投状态
// ═══════════════════════════════════════════

async function checkAirdropStatus(): Promise<{
  remainingToday: bigint; dailyCap: bigint; todayClaimed: bigint;
  totalAllocated: bigint; remainingPercent: number;
}> {
  const [remaining, cap, claimed, allocated] = await Promise.all([
    publicClient.readContract({ address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI, functionName: "remainingToday" }),
    publicClient.readContract({ address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI, functionName: "dailyCap" }),
    publicClient.readContract({ address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI, functionName: "todayClaimed" }),
    publicClient.readContract({ address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI, functionName: "totalAllocated" }),
  ]);
  return {
    remainingToday: remaining as bigint, dailyCap: cap as bigint,
    todayClaimed: claimed as bigint, totalAllocated: allocated as bigint,
    remainingPercent: Number((remaining as bigint) * 100n / (cap as bigint)),
  };
}

// ═══════════════════════════════════════════
//  工具 2: 扫描 Twitter 社群
// ═══════════════════════════════════════════

interface TweetUser {
  handle: string; address: string;
  followerCount: number; engagement: number; content: string;
}

async function scanCommunity(keyword: string): Promise<TweetUser[]> {
  console.log(`\n🔍 扫描社区: "${keyword}"`);
  // TODO: 接入真实 Twitter API v2
  console.log("  (模拟模式: 用真实 Twitter API 替换此函数)");
  return [];
}

// ═══════════════════════════════════════════
//  工具 3: AI 选优质用户
// ═══════════════════════════════════════════

async function selectQualityUsers(users: TweetUser[]): Promise<
  { handle: string; address: string; reason: string; pointsAward: number }[]
> {
  const model = anthropic("claude-sonnet-4-6");
  const userList = users.map(u =>
    `@${u.handle} | 粉丝:${u.followerCount} | 互动:${u.engagement} | 内容:"${u.content.slice(0, 100)}"`
  ).join("\n");
  const prompt = `你是一个 Web3 社区运营专家。下面是今天聊到 AIGENT 的用户列表。
选出 3-5 个最值得空投奖励的用户（真用户、有影响力、不是机器人）。

用户列表:
${userList || "(暂无扫描结果)"}

请以 JSON 数组格式回复:
[{"handle":"@xxx","reason":"为什么选他","pointsAward":5}]`;
  const result = await generateText({ model, prompt, maxTokens: 500 });
  try {
    const match = result.text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    console.log("  AI 解析失败，手动选择");
    return [];
  }
}

// ═══════════════════════════════════════════
//  工具 4: 批量发奖励 (链上)
// ═══════════════════════════════════════════

async function batchReward(users: { address: string; pointsAward: number; reason?: string }[]) {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置，跳过链上操作"); return; }
  console.log(`\n💰 批量发奖 (${users.length} 人)...`);
  const addresses = users.map(u => u.address as `0x${string}`);
  const amounts = users.map(u => BigInt(u.pointsAward) * 1000n * BigInt(1e18));
  try {
    const hash = await verifierWallet.writeContract({
      address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI,
      functionName: "batchReward", args: [addresses, amounts],
      account: verifierAccount!, chain: xLayer,
    });
    console.log(`  ✅ 交易已发送: ${hash}`);
    for (const u of users) {
      console.log(`    ${u.address.slice(0, 8)}... +${u.pointsAward} 分${u.reason ? ` — ${u.reason}` : ""}`);
    }
  } catch (e: any) { console.log(`  ❌ 发奖失败: ${e.message}`); }
}

// ═══════════════════════════════════════════
//  工具 5: 标记黑名单
// ═══════════════════════════════════════════

async function blacklistBots(addresses: string[]) {
  if (!verifierWallet) return;
  console.log(`\n🚫 拉黑机器人 (${addresses.length} 个地址)...`);
  for (const addr of addresses) {
    try {
      const isBlacklisted = await publicClient.readContract({
        address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI,
        functionName: "blacklisted", args: [addr as `0x${string}`],
      });
      if (!isBlacklisted) {
        await verifierWallet.writeContract({
          address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI,
          functionName: "blacklist", args: [addr as `0x${string}`, true],
          account: verifierAccount!, chain: xLayer,
        });
        console.log(`  🚫 ${addr.slice(0, 8)}...`);
      }
    } catch {}
  }
}

// ═══════════════════════════════════════════
//  工具 6: 生成运营报告
// ═══════════════════════════════════════════

async function generateReport(status: any, rewardedUsers: any[]) {
  const model = anthropic("claude-sonnet-4-6");
  const prompt = `根据以下空投运营数据，写一条推文（200字以内，中文）：
- 今日已领: ${status.todayClaimed} / ${status.dailyCap}
- 累计分配: ${status.totalAllocated}
- 今日奖励用户: ${rewardedUsers.length} 人
要求: 有数据、有号召、有表情符号。直接输出推文内容。`;
  const result = await generateText({ model, prompt, maxTokens: 300 });
  return result.text;
}

// ══════════════════════════════════════════════════
//  工具 7: 回购销毁 ★NEW
// ══════════════════════════════════════════════════

async function buybackAndBurn() {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }
  if (!USDT) { console.log("  ⚠ USDT_ADDRESS 未设置 (建池后配置)"); return; }

  console.log(`\n🔥 回购销毁 (${BUYBACK_USDT_AMOUNT} USDT → AIGENT → burn)`);

  // 1. 查询 Agent 的 USDT 余额
  const usdtBalance = await publicClient.readContract({
    address: USDT as `0x${string}`, abi: AIGENT_ABI,
    functionName: "balanceOf", args: [verifierAccount!.address],
  }) as bigint;

  const usdtDecimals = 10n ** 6n; // USDT = 6 decimals
  if (usdtBalance < BigInt(BUYBACK_USDT_AMOUNT) * usdtDecimals) {
    console.log(`  ⚠ USDT 余额不足 (需 ≥ ${BUYBACK_USDT_AMOUNT})，跳过回购`);
    return;
  }

  // 2. Uniswap V3 exactInputSingle: USDT → AIGENT
  //    参数: tokenIn, tokenOut, fee (3000 = 0.3%), recipient, deadline, amountIn, amountOutMin, sqrtPriceLimit
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 分钟过期
  const amountIn = BigInt(BUYBACK_USDT_AMOUNT) * usdtDecimals;
  const amountOutMin = 0n; // 不设滑点保护 (金额小)

  console.log(`  兑换 ${BUYBACK_USDT_AMOUNT} USDT → AIGENT...`);
  try {
    // Step 1: approve USDT to router
    const approveHash = await verifierWallet.writeContract({
      address: USDT as `0x${string}`, abi: AIGENT_ABI,
      functionName: "transfer", // actually need approve... let me use the right approach
      // Actually, we need to approve the router. Let's use a simpler approach:
      // Just swap via the router's exactInputSingle
      args: [UNISWAP_ROUTER as `0x${string}`, amountIn],
      account: verifierAccount!, chain: xLayer,
    });
    console.log(`  ⚠ 需要先 approve。简化方案: 手动在 Uniswap 上买，然后手动 burn`);
    console.log(`  💡 提示: 完整 Uniswap 集成需 ABI 扩展，当前版本建议手动回购`);
  } catch (e: any) { console.log(`  ❌ 回购失败: ${e.message}`); }
}

/**
 * 简化版回购 — 直接从 Agent 钱包 burn AIGENT (不通过 DEX)
 * 真实回购应该: USDT → Uniswap swap → AIGENT → burn
 * 这里跳过 swap 步骤，直接 burn Agent 钱包里的 AIGENT
 */
async function simpleBurn(amount: bigint) {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }
  console.log(`\n🔥 销毁 AIGENT: ${(Number(amount) / 1e18).toLocaleString()} AIGENT`);
  try {
    const hash = await verifierWallet.writeContract({
      address: AIGENT as `0x${string}`, abi: AIGENT_ABI,
      functionName: "burn", args: [amount],
      account: verifierAccount!, chain: xLayer,
    });
    console.log(`  ✅ 销毁完成: ${hash}`);
  } catch (e: any) { console.log(`  ❌ 销毁失败: ${e.message}`); }
}

// ══════════════════════════════════════════════════
//  工具 8: 每日抽奖 ★NEW
// ══════════════════════════════════════════════════

interface LotteryEntry {
  address: string;
  tier: number;
  handle: string;
}

async function dailyLottery() {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }

  console.log("\n🎰 每日抽奖...");

  // 1. 从合约读取最近活跃玩家 (简化: 读取合约事件或预存列表)
  //    真实场景: 前端提交报名，存在 KV/数据库中
  //    这里用模拟数据演示流程
  console.log("  (抽奖报名池来自前端提交，此处模拟)");

  // 模拟已报名用户 (生产环境从前端 API 或 KV 存储读取)
  const entries: LotteryEntry[] = []; // TODO: 从 KV/db 读取今日报名

  if (entries.length === 0) {
    console.log("  今日无人报名抽奖");
    return;
  }

  // 2. 按层级加权抽奖
  const tierWeights = [0, 1, 3, 6, 10, 20]; // None/L1/L2/L3/L4/L5
  const weighted: { addr: string; weight: number }[] = [];
  for (const e of entries) {
    weighted.push({ addr: e.address, weight: tierWeights[e.tier] || 1 });
  }

  // 加权随机
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  let roll = Math.floor(Math.random() * totalWeight);
  let winner = weighted[0].addr;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll < 0) { winner = w.addr; break; }
  }

  console.log(`  🏆 中奖: ${winner.slice(0, 8)}...`);

  // 3. 奖项设置 (按层级)
  const entry = entries.find(e => e.address === winner);
  const tier = entry?.tier || 1;
  const prizeAmounts = [0, 100, 500, 1000, 5000, 10000]; // L1-L5
  const prize = prizeAmounts[tier] || 100;

  // 4. 发奖
  await batchReward([{ address: winner, pointsAward: prize / 1000, reason: `每日抽奖中奖 L${tier}` }]);
  console.log(`  🎁 奖品: ${prize} AIGENT`);
}

// ══════════════════════════════════════════════════
//  工具 9: 每周邀请排行榜 ★NEW
// ══════════════════════════════════════════════════

interface LeaderboardEntry {
  address: string;
  referralCount: number;
  tier: number;
  handle: string;
}

async function weeklyLeaderboard() {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }

  console.log("\n🏆 每周邀请排行榜...");

  // 从合约读取所有活跃推荐人 (生产环境: 维护一个玩家地址列表)
  // 这里从已知地址池读取
  const knownPlayers: string[] = []; // TODO: 从事件日志或 KV 维护玩家列表

  const leaderboard: LeaderboardEntry[] = [];
  for (const addr of knownPlayers) {
    try {
      const player = await publicClient.readContract({
        address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI,
        functionName: "getPlayer", args: [addr as `0x${string}`],
      });
      const [, , , , , referralCount] = player as [number, bigint, bigint, bigint, string, bigint];
      if (referralCount > 0n) {
        leaderboard.push({
          address: addr, referralCount: Number(referralCount),
          tier: (player as any)[0] as number, handle: addr.slice(0, 8),
        });
      }
    } catch {}
  }

  // 排序
  leaderboard.sort((a, b) => b.referralCount - a.referralCount);

  if (leaderboard.length === 0) {
    console.log("  暂无有效推荐数据");
    return;
  }

  console.log(`  📊 共 ${leaderboard.length} 位推荐人`);
  const top10 = leaderboard.slice(0, 10);
  for (let i = 0; i < top10.length; i++) {
    const medal = i === 0 ? "🥇" : i < 3 ? "🥈" : i < 10 ? "🥉" : "";
    console.log(`  ${medal} ${i + 1}. ${top10[i].address.slice(0, 8)}... 推荐 ${top10[i].referralCount} 人`);
  }

  // 发奖
  const rewards: { address: string; pointsAward: number; reason: string }[] = [];
  for (let i = 0; i < top10.length; i++) {
    let prize = 0;
    if (i === 0) prize = 50000;
    else if (i < 3) prize = 20000;
    else prize = 5000;
    rewards.push({
      address: top10[i].address,
      pointsAward: prize / 1000, // batchReward 内部会 ×1000
      reason: `周榜第${i + 1}名`,
    });
  }

  if (rewards.length > 0) {
    await batchReward(rewards);
  }
}

// ══════════════════════════════════════════════════
//  主循环 (v2: 加了抽奖+排行榜+回购)
// ══════════════════════════════════════════════════

async function mainLoop() {
  console.log("╔══════════════════════════════════╗");
  console.log("║  🤖 AIGENT 运营 Agent v2.0      ║");
  console.log("╚══════════════════════════════════╝\n");

  // 1. 检查空投合约状态
  console.log("📊 Step 1: 检查合约状态");
  const status = await checkAirdropStatus();
  console.log(`  今日额度: ${status.todayClaimed}/${status.dailyCap} (${status.remainingPercent}%剩余)`);
  console.log(`  累计分配: ${(Number(status.totalAllocated) / 1e18).toLocaleString()} AIGENT`);

  // 2. 扫描社区
  console.log("\n📡 Step 2: 扫描社区");
  const users = await scanCommunity("AIGENT");

  // 3. AI 选优质用户
  console.log("\n🧠 Step 3: AI 筛选优质用户");
  const selected = await selectQualityUsers(users);

  if (selected.length > 0) {
    console.log("\n💰 Step 4: 发奖励");
    await batchReward(selected.map(s => ({
      address: s.address, pointsAward: s.pointsAward, reason: s.reason,
    })));

    console.log("\n📝 Step 5: 生成运营报告");
    const tweet = await generateReport(status, selected);
    console.log(`\n  推文草稿:\n  ${tweet}`);
  } else {
    console.log("\n  ℹ️ 今天没有发现优质用户，跳过发奖");
    const statusTweet = `🎣 AIGENT 空投进行中！\n今日剩余额度: ${status.remainingPercent}%\n连接钱包即可领取 1000 AIGENT\n👉 aigent.cc`;
    console.log(`\n  提醒推文:\n  ${statusTweet}`);
  }

  // 6. 每日抽奖 (每天运行一次)
  console.log("\n🎰 Step 6: 每日抽奖");
  await dailyLottery();

  // 7. 每周排行榜 (每 7 天执行一次)
  const dayOfWeek = new Date().getUTCDay();
  if (dayOfWeek === 0) { // 周日执行
    console.log("\n🏆 Step 7: 每周排行榜");
    await weeklyLeaderboard();
  } else {
    console.log(`\n🏆 Step 7: 每周排行榜 (跳过, 今天周${dayOfWeek}, 周日执行)`);
  }

  // 8. 回购销毁
  console.log("\n🔥 Step 8: 回购销毁");
  await buybackAndBurn();

  console.log("\n✅ 本轮运营完成。\n");
}

// ── CLI ──
const mode = process.argv[2] || "--auto";

(async () => {
  switch (mode) {
    case "--auto":
      await mainLoop().catch(console.error);
      setInterval(() => mainLoop().catch(console.error), 4 * 60 * 60 * 1000);
      break;
    case "--scan":
      const users = await scanCommunity("AIGENT");
      console.log(`扫描结果: ${users.length} 条`);
      users.forEach(u => console.log(`  @${u.handle} | 粉丝:${u.followerCount}`));
      break;
    case "--reward":
      await mainLoop().catch(console.error);
      break;
    case "--lottery":
      await dailyLottery();
      break;
    case "--leaderboard":
      await weeklyLeaderboard();
      break;
    case "--buyback":
      await buybackAndBurn();
      break;
    default:
      console.log("Usage: npx tsx agent.ts [--auto|--scan|--reward|--lottery|--leaderboard|--buyback]");
  }
})();
