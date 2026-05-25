/**
 * AIGENT AI 运营 Agent — 自动发空投 + 社交媒体运营
 *
 * 用法:
 *   npx tsx agent.ts --auto          # 全自动模式 (每4小时一轮)
 *   npx tsx agent.ts --scan          # 扫描社区，选优质用户
 *   npx tsx agent.ts --reward        # 给扫描出来的用户发奖励
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
const VERIFIER_PK = process.env.VERIFIER_PRIVATE_KEY || ""; // 签名任务用的私钥

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
  remainingToday: bigint;
  dailyCap: bigint;
  todayClaimed: bigint;
  totalAllocated: bigint;
  remainingPercent: number;
}> {
  const [remaining, cap, claimed, allocated] = await Promise.all([
    publicClient.readContract({ address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI, functionName: "remainingToday" }),
    publicClient.readContract({ address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI, functionName: "dailyCap" }),
    publicClient.readContract({ address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI, functionName: "todayClaimed" }),
    publicClient.readContract({ address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI, functionName: "totalAllocated" }),
  ]);

  return {
    remainingToday: remaining as bigint,
    dailyCap: cap as bigint,
    todayClaimed: claimed as bigint,
    totalAllocated: allocated as bigint,
    remainingPercent: Number((remaining as bigint) * 100n / (cap as bigint)),
  };
}

// ═══════════════════════════════════════════
//  工具 2: 扫描 Twitter 社群
// ═══════════════════════════════════════════

// 模拟 Twitter 搜索 (真实场景用 Twitter API v2)
interface TweetUser {
  handle: string;
  address: string;       // 钱包地址 (如果在推文中提到)
  followerCount: number;
  engagement: number;    // 点赞+转发
  content: string;
}

async function scanCommunity(keyword: string): Promise<TweetUser[]> {
  console.log(`\n🔍 扫描社区: "${keyword}"`);

  // TODO: 接入真实 Twitter API
  // const response = await twitterClient.v2.search(`"${keyword}" crypto -is:retweet`, {
  //   expansions: ["author_id"],
  //   "tweet.fields": ["public_metrics", "author"],
  //   "user.fields": ["public_metrics"],
  // });

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

async function batchReward(
  users: { address: string; pointsAward: number; reason: string }[]
) {
  if (!verifierWallet) {
    console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置，跳过链上操作");
    return;
  }

  console.log(`\n💰 批量发奖 (${users.length} 人)...`);

  const addresses = users.map(u => u.address as `0x${string}`);
  const amounts = users.map(u => BigInt(u.pointsAward) * BigInt(1000) * BigInt(1e18)); // 每点 = 1000 AIGENT

  try {
    const hash = await verifierWallet.writeContract({
      address: LOYALTY_AIRDROP as `0x${string}`,
      abi: LOYALTY_ABI,
      functionName: "batchReward",
      args: [addresses, amounts],
      account: verifierAccount!,
      chain: xLayer,
    });

    console.log(`  ✅ 交易已发送: ${hash}`);
    for (const u of users) {
      console.log(`    ${u.address.slice(0, 8)}... +${u.pointsAward} 分 — ${u.reason}`);
    }
  } catch (e: any) {
    console.log(`  ❌ 发奖失败: ${e.message}`);
  }
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
        address: LOYALTY_AIRDROP as `0x${string}`,
        abi: LOYALTY_ABI,
        functionName: "blacklisted",
        args: [addr as `0x${string}`],
      });

      if (!isBlacklisted) {
        await verifierWallet.writeContract({
          address: LOYALTY_AIRDROP as `0x${string}`,
          abi: LOYALTY_ABI,
          functionName: "blacklist",
          args: [addr as `0x${string}`, true],
          account: verifierAccount!,
          chain: xLayer,
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

// ═══════════════════════════════════════════
//  主循环
// ═══════════════════════════════════════════

async function mainLoop() {
  console.log("╔══════════════════════════════════╗");
  console.log("║  🤖 AIGENT 运营 Agent v1.0      ║");
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
    // 4. 发奖励
    console.log("\n💰 Step 4: 发奖励");
    await batchReward(selected.map(s => ({
      address: s.address,
      pointsAward: s.pointsAward,
      reason: s.reason,
    })));

    // 5. 生成并发布推文报告
    console.log("\n📝 Step 5: 生成运营报告");
    const tweet = await generateReport(status, selected);
    console.log(`\n  推文草稿:\n  ${tweet}`);
  } else {
    console.log("\n  ℹ️ 今天没有发现优质用户，跳过发奖");
    // 发一条提醒推文
    const statusTweet = `🎣 AIGENT 空投进行中！\n今日剩余额度: ${status.remainingPercent}%\n连接钱包即可领取 1000 AIGENT\n👉 aigent.cc`;
    console.log(`\n  提醒推文:\n  ${statusTweet}`);
  }

  console.log("\n✅ 本轮运营完成。\n");
}

// ── CLI ──
const mode = process.argv[2] || "--auto";

if (mode === "--auto") {
  mainLoop().catch(console.error);
  // 每 4 小时运行一次
  setInterval(() => mainLoop().catch(console.error), 4 * 60 * 60 * 1000);
} else if (mode === "--scan") {
  scanCommunity("AIGENT").then(users => {
    console.log(`扫描结果: ${users.length} 条`);
    users.forEach(u => console.log(`  @${u.handle} | 粉丝:${u.followerCount}`));
  });
} else if (mode === "--reward") {
  mainLoop().catch(console.error);
} else {
  console.log("Usage: npx tsx agent.ts [--auto|--scan|--reward]");
}
