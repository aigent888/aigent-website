/**
 * AIGENT AI 运营 Agent v4.0 — Discord + Telegram 双平台
 *
 * 用法:
 *   npx tsx agent/airdrop-agent.ts --auto        # 全自动模式
 *   npx tsx agent/airdrop-agent.ts --scan         # 扫描社区用户
 *   npx tsx agent/airdrop-agent.ts --reward       # 发奖励
 *   npx tsx agent/airdrop-agent.ts --lottery      # 每日抽奖
 *   npx tsx agent/airdrop-agent.ts --leaderboard  # 周排行榜
 *   npx tsx agent/airdrop-agent.ts --buyback      # 回购销毁
 *   npx tsx agent/airdrop-agent.ts --bot          # 启动 Bot
 */

import "dotenv/config";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { Client, GatewayIntentBits, TextChannel } from "discord.js";

// ── 配置 ──
const AIGENT = "0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39";
const LOYALTY_AIRDROP = process.env.LOYALTY_AIRDROP_ADDRESS || "0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822";
const VERIFIER_PK = process.env.VERIFIER_PRIVATE_KEY || "";

// Platform configs
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const DC_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const DC_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || "";

// 回购配置
const USDT = process.env.USDT_ADDRESS || "";
const BUYBACK_USDT_AMOUNT = 20;

