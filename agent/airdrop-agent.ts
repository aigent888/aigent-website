/**
 * AIGENT AI 运营 Agent v3.0 — Telegram 集成版
 *
 * 用法:
 *   npx tsx agent.ts --auto          # 全自动模式 (每4小时一轮)
 *   npx tsx agent.ts --scan          # 扫描 Telegram 群，选优质用户
 *   npx tsx agent.ts --reward        # 给扫描出来的用户发奖励
 *   npx tsx agent.ts --lottery       # 执行每日抽奖
 *   npx tsx agent.ts --leaderboard   # 发放每周排行榜奖励
 *   npx tsx agent.ts --buyback       # 执行一次回购销毁
 *   npx tsx agent.ts --bot           # 启动 Telegram Bot (长驻，响应指令)
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
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || ""; // 群组或频道 ID

// 回购配置 (建池后填)
const USDT = process.env.USDT_ADDRESS || "";
const BUYBACK_USDT_AMOUNT = 20;

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
//  Telegram API 工具
// ═══════════════════════════════════════════

async function tgApi(method: string, body: Record<string, any> = {}) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendTgMessage(text: string) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("  ⚠ TELEGRAM 未配置，跳过发送");
    return;
  }
  try {
    await tgApi("sendMessage", {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    console.log("  📤 已发送到 Telegram");
  } catch (e: any) {
    console.log(`  ❌ Telegram 发送失败: ${e.message}`);
  }
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
//  工具 2: 扫描 Telegram 群消息
// ═══════════════════════════════════════════

interface TgUser {
  handle: string;        // Telegram username 或 first_name
  userId: number;        // Telegram user ID
  address: string;       // 钱包地址 (从消息中提取)
  messageCount: number;  // 发言次数
  content: string;       // 最近发言内容
}

async function scanTelegramGroup(): Promise<TgUser[]> {
  console.log(`\n📡 扫描 Telegram 群...`);

  if (!TELEGRAM_TOKEN) {
    console.log("  ⚠ TELEGRAM_BOT_TOKEN 未设置");
    return [];
  }

  try {
    // 获取最近 100 条消息
    const result = await tgApi("getUpdates", { limit: 100, timeout: 5 });
    if (!result.ok || !result.result) {
      console.log("  ⚠ 获取消息失败，请确认 Bot 已加入群组并具有读取权限");
      return [];
    }

    const updates = result.result;
    console.log(`  获取到 ${updates.length} 条更新`);

    // 提取用户和钱包地址
    const userMap = new Map<number, { handle: string; messages: string[] }>();
    const addressRegex = /0x[a-fA-F0-9]{40}/g;

    for (const upd of updates) {
      const msg = upd.message || upd.channel_post;
      if (!msg || !msg.from) continue;

      const from = msg.from;
      const userId = from.id;
      const name = from.username ? `@${from.username}` : (from.first_name || `user_${userId}`);
      const text = msg.text || msg.caption || "";

      // 提取钱包地址
      const addrs = text.match(addressRegex);
      if (addrs || text.toLowerCase().includes("aigent")) {
        if (!userMap.has(userId)) {
          userMap.set(userId, { handle: name, messages: [] });
        }
        userMap.get(userId)!.messages.push(text);
      }
    }

    const users: TgUser[] = [];
    for (const [userId, data] of userMap) {
      const allText = data.messages.join(" | ");
      const addrs = allText.match(addressRegex) || [];
      users.push({
        handle: data.handle,
        userId,
        address: addrs[0] || "",
        messageCount: data.messages.length,
        content: allText.slice(0, 200),
      });
    }

    console.log(`  识别到 ${users.length} 个活跃用户`);
    return users;
  } catch (e: any) {
    console.log(`  ❌ 扫描失败: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════
//  工具 3: AI 选优质用户
// ═══════════════════════════════════════════

async function selectQualityUsers(users: TgUser[]): Promise<
  { handle: string; address: string; reason: string; pointsAward: number }[]
> {
  if (users.length === 0) return [];

  const model = anthropic("claude-sonnet-4-6");
  const userList = users.map(u =>
    `${u.handle} (ID:${u.userId}) | 发言:${u.messageCount}次 | 内容:"${u.content.slice(0, 100)}"`
  ).join("\n");

  const prompt = `你是一个 Web3 社区运营专家。下面是 Telegram 群里讨论 AIGENT 的用户列表。
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
  const prompt = `根据以下空投运营数据，写一条 Telegram 群公告（150字以内，中文）：
- 今日已领: ${status.todayClaimed} / ${status.dailyCap}
- 累计分配: ${status.totalAllocated}
- 今日奖励用户: ${rewardedUsers.length} 人
要求: 有数据、有号召、有表情符号。直接输出内容，不要标题。`;

  const result = await generateText({ model, prompt, maxTokens: 300 });
  return result.text;
}

// ═══════════════════════════════════════════
//  工具 7: 回购销毁
// ═══════════════════════════════════════════

async function buybackAndBurn() {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }
  if (!USDT) { console.log("  ⚠ USDT_ADDRESS 未设置 (建池后配置)"); return; }

  console.log(`\n🔥 回购销毁 (${BUYBACK_USDT_AMOUNT} USDT → AIGENT → burn)`);
  // 简化为直接 burn Agent 钱包的部分 AIGENT
  // 完整版需 Uniswap swap 后 burn
  try {
    const bal = await publicClient.readContract({
      address: AIGENT as `0x${string}`, abi: AIGENT_ABI,
      functionName: "balanceOf", args: [verifierAccount!.address],
    }) as bigint;

    if (bal > BigInt(100000) * BigInt(1e18)) { // > 10万才烧
      const burnAmount = BigInt(10000) * BigInt(1e18); // 烧1万
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
//  工具 8: 每日抽奖
// ═══════════════════════════════════════════

async function dailyLottery() {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }
  console.log("\n🎰 每日抽奖...");

  // 从 Telegram 消息中提取报名用户
  const users = await scanTelegramGroup();
  const entries = users.filter(u => u.content.toLowerCase().includes("/lottery") && u.address);

  if (entries.length === 0) {
    console.log("  今日无人报名");
    await sendTgMessage("🎰 今日抽奖无人报名，明天再来！\n发送 /lottery + 你的钱包地址 即可参与");
    return;
  }

  // 加权随机 (从合约读层级)
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

  // 加权抽选
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  let roll = Math.floor(Math.random() * totalWeight);
  let winner = weighted[0];
  for (const w of weighted) { roll -= w.weight; if (roll < 0) { winner = w; break; } }

  const prizeAmounts = [0, 100, 500, 1000, 5000, 10000];
  // Read tier again for prize
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

  const msg = `🎰 <b>每日抽奖开奖!</b>\n\n🏆 中奖: <code>${winner.addr.slice(0, 10)}...</code>\n🎁 奖品: <b>${prize} AIGENT</b>\n📊 参与人数: ${entries.length}\n\n明天继续! 发送 /lottery 报名`;
  await sendTgMessage(msg);
}

// ═══════════════════════════════════════════
//  工具 9: 每周邀请排行榜
// ═══════════════════════════════════════════

async function weeklyLeaderboard() {
  if (!verifierWallet) { console.log("  ⚠ VERIFIER_PRIVATE_KEY 未设置"); return; }
  console.log("\n🏆 每周邀请排行榜...");

  // 从 Telegram 群获取活跃用户，查链上推荐数据
  const users = await scanTelegramGroup();
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
    await sendTgMessage("🏆 本周暂无邀请数据。\n邀请好友领取空投，链接在: https://aigent.cc/airdrop.html");
    return;
  }

  const top10 = leaderboard.slice(0, 10);

  // 构建排行榜消息
  let lbText = "🏆 <b>本周邀请排行榜</b>\n\n";
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  for (let i = 0; i < top10.length; i++) {
    lbText += `${medals[i]} ${top10[i].handle}: <b>${top10[i].referralCount}</b> 人\n`;
  }

  // 发奖
  const rewards: { address: string; pointsAward: number; reason: string }[] = [];
  for (let i = 0; i < top10.length; i++) {
    let prize = 5000;
    if (i === 0) prize = 50000;
    else if (i < 3) prize = 20000;
    rewards.push({ address: top10[i].address, pointsAward: Math.ceil(prize / 1000), reason: `周榜第${i + 1}名` });
  }

  if (rewards.length > 0) await batchReward(rewards);

  lbText += "\n💰 奖励已发放到链上!";
  await sendTgMessage(lbText);
}

// ═══════════════════════════════════════════
//  Telegram Bot 长驻 (响应指令)
// ═══════════════════════════════════════════

let lastUpdateId = 0;

async function startBot() {
  if (!TELEGRAM_TOKEN) {
    console.log("❌ TELEGRAM_BOT_TOKEN 未设置");
    console.log("   请在 .env 中设置 TELEGRAM_BOT_TOKEN=你的token");
    return;
  }

  console.log("🤖 Telegram Bot 启动中...");

  // 发送上线通知
  if (TELEGRAM_CHAT_ID) {
    await sendTgMessage("🤖 AIGENT 运营 Agent 已上线!\n\n命令:\n/airdrop — 查看空投状态\n/lottery — 报名每日抽奖\n/leaderboard — 查看排行榜\n/help — 帮助");
  }

  // 轮询消息
  while (true) {
    try {
      const result = await tgApi("getUpdates", { offset: lastUpdateId + 1, timeout: 30 });
      if (result.ok && result.result) {
        for (const upd of result.result) {
          lastUpdateId = upd.update_id;
          const msg = upd.message || upd.channel_post;
          if (!msg || !msg.text) continue;

          const text = msg.text.trim();
          const chatId = msg.chat.id;
          const from = msg.from;
          const name = from?.username ? `@${from.username}` : (from?.first_name || "用户");

          // ── 命令处理 ──
          if (text.startsWith("/start") || text.startsWith("/help")) {
            await tgApi("sendMessage", {
              chat_id: chatId,
              text: `🤖 <b>AIGENT 运营助手</b>\n\n命令列表:\n/airdrop — 查看当前空投状态\n/lottery — 报名每日抽奖 (需附带钱包地址)\n/leaderboard — 查看邀请排行榜\n/claim — 获取空投领取链接\n/help — 显示此帮助\n\n🌐 空投页面: https://aigent.cc/airdrop.html`,
              parse_mode: "HTML",
            });
          } else if (text.startsWith("/airdrop")) {
            const status = await checkAirdropStatus();
            const claimed = Number(status.todayClaimed) / 1e18;
            const cap = Number(status.dailyCap) / 1e18;
            const total = Number(status.totalAllocated) / 1e18;
            await tgApi("sendMessage", {
              chat_id: chatId,
              text: `📊 <b>AIGENT 空投状态</b>\n\n今日: <b>${claimed.toLocaleString()}</b> / ${cap.toLocaleString()} (${status.remainingPercent}% 剩余)\n累计分配: <b>${(total / 1e6).toFixed(1)}M</b> AIGENT\n\n🔗 领取: https://aigent.cc/airdrop.html`,
              parse_mode: "HTML",
            });
          } else if (text.startsWith("/lottery")) {
            const addrMatch = text.match(/0x[a-fA-F0-9]{40}/);
            if (!addrMatch) {
              await tgApi("sendMessage", {
                chat_id: chatId,
                text: "🎰 请提供你的钱包地址:\n/lottery 0x你的地址",
              });
            } else {
              // 存储报名 (生产环境用 KV/数据库)
              await tgApi("sendMessage", {
                chat_id: chatId,
                text: `✅ ${name} 已报名今日抽奖!\n地址: <code>${addrMatch[0].slice(0, 10)}...</code>\n每日 00:00 UTC 开奖`,
                parse_mode: "HTML",
              });
              console.log(`  抽奖报名: ${name} (${addrMatch[0]})`);
            }
          } else if (text.startsWith("/leaderboard")) {
            await tgApi("sendMessage", {
              chat_id: chatId,
              text: "🏆 排行榜每周日结算\n数据从链上读取，按邀请人数排名\n\n🥇 第1名: 50,000 AIGENT\n🥈 第2-3名: 20,000 AIGENT\n🥉 第4-10名: 5,000 AIGENT\n\n邀请链接: https://aigent.cc/airdrop.html?ref=你的地址",
              parse_mode: "HTML",
            });
          } else if (text.startsWith("/claim")) {
            await tgApi("sendMessage", {
              chat_id: chatId,
              text: `🎁 <b>领取 AIGENT 空投</b>\n\n1. 打开 https://aigent.cc/airdrop.html\n2. 连接钱包\n3. 点击"领取 1,000 AIGENT"\n\n🏆 完成任务升级，最高拿 50,000 AIGENT!`,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            });
          } else if (text.toLowerCase().includes("aigent") || text.match(/0x[a-fA-F0-9]{40}/)) {
            // 有人讨论 AIGENT 或分享钱包 → 静默记录，不回复
            console.log(`  👤 ${name}: ${text.slice(0, 80)}`);
          }
        }
      }
    } catch (e: any) {
      console.log(`  Bot 轮询错误: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ═══════════════════════════════════════════
//  主循环 (定时运营)
// ═══════════════════════════════════════════

async function mainLoop() {
  console.log("╔══════════════════════════════════╗");
  console.log("║  🤖 AIGENT 运营 Agent v3.0      ║");
  console.log("║  📡 Telegram 集成版             ║");
  console.log("╚══════════════════════════════════╝\n");

  // 1. 检查空投合约状态
  console.log("📊 Step 1: 检查合约状态");
  const status = await checkAirdropStatus();
  console.log(`  今日额度: ${status.todayClaimed}/${status.dailyCap} (${status.remainingPercent}%剩余)`);
  console.log(`  累计分配: ${(Number(status.totalAllocated) / 1e18).toLocaleString()} AIGENT`);

  // 2. 扫描 Telegram 群
  console.log("\n📡 Step 2: 扫描 Telegram 群");
  const users = await scanTelegramGroup();

  // 3. AI 选优质用户
  console.log("\n🧠 Step 3: AI 筛选优质用户");
  const selected = await selectQualityUsers(users);

  if (selected.length > 0) {
    // 4. 发奖励
    console.log("\n💰 Step 4: 发奖励");
    await batchReward(selected.map(s => ({
      address: s.address, pointsAward: s.pointsAward, reason: s.reason,
    })));

    // 5. 生成并发送运营报告到 Telegram
    console.log("\n📝 Step 5: 生成运营报告 → Telegram");
    const report = await generateReport(status, selected);
    console.log(`\n  报告内容:\n  ${report}`);
    await sendTgMessage(report);
  } else {
    console.log("\n  ℹ️ 今天没有发现优质用户");
    const statusMsg = `📊 AIGENT 空投日报\n\n今日已领: ${(Number(status.todayClaimed)/1e18).toLocaleString()} AIGENT\n剩余额度: ${status.remainingPercent}%\n累计分配: ${(Number(status.totalAllocated)/1e18).toLocaleString()} AIGENT\n\n🔗 https://aigent.cc/airdrop.html`;
    await sendTgMessage(statusMsg);
  }

  // 6. 每日抽奖
  console.log("\n🎰 Step 6: 每日抽奖");
  await dailyLottery();

  // 7. 每周排行榜 (周日执行)
  const dayOfWeek = new Date().getUTCDay();
  if (dayOfWeek === 0) {
    console.log("\n🏆 Step 7: 每周排行榜");
    await weeklyLeaderboard();
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
    case "--bot":
      // 长驻模式: 只启动 Bot，不跑运营循环
      await startBot();
      break;
    case "--auto":
      // 先跑一轮运营，再启动 Bot，然后每4小时运营
      await mainLoop().catch(console.error);
      console.log("\n🤖 启动 Telegram Bot...\n");
      startBot().catch(console.error);
      setInterval(() => mainLoop().catch(console.error), 4 * 60 * 60 * 1000);
      break;
    case "--scan":
      const users = await scanTelegramGroup();
      console.log(`扫描结果: ${users.length} 个活跃用户`);
      users.forEach(u => console.log(`  ${u.handle} | 发言${u.messageCount}次 | ${u.address ? u.address.slice(0,10)+'...' : '无地址'}`));
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
      console.log("Usage: npx tsx agent.ts [--auto|--scan|--reward|--lottery|--leaderboard|--buyback|--bot]");
  }
})();