const LOYALTY_ABI = [
  { type: "function", name: "remainingToday", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "dailyCap", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "todayClaimed", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalAllocated", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "addStake", inputs: [{ type: "uint256", name: "amount" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "batchReward", inputs: [{ type: "address[]", name: "users" }, { type: "uint256[]", name: "amounts" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "grantPoints", inputs: [{ type: "address", name: "user" }, { type: "uint256", name: "amount" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "blacklist", inputs: [{ type: "address", name: "user" }, { type: "bool", name: "blocked" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "blacklisted", inputs: [{ type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "getPlayer", inputs: [{ type: "address" }], outputs: [{ type: "tuple", components: [{ type: "uint8" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }] }], stateMutability: "view" },
  { type: "function", name: "tiers", inputs: [{ type: "uint8" }], outputs: [{ type: "uint256" }, { type: "string" }], stateMutability: "view" },
];

const AIGENT_ABI = [
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "burn", inputs: [{ type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "transfer", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
];

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
//  平台抽象层: 统一消息发送
// ═══════════════════════════════════════════

async function tgApi(method: string, body: Record<string, any> = {}) {
  const url = `https://api.telegram.org/bot${TG_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

let discordClient: Client | null = null;
let discordChannel: TextChannel | null = null;

async function getDiscordChannel(): Promise<TextChannel | null> {
  if (!DC_TOKEN || !DC_CHANNEL_ID) return null;
  if (discordChannel) return discordChannel;
  try {
    if (!discordClient || !discordClient.isReady()) return null;
    const ch = await discordClient.channels.fetch(DC_CHANNEL_ID);
    if (ch && ch.isTextBased() && "send" in ch) {
      discordChannel = ch as TextChannel;
      return discordChannel;
    }
  } catch {}
  return null;
}

async function sendMessage(text: string): Promise<void> {
  let sent = 0;

  // Telegram
  if (TG_TOKEN && TG_CHAT_ID) {
    try {
      await tgApi("sendMessage", {
        chat_id: TG_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      console.log("  📤 Telegram 已发送");
      sent++;
    } catch (e: any) {
      console.log(`  ❌ Telegram 发送失败: ${e.message}`);
    }
  }

  // Discord
  const ch = await getDiscordChannel();
  if (ch) {
    try {
      // Discord has a 2000-char limit; split if needed
      const clean = text.replace(/<[^>]*>/g, ""); // strip HTML for Discord
      if (clean.length <= 2000) {
        await ch.send(clean);
      } else {
        // Split into chunks
        for (let i = 0; i < clean.length; i += 1900) {
          await ch.send(clean.slice(i, i + 1900));
        }
      }
      console.log("  📤 Discord 已发送");
      sent++;
    } catch (e: any) {
      console.log(`  ❌ Discord 发送失败: ${e.message}`);
    }
  }

  if (sent === 0) {
    console.log("  ⚠ 无可用平台 (Telegram/Discord 均未配置)");
  }
}

// ═══════════════════════════════════════════
//  平台抽象层: 统一社区用户结构
// ═══════════════════════════════════════════

interface CommunityUser {
  handle: string;
  platform: "telegram" | "discord";
  userId: string;
  address: string;
  messageCount: number;
  content: string;
}

// ═══════════════════════════════════════════
//  扫描: Telegram
// ═══════════════════════════════════════════

async function scanTelegram(): Promise<CommunityUser[]> {
  if (!TG_TOKEN) return [];
  console.log("📡 扫描 Telegram...");

  try {
    const result = await tgApi("getUpdates", { limit: 100, timeout: 5 });
    if (!result.ok || !result.result) {
      console.log("  ⚠ 获取消息失败");
      return [];
    }

    const updates = result.result;
    console.log(`  获取到 ${updates.length} 条更新`);

    const userMap = new Map<number, { handle: string; messages: string[] }>();
    const addressRegex = /0x[a-fA-F0-9]{40}/g;

    for (const upd of updates) {
      const msg = upd.message || upd.channel_post;
      if (!msg || !msg.from) continue;
      const from = msg.from;
      const name = from.username ? `@${from.username}` : (from.first_name || `user_${from.id}`);
      const text = msg.text || msg.caption || "";
      const addrs = text.match(addressRegex);
      if (addrs || text.toLowerCase().includes("aigent")) {
        if (!userMap.has(from.id)) {
          userMap.set(from.id, { handle: name, messages: [] });
        }
        userMap.get(from.id)!.messages.push(text);
      }
    }

    const users: CommunityUser[] = [];
    for (const [uid, data] of userMap) {
      const allText = data.messages.join(" | ");
      const addrs = allText.match(addressRegex) || [];
      users.push({
        handle: data.handle,
        platform: "telegram",
        userId: String(uid),
        address: addrs[0] || "",
        messageCount: data.messages.length,
        content: allText.slice(0, 200),
      });
    }
    console.log(`  Telegram: ${users.length} 个活跃用户`);
    return users;
  } catch (e: any) {
    console.log(`  ❌ Telegram 扫描失败: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════
//  扫描: Discord
// ═══════════════════════════════════════════

async function scanDiscord(): Promise<CommunityUser[]> {
  if (!DC_TOKEN || !DC_CHANNEL_ID) return [];
  console.log("📡 扫描 Discord...");

  const ch = await getDiscordChannel();
  if (!ch) {
    console.log("  ⚠ 无法获取 Discord 频道");
    return [];
  }

  try {
    const messages = await ch.messages.fetch({ limit: 100 });
    console.log(`  获取到 ${messages.size} 条消息`);

    const userMap = new Map<string, { handle: string; messages: string[] }>();
    const addressRegex = /0x[a-fA-F0-9]{40}/g;

    for (const [, msg] of messages) {
      if (!msg.author || msg.author.bot) continue;
      const uid = msg.author.id;
      const name = msg.author.displayName || msg.author.username;
      const text = msg.content || "";
      const addrs = text.match(addressRegex);
      if (addrs || text.toLowerCase().includes("aigent")) {
        if (!userMap.has(uid)) {
          userMap.set(uid, { handle: name, messages: [] });
        }
        userMap.get(uid)!.messages.push(text);
      }
    }

    const users: CommunityUser[] = [];
    for (const [uid, data] of userMap) {
      const allText = data.messages.join(" | ");
      const addrs = allText.match(addressRegex) || [];
      users.push({
        handle: data.handle,
        platform: "discord",
        userId: uid,
        address: addrs[0] || "",
        messageCount: data.messages.length,
        content: allText.slice(0, 200),
      });
    }
    console.log(`  Discord: ${users.length} 个活跃用户`);
    return users;
  } catch (e: any) {
    console.log(`  ❌ Discord 扫描失败: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════
//  统一扫描: 合并两个平台
// ═══════════════════════════════════════════

async function scanCommunity(): Promise<CommunityUser[]> {
  const [tgUsers, dcUsers] = await Promise.all([
    scanTelegram(),
    scanDiscord(),
  ]);
  // Dedupe by address
  const seen = new Set<string>();
  const merged: CommunityUser[] = [];
  for (const u of [...tgUsers, ...dcUsers]) {
    const key = u.address || u.userId;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(u);
    }
  }
  console.log(`\n📊 社区总计: ${merged.length} 个去重用户 (TG:${tgUsers.length} + DC:${dcUsers.length})`);
  return merged;
}

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
//  工具 2: AI 选优质用户
// ═══════════════════════════════════════════

async function selectQualityUsers(users: CommunityUser[]): Promise<
  { handle: string; address: string; reason: string; pointsAward: number }[]
> {
  if (users.length === 0) return [];

  const model = anthropic("claude-sonnet-4-6");
  const userList = users.map(u =>
    `${u.handle} [${u.platform}] | 发言:${u.messageCount}次 | 内容:"${u.content.slice(0, 100)}"`
  ).join("\n");

  const prompt = `你是一个 Web3 社区运营专家。下面是社区里讨论 AIGENT 的用户列表。
选出 3-5 个最值得空投奖励的用户（真用户、活跃、有影响力、不是机器人）。

用户列表:
${userList}

请以 JSON 数组格式回复:
[{"handle":"@xxx","reason":"为什么选","pointsAward":5}]

注意: pointsAward 是积分(不是代币数量)，1分=1000 AIGENT。基础奖励1-5分。`;

  const result = await generateText({ model, prompt, maxTokens: 500 });
  try {
    const match = result.text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    console.log("  AI 解析失败");
    return [];
  }
}

// ═══════════════════════════════════════════
//  工具 3: 批量发奖励
// ═══════════════════════════════════════════

async function batchReward(users: { address: string; pointsAward: number; reason?: string }[]) {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }
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
//  工具 4: 黑名单
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
//  工具 5: 生成运营报告
// ═══════════════════════════════════════════

async function generateReport(status: any, rewardedUsers: any[]) {
  const model = anthropic("claude-sonnet-4-6");
  const prompt = `根据以下空投运营数据，写一条社区公告（150字以内，中文）：
- 今日已领: ${status.todayClaimed} / ${status.dailyCap}
- 累计分配: ${status.totalAllocated}
- 今日奖励用户: ${rewardedUsers.length} 人
要求: 有数据、有号召、有表情符号。直接输出内容。`;

  const result = await generateText({ model, prompt, maxTokens: 300 });
  return result.text;
}

// ═══════════════════════════════════════════
//  工具 6: 回购销毁
// ═══════════════════════════════════════════

async function buybackAndBurn() {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }
  if (!USDT) { console.log("  ⚠ USDT_ADDRESS 未设置 (建池后配置)"); return; }

  console.log(`\n🔥 回购销毁 (${BUYBACK_USDT_AMOUNT} USDT → AIGENT → burn)`);
  try {
    const bal = await publicClient.readContract({
      address: AIGENT as `0x${string}`, abi: AIGENT_ABI,
      functionName: "balanceOf", args: [verifierAccount!.address],
    }) as bigint;

    if (bal > BigInt(100000) * BigInt(1e18)) {
      const burnAmount = BigInt(10000) * BigInt(1e18);
      const hash = await verifierWallet!.writeContract({
        address: AIGENT as `0x${string}`, abi: AIGENT_ABI,
        functionName: "burn", args: [burnAmount],
        account: verifierAccount!, chain: xLayer,
      });
      console.log(`  ✅ 销毁完成: ${hash}`);
    } else {
      console.log("  ⚠ 余额不足，跳过销毁");
    }
  } catch (e: any) { console.log(`  ❌ 销毁失败: ${e.message}`); }
}

// ═══════════════════════════════════════════
//  工具 7: 每日抽奖
// ═══════════════════════════════════════════

async function dailyLottery() {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }
  console.log("\n🎰 每日抽奖...");

  const users = await scanCommunity();
  const entries = users.filter(u => u.content.toLowerCase().includes("/lottery") && u.address);

  if (entries.length === 0) {
    console.log("  今日无人报名");
    await sendMessage("🎰 今日抽奖无人报名，明天再来！\n发送 /lottery + 你的钱包地址 即可参与");
    return;
  }

  const tierWeights = [0, 1, 3, 6, 10, 20];
  const weighted: { addr: string; weight: number; handle: string }[] = [];
  for (const e of entries) {
    try {
      const player = await publicClient.readContract({
        address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI,
        functionName: "getPlayer", args: [e.address as `0x${string}`],
      });
      const tier = (player as any)[0] as number;
      weighted.push({ addr: e.address, weight: tierWeights[tier] || 1, handle: e.handle });
    } catch {
      weighted.push({ addr: e.address, weight: 1, handle: e.handle });
    }
  }

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  let roll = Math.floor(Math.random() * totalWeight);
  let winner = weighted[0];
  for (const w of weighted) { roll -= w.weight; if (roll < 0) { winner = w; break; } }

  const prizeAmounts = [0, 100, 500, 1000, 5000, 10000];
  let tier = 1;
  try {
    const p = await publicClient.readContract({
      address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI,
      functionName: "getPlayer", args: [winner.addr as `0x${string}`],
    });
    tier = (p as any)[0] as number || 1;
  } catch {}
  const prize = prizeAmounts[tier] || 100;

  await batchReward([{ address: winner.addr, pointsAward: Math.ceil(prize / 1000), reason: "每日抽奖" }]);

  await sendMessage(`🎰 每日抽奖开奖!\n\n🏆 中奖: ${winner.addr.slice(0, 10)}...\n🎁 奖品: ${prize} AIGENT\n📊 参与人数: ${entries.length}\n\n明天继续! 发送 /lottery 报名`);
}

// ═══════════════════════════════════════════
//  工具 8: 每周排行榜
// ═══════════════════════════════════════════

async function weeklyLeaderboard() {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }
  console.log("\n🏆 每周邀请排行榜...");

  const users = await scanCommunity();
  const leaderboard: { address: string; handle: string; referralCount: number }[] = [];

  for (const u of users) {
    if (!u.address) continue;
    try {
      const player = await publicClient.readContract({
        address: LOYALTY_AIRDROP as `0x${string}`, abi: LOYALTY_ABI,
        functionName: "getPlayer", args: [u.address as `0x${string}`],
      });
      const [, , , , , referralCount] = player as [number, bigint, bigint, bigint, string, bigint];
      if (referralCount > 0n) {
        leaderboard.push({ address: u.address, handle: u.handle, referralCount: Number(referralCount) });
      }
    } catch {}
  }

  leaderboard.sort((a, b) => b.referralCount - a.referralCount);

  if (leaderboard.length === 0) {
    await sendMessage("🏆 本周暂无邀请数据。\n邀请好友领取空投: https://www.aigent.ink/airdrop.html");
    return;
  }

  const top10 = leaderboard.slice(0, 10);
  let lbText = "🏆 本周邀请排行榜\n\n";
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  for (let i = 0; i < top10.length; i++) {
    lbText += `${medals[i]} ${top10[i].handle}: ${top10[i].referralCount} 人\n`;
  }

  const rewards: { address: string; pointsAward: number; reason: string }[] = [];
  for (let i = 0; i < top10.length; i++) {
    let prize = 5000;
    if (i === 0) prize = 50000;
    else if (i < 3) prize = 20000;
    rewards.push({ address: top10[i].address, pointsAward: Math.ceil(prize / 1000), reason: `周榜第${i + 1}名` });
  }

  if (rewards.length > 0) await batchReward(rewards);
  lbText += "\n💰 奖励已发放到链上!";
  await sendMessage(lbText);
}

// ═══════════════════════════════════════════
//  Bot 命令处理 (统一)
// ═══════════════════════════════════════════

const HELP_TEXT = `🤖 AIGENT 运营助手

命令:
/airdrop — 查看空投状态
/lottery — 报名每日抽奖 (需附带钱包地址)
/leaderboard — 查看邀请排行榜
/claim — 获取空投领取链接
/help — 显示此帮助

🌐 空投页面: https://www.aigent.ink/airdrop.html
💬 Discord: https://discord.gg/EzSfdPKTK8`;

async function handleCommand(cmd: string, reply: (text: string) => Promise<void>, userName: string) {
  const text = cmd.trim();

  if (text.startsWith("/start") || text.startsWith("/help")) {
    await reply(HELP_TEXT);
  } else if (text.startsWith("/airdrop")) {
    const status = await checkAirdropStatus();
    const claimed = Number(status.todayClaimed) / 1e18;
    const cap = Number(status.dailyCap) / 1e18;
    const total = Number(status.totalAllocated) / 1e18;
    await reply(`📊 AIGENT 空投状态\n\n今日: ${claimed.toLocaleString()} / ${cap.toLocaleString()} (${status.remainingPercent}% 剩余)\n累计分配: ${(total / 1e6).toFixed(1)}M AIGENT\n\n🔗 领取: https://www.aigent.ink/airdrop.html`);
  } else if (text.startsWith("/lottery")) {
    const addrMatch = text.match(/0x[a-fA-F0-9]{40}/);
    if (!addrMatch) {
      await reply("🎰 请提供你的钱包地址:\n/lottery 0x你的地址");
    } else {
      await reply(`✅ ${userName} 已报名今日抽奖!\n地址: ${addrMatch[0].slice(0, 10)}...\n每日 00:00 UTC 开奖`);
      console.log(`  抽奖报名: ${userName} (${addrMatch[0]})`);
    }
  } else if (text.startsWith("/leaderboard")) {
    await reply("🏆 排行榜每周日结算\n数据从链上读取，按邀请人数排名\n\n🥇 第1名: 50,000 AIGENT\n🥈 第2-3名: 20,000 AIGENT\n🥉 第4-10名: 5,000 AIGENT\n\n邀请链接: https://www.aigent.ink/airdrop.html?ref=你的地址");
  } else if (text.startsWith("/claim")) {
    await reply(`🎁 领取 AIGENT 空投\n\n1. 打开 https://www.aigent.ink/airdrop.html\n2. 连接钱包\n3. 点击"领取 1,000 AIGENT"\n\n🏆 完成任务升级，最高拿 50,000 AIGENT!`);
  }
}

// ═══════════════════════════════════════════
//  Telegram Bot (轮询)
// ═══════════════════════════════════════════

let tgLastUpdateId = 0;

async function startTelegramBot(): Promise<void> {
  if (!TG_TOKEN) {
    console.log("⚠ Telegram 未配置 (TELEGRAM_BOT_TOKEN 为空)");
    return;
  }

  console.log("🤖 Telegram Bot 启动 (轮询模式)...");
  if (TG_CHAT_ID) {
    await sendMessage("🤖 AIGENT 运营 Agent 已上线!\n\n命令:\n/airdrop — 查看空投状态\n/lottery — 报名每日抽奖\n/leaderboard — 查看排行榜\n/help — 帮助");
  }

  while (true) {
    try {
      const result = await tgApi("getUpdates", { offset: tgLastUpdateId + 1, timeout: 30 });
      if (result.ok && result.result) {
        for (const upd of result.result) {
          tgLastUpdateId = upd.update_id;
          const msg = upd.message || upd.channel_post;
          if (!msg || !msg.text) continue;

          const chatId = msg.chat.id;
          const from = msg.from;
          const name = from?.username ? `@${from.username}` : (from?.first_name || "用户");

          await handleCommand(
            msg.text,
            async (replyText) => {
              await tgApi("sendMessage", {
                chat_id: chatId,
                text: replyText,
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
            },
            name,
          );
        }
      }
    } catch (e: any) {
      if (!e.message?.includes("timeout")) {
        console.log(`  TG Bot 错误: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
}

// ═══════════════════════════════════════════
//  Discord Bot (Gateway WebSocket)
// ═══════════════════════════════════════════

async function startDiscordBot(): Promise<void> {
  if (!DC_TOKEN) {
    console.log("⚠ Discord 未配置 (DISCORD_BOT_TOKEN 为空)");
    return;
  }

  console.log("🤖 Discord Bot 启动 (Gateway 模式)...");

  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const readyPromise = new Promise<void>((resolve) => {
    discordClient!.once("clientReady", () => resolve());
  });

  discordClient.on("clientReady", async () => {
    console.log(`  ✅ Discord 已登录: ${discordClient!.user?.tag}`);
    // Send online notice
    if (DC_CHANNEL_ID) {
      const ch = await getDiscordChannel();
      if (ch) {
        await ch.send("🤖 AIGENT 运营 Agent 已上线!\n\n命令:\n/airdrop /lottery /leaderboard /claim /help");
      }
    }
  });

  discordClient.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith("/")) return;

    // Only respond in configured channel or DMs
    if (DC_CHANNEL_ID && msg.channel.id !== DC_CHANNEL_ID) return;

    const name = msg.author.displayName || msg.author.username;
    await handleCommand(
      msg.content,
      async (replyText) => {
        // Clean HTML tags for Discord
        const clean = replyText.replace(/<[^>]*>/g, "");
        if (clean.length <= 2000) {
          await msg.reply(clean);
        } else {
          await msg.reply(clean.slice(0, 1990) + "...");
        }
      },
      name,
    );
  });

  discordClient.on("error", (e) => {
    console.log(`  DC Bot 错误: ${e.message}`);
  });

  await discordClient.login(DC_TOKEN);
  await readyPromise; // Wait for clientReady event
}

// ═══════════════════════════════════════════
//  启动所有 Bot
// ═══════════════════════════════════════════

async function startAllBots(): Promise<void> {
  // Run both bots concurrently
  await Promise.all([
    startDiscordBot(),
    startTelegramBot(),
  ]);
}

// ═══════════════════════════════════════════
//  主循环
// ═══════════════════════════════════════════

async function mainLoop() {
  console.log("╔══════════════════════════════════╗");
  console.log("║  🤖 AIGENT 运营 Agent v4.0      ║");
  console.log("║  Discord + Telegram 双平台      ║");
  console.log("╚══════════════════════════════════╝\n");

  // 1. 检查合约
  console.log("📊 Step 1: 合约状态");
  const status = await checkAirdropStatus();
  console.log(`  今日: ${status.todayClaimed}/${status.dailyCap} (${status.remainingPercent}%剩余)`);
  console.log(`  累计: ${(Number(status.totalAllocated) / 1e18).toLocaleString()} AIGENT`);

  // 2. 扫描社区
  console.log("\n📡 Step 2: 扫描社区");
  const users = await scanCommunity();

  // 3. AI 精选
  console.log("\n🧠 Step 3: AI 筛选");
  const selected = await selectQualityUsers(users);

  // 4-5. 发奖 + 报告
  if (selected.length > 0) {
    console.log("\n💰 Step 4: 发奖");
    await batchReward(selected.map(s => ({
      address: s.address, pointsAward: s.pointsAward, reason: s.reason,
    })));

    console.log("\n📝 Step 5: 运营报告");
    const report = await generateReport(status, selected);
    console.log(`\n  ${report}`);
    await sendMessage(report);
  } else {
    console.log("\n  ℹ️ 今日无优质用户");
    const msg = `📊 AIGENT 空投日报\n\n今日已领: ${(Number(status.todayClaimed)/1e18).toLocaleString()} AIGENT\n剩余: ${status.remainingPercent}%\n累计: ${(Number(status.totalAllocated)/1e18).toLocaleString()} AIGENT\n\n🔗 https://www.aigent.ink/airdrop.html`;
    await sendMessage(msg);
  }

  // 6. 抽奖
  console.log("\n🎰 Step 6: 每日抽奖");
  await dailyLottery();

  // 7. 周榜 (周日 UTC)
  if (new Date().getUTCDay() === 0) {
    console.log("\n🏆 Step 7: 每周排行榜");
    await weeklyLeaderboard();
  }

  // 8. 回购
  console.log("\n🔥 Step 8: 回购销毁");
  await buybackAndBurn();

  console.log("\n✅ 本轮运营完成\n");
}

// ── CLI ──
const mode = process.argv[2] || "--auto";

(async () => {
  switch (mode) {
    case "--bot":
      await startAllBots();
      break;
    case "--auto":
      // Start bots FIRST, then run main loop
      await startAllBots();
      await mainLoop().catch(console.error);
      setInterval(() => mainLoop().catch(console.error), 4 * 60 * 60 * 1000);
      break;
    case "--scan":
      const users = await scanCommunity();
      console.log(`\n扫描结果: ${users.length} 个去重用户`);
      users.forEach(u => console.log(`  [${u.platform}] ${u.handle} | 发言${u.messageCount}次 | ${u.address ? u.address.slice(0,10)+'...' : '无地址'}`));
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
      console.log("Usage: npx tsx agent/airdrop-agent.ts [--auto|--scan|--reward|--lottery|--leaderboard|--buyback|--bot]");
  }
})();
