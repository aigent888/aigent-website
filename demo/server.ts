/**
 * AIGENT AI Agent Web Demo Server
 *
 * Provides POST /api/chat for the website's AI Agent Console.
 * Two modes:
 *   - Simulated (default): regex + templates, no API key needed
 *   - AI (opt-in): uses Vercel AI SDK when LLM API key is set
 *
 * Usage:
 *   cd demo && npx tsx server.ts
 *   Server starts on http://localhost:3721
 */

import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = parseInt(process.env.PORT || "3721", 10);
const AIGENT = "0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39";

// ── CORS + JSON helpers ──

function setCORS(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: http.ServerResponse, code: number, body: unknown) {
  setCORS(res);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

// ── Intent Parser ──

interface ParsedIntent {
  intent: "balance" | "supply" | "transfer" | "deploy" | "trade" | "help" | "greet" | "unknown";
  params?: { to?: string; amount?: string; name?: string; symbol?: string; supply?: string; action?: "buy" | "sell" };
  confidence: number;
}

function parseChineseNumber(t: string): number | null {
  // Map Chinese numeral chars to values
  const map: Record<string, number> = { 零:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10, 百:100, 千:1000, 万:10000, 亿:100000000 };
  // Also try to parse Arabic numerals first
  const arabicMatch = t.match(/(\d+(?:\.\d+)?)\s*(万|亿|万亿|k|m|b|million|billion|trillion)?/i);
  if (arabicMatch) {
    let n = parseFloat(arabicMatch[1]);
    const u = (arabicMatch[2] || "").toLowerCase();
    if (u === "万") n *= 1e4;
    else if (u === "亿") n *= 1e8;
    else if (u === "万亿") n *= 1e12;
    else if (u === "k") n *= 1e3;
    else if (u === "m" || u === "million") n *= 1e6;
    else if (u === "b" || u === "billion") n *= 1e9;
    else if (u === "trillion") n *= 1e12;
    return n;
  }
  // Pure Chinese: "一百二十万" → 1,200,000
  const re = /([一二两三四五六七八九十百千万亿]+)/g;
  const m = t.match(re);
  if (!m) return null;
  for (const segment of m) {
    let result = 0;
    let current = 0;
    let hasUnit = false;
    for (let i = 0; i < segment.length; i++) {
      const ch = segment[i];
      const val = map[ch];
      if (val === undefined) continue;
      hasUnit = hasUnit || val >= 10;
      if (val < 10) { current = val; }
      else if (val === 10 || val === 100 || val === 1000) { current = (current || 1) * val; result += current; current = 0; }
      else if (val === 10000 || val === 100000000) { current = (current || 1) * val; result += current; current = 0; }
    }
    result += current;
    if (hasUnit || result > 0) return result;
  }
  return null;
}

function parseIntent(text: string): ParsedIntent {
  const t = text.toLowerCase().trim();

  // Greetings
  if (/^(hi|hey|hello|yo|greet|你好|嗨|您好)/i.test(t)) return { intent: "greet", confidence: 0.95 };

  // Help
  if (/\b(help|what can you do|commands|capabilities|帮助|能做什么|功能)\b/i.test(t))
    return { intent: "help", confidence: 0.9 };

  // ── Deploy / Create token ──

  const hasDeployAction = /deploy|create|launch|make|mint|new|发|创建|部署|发行|上/i.test(t);
  const hasTokenWord = /token|coin|erc20|币|代币|令牌|土狗|meme/i.test(t);

  if (hasDeployAction && hasTokenWord) {
    // ── Name extraction ──
    // Stop before: 币,代币,符号,代号,代码,缩写,总量,供应,数量,发行,的币,的符,的符,的缩
    const stopWords = /(?:币|代币|令牌|符号|代号|代码|缩写|ticker|symbol|总量|总供应|供应量|发行量|数量)/i;
    // Pattern 1: "叫/名字/名称/called/named NAME" — capture until stop word
    const nameRe = /(?:called|named|名叫|叫做|叫|名字是?|名称是?|name\s*(?:is)?)\s*["']?([^，。,\.\s]{1,30}?)(?:[，。,\.\s]|币|代币|令牌|符号|代号|代码|缩写|ticker|symbol|总量|供应|发行|数量)/i;
    let nameM = t.match(nameRe);
    let name = nameM ? nameM[1].trim() : undefined;
    // Clean trailing junk
    if (name) {
      name = name.replace(/[的之]?(?:币种|币|代币|名字|名称|符号|代码).*$/i, "").trim();
      if (!name || name.length < 1) name = undefined;
    }
    // Pattern 2: "个币 NAME" or "代币 NAME"
    if (!name) {
      const nameRe2 = /(?:个(?:币|代币|token|coin)|币种|代币|token|coin)\s*["']?([^，。,\.\s]{1,30}?)(?:[，。,\.\s]|叫|符号|代号|代码|ticker|symbol|总量|供应|发行)/i;
      const m2 = t.match(nameRe2);
      if (m2) name = m2[1].trim();
    }

    // ── Symbol extraction ──
    let symM = t.match(/(?:symbol|ticker|符号|代码|代号|缩写)\s*["']?([a-zA-Z]{2,10})["']?/i);
    let symbol = symM ? symM[1].toUpperCase() : undefined;
    const wantsInitials = /首字母|缩写|initials|abbrev/i.test(t);

    // ── Supply extraction ──
    let supply: string | undefined;
    // "总量/供应/发行/数量 XXX"
    const supplyCtx = t.match(/(?:supply|total|总量|供应|发行量|数量)\s*(.{1,40}?)(?:[，。,\.]|$)/i);
    const supplyText = supplyCtx ? supplyCtx[1] : t;
    const cnNum = parseChineseNumber(supplyText);
    if (cnNum && cnNum >= 1) supply = cnNum.toString();

    // ── Infer name from unknown pattern: "发行一个叫XXX的币种..." → XXX is before "的币种"
    if (!name) {
      const inferRe = /(?:叫|发行|创建|部署|发)\s*(?:一个|个)?\s*["']?([^，。,\.\s叫]{1,30}?)(?:的?[币代]|[，。,\.\s]|$)/i;
      const im = t.match(inferRe);
      if (im) {
        let raw = im[1].trim();
        raw = raw.replace(/[的之]?(?:币种|币|代币|名字|名称).*$/i, "").trim();
        if (raw.length >= 1 && raw.length <= 30) name = raw;
      }
    }

    // ── Infer symbol from name if not provided ──
    if (!symbol && name) {
      if (wantsInitials) {
        // Take first letter of each word/char (up to 6 chars)
        symbol = name.replace(/[^a-zA-Z一-龥]/g, "").slice(0, 6).toUpperCase();
        // For Chinese, just take the first few chars as-is
        if (/[一-龥]/.test(symbol)) symbol = name.slice(0, 4);
      } else {
        // Use first 2-6 alphanumeric chars or Chinese
        const clean = name.replace(/[^a-zA-Z0-9一-龥]/g, "");
        symbol = clean.slice(0, 6).toUpperCase();
        if (!/[A-Z]/.test(symbol)) symbol = undefined; // pure Chinese, can't use as symbol
      }
    }

    if (name && symbol) {
      return { intent: "deploy", params: { name, symbol, supply: supply || "1000000" }, confidence: 0.85 };
    }
    if (name || symbol) {
      return {
        intent: "deploy",
        params: {
          name: name || symbol!,
          symbol: symbol || (name ? name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase() || "TOKEN" : "TOKEN"),
          supply: supply || "1000000"
        },
        confidence: 0.6,
      };
    }
    return { intent: "deploy", params: { supply: supply || "1000000" }, confidence: 0.4 };
  }

  // Trade — buy/sell on AIgent Rise bonding curve (BEFORE balance to avoid keyword conflict)
  // Patterns: "buy 100 AIGENT of DOGKING", "sell 1000 DOGKING", "buy DogKing 100", "买入 100 DOGKING"
  const tradePatterns = /\b(buy|sell|trade|swap|购买|买入|卖出|交易)\b/i;
  if (tradePatterns.test(t)) {
    const isBuy = /\b(buy|购买|买入|买)\b/i.test(t);
    const isSell = /\b(sell|卖出|卖)\b/i.test(t);
    const action = isSell ? "sell" : "buy";

    // Extract amount (number)
    const amtRe = /(\d+(?:\.\d+)?)\s*(?:AIGENT|tokens?|个|枚)?/i;
    const amtM = t.match(amtRe);
    const amount = amtM ? amtM[1] : undefined;

    // Extract symbol — prefer symbol after "of/for", skip AIGENT itself
    let symbol: string | undefined;
    const ofSymRe = /(?:of|for)\s+([A-Z]{2,10})(?:\s|$)/i;
    const ofM = t.match(ofSymRe);
    if (ofM && ofM[1].toUpperCase() !== 'AIGENT') {
      symbol = ofM[1];
    } else {
      // Try any uppercase 2-10 letter word that isn't AIGENT
      const allSymRe = /([A-Z]{2,10})(?:\s|$)/ig;
      let m2: RegExpExecArray | null;
      while ((m2 = allSymRe.exec(t)) !== null) {
        if (m2[1].toUpperCase() !== 'AIGENT') { symbol = m2[1]; break; }
      }
    }

    if (amount) {
      return { intent: "trade", params: { action, amount, symbol }, confidence: symbol ? 0.8 : 0.6 };
    }
    return { intent: "trade", params: { action, symbol }, confidence: 0.4 };
  }

  // Balance (AFTER deploy + trade checks to avoid keyword conflicts)
  if (/\b(balance|how much|check balance|show balance|my balance|my tokens|my aigent|how many (tokens|aigent) do i have|余额|查询|我有多少)\b/i.test(t))
    return { intent: "balance", confidence: 0.85 };

  // Total supply
  if (/\b(total supply|how many tokens exist|total tokens|circulation|max supply|total aigent|总供应|发行量)\b/i.test(t))
    return { intent: "supply", confidence: 0.85 };

  // Transfer - pattern: send/transfer/pay/give X to ADDRESS
  const sendRe = /(?:send|transfer|pay|give|move|转|发|发送)\s+(\d+(?:\.\d+)?)\s+(?:to\s+)?(0x[a-fA-F0-9]{40})/i;
  const sendRev = /(?:send|transfer|pay|give|move|转|发|发送)\s+(?:to\s+)?(0x[a-fA-F0-9]{40})\s+(\d+(?:\.\d+)?)/i;
  let m = t.match(sendRe) || t.match(sendRev);
  if (m) {
    const addr = m[1].startsWith("0x") ? m[1] : m[2];
    const amt = m[1].startsWith("0x") ? m[2] : m[1];
    return { intent: "transfer", params: { to: addr, amount: amt }, confidence: 0.8 };
  }

  // Fuzzy transfer: "I want to send X to ADDRESS"
  const fuzzyRe = /(?:send|transfer|pay|give|转|发).+?(\d+(?:\.\d+)?).+?(0x[a-fA-F0-9]{40})/i;
  let fm = t.match(fuzzyRe);
  if (fm) {
    return { intent: "transfer", params: { to: fm[2], amount: fm[1] }, confidence: 0.65 };
  }

  return { intent: "unknown", confidence: 0 };
}

// ── Simulated AI Response Generator ──

function generateResponse(intent: ParsedIntent, userText: string): {
  message: string;
  steps?: Array<{ title: string; detail: string }>;
  action?: string;
} {
  const addr = intent.params?.to?.toLowerCase();
  const amt = intent.params?.amount;

  switch (intent.intent) {
    case "greet":
      return {
        message: "Hello! I'm your AIGENT AI agent. I can help you:\n\n• **Deploy a token** — launch your own ERC-20 via AIgent Rise\n• **Buy tokens** — trade on the bonding curve\n• **Sell tokens** — sell back to the curve anytime\n• **Check balance** — view your AIGENT tokens\n• **Total supply** — see the 500M fixed supply\n• **Send tokens** — transfer AIGENT via gasless EIP-2612 Permit\n\nJust tell me what you want to do in plain English.",
      };

    case "help":
      return {
        message: "I'm an autonomous AI agent running on X Layer. Here's what I can do:\n\n`deploy a token called [name] symbol [SYM] supply [N]` — Launch your own ERC-20 token\n`buy 100 AIGENT of [SYMBOL]` — Buy tokens on the bonding curve\n`sell 1000 [SYMBOL]` — Sell tokens back to the curve\n`check balance` — Read your AIGENT balance from the chain\n`total supply` — View the fixed 500M total supply\n`send 100 to 0x...` — Transfer AIGENT with a gasless EIP-2611 Permit signature\n\nAll new tokens include EIP-2612 Permit for gasless transfers.",
      };

    case "balance":
      return {
        message: "Let me check your AIGENT balance on X Layer...",
        action: "balance",
      };

    case "supply":
      return {
        message: "Reading the total AIGENT supply from the contract...",
        action: "supply",
      };

    case "transfer":
      return {
        message: `I'll prepare a gasless transfer of **${amt} AIGENT** to \`${addr}\`.\n\nHere's the EIP-2612 flow:\n1. I'll build the EIP-712 typed data\n2. You sign the Permit off-chain (no OKB needed)\n3. We submit \`permit()\` + \`transferFrom()\` in sequence\n\nReady? Confirm the transaction in your wallet.`,
        action: "transfer",
        steps: [
          { title: "Parse Command", detail: `Intent: transfer ${amt} AIGENT → ${addr}` },
          { title: "Sign EIP-2612 Permit", detail: "Off-chain signature — no OKB gas required" },
          { title: "Submit permit()", detail: "On-chain Permit approval transaction" },
          { title: "Submit transferFrom()", detail: "On-chain token transfer" },
        ],
      };

    case "deploy": {
      const name = intent.params?.name || "MyToken";
      const symbol = (intent.params?.symbol || "MTK").toUpperCase();
      const supply = intent.params?.supply || "1000000";
      const supplyFormatted = parseInt(supply).toLocaleString();

      return {
        message: `🚀 **AIgent Rise** — Launching your token...\n\n` +
          `| Parameter | Value |\n|-----------|-------|\n` +
          `| Name | **${name}** |\n` +
          `| Symbol | **${symbol}** |\n` +
          `| Total Supply | **${supplyFormatted}** |\n` +
          `| Standard | ERC-20 + EIP-2612 Permit |\n` +
          `| Network | X Layer (Chain 196) |\n` +
          `| Platform Fee | 500 AIGENT |\n` +
          `| Bonding Curve | 80% supply locked |\n\n` +
          `Your token gets a **permanent bonding curve** — instantly tradable on AIgent Rise.\n` +
          `No OKB needed for approvals — just sign off-chain via EIP-2612.\n\n` +
          `Click **Launch Token** below, then confirm in your wallet. AIgent Rise will:\n` +
          `1. Collect the 500 AIGENT platform fee\n` +
          `2. Deploy ${name} ($${symbol}) + EIP-2612 Permit\n` +
          `3. Lock 80% supply on the bonding curve\n` +
          `4. Send ${supplyFormatted} $${symbol} to your address`,
        action: "deploy",
        steps: [
          { title: "Parse Request", detail: `Token: ${name} ($${symbol}), Supply: ${supplyFormatted}` },
          { title: "Check AIGENT Allowance", detail: "Approve AIGENT for BondingCurve contract" },
          { title: "Approve AIGENT Spend", detail: "Confirm approval in your wallet" },
          { title: "Launch Token + Curve", detail: "Deploy ${name} ERC-20 + bonding curve" },
          { title: "Verify on Explorer", detail: "Contract verified on OKX Explorer" },
        ],
      };
    }

    case "trade": {
      const act = intent.params?.action || "buy";
      const amt = intent.params?.amount || "0";
      const sym = intent.params?.symbol || "TOKEN";
      return {
        message: `I'll help you **${act}** on the AIgent Rise bonding curve.\n\n` +
          (act === "buy"
            ? `💰 Spending **${amt} AIGENT** to buy **${sym}** tokens at the current curve price.\n\n1. Approve AIGENT spend for the BondingCurve contract\n2. Execute buy at current price with 5% slippage\n3. Receive ${sym} tokens in your wallet\n\nReady? Confirm in your wallet.`
            : `📤 Selling **${amt} ${sym}** tokens back to the bonding curve.\n\n1. Approve ${sym} spend for BondingCurve\n2. Execute sell at current curve price\n3. Receive AIGENT in your wallet\n\nReady? Confirm in your wallet.`),
        action: "trade",
        steps: act === "buy"
          ? [
              { title: "Approve AIGENT", detail: `Allow BondingCurve to spend ${amt} AIGENT` },
              { title: "Buy on Curve", detail: `Swap ${amt} AIGENT → ${sym}` },
              { title: "Receive Tokens", detail: `${sym} transferred to your wallet` },
            ]
          : [
              { title: "Approve Token", detail: `Allow BondingCurve to spend ${amt} ${sym}` },
              { title: "Sell on Curve", detail: `Swap ${amt} ${sym} → AIGENT` },
              { title: "Receive AIGENT", detail: "AIGENT transferred to your wallet" },
            ],
      };
    }

    default:
      return {
        message: "I'm not sure what you mean. Try:\n\n• **Deploy a token called MyCoin symbol MYC supply 1000000**\n• **Buy 100 AIGENT of MYC**\n• **Sell 1000 MYC**\n• **Check my balance**\n• **What's the total supply?**\n\nOr just say **help** to see all commands.",
      };
  }
}

// ── Static file serving ──

const ROOT_DIR = path.resolve(import.meta.dirname, "..");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff2": "font/woff2",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (req.method !== "GET") return false;
  const url = req.url === "/" ? "/index.html" : req.url || "/";
  const filePath = path.join(ROOT_DIR, url);
  if (!filePath.startsWith(ROOT_DIR)) return false; // path traversal guard
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath);
  const mime = MIME[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  setCORS(res);
  res.writeHead(200, { "Content-Type": mime });
  res.end(content);
  return true;
}

// ── HTTP Server ──

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    setCORS(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Static files for GET
  if (serveStatic(req, res)) return;

  // API
  if (req.method === "POST" && req.url === "/api/chat") {
    try {
      const raw = await readBody(req);
      const { message } = JSON.parse(raw);

      if (!message || typeof message !== "string") {
        json(res, 400, { error: 'Missing "message" field' });
        return;
      }

      const intent = parseIntent(message);
      const response = generateResponse(intent, message);

      json(res, 200, {
        reply: response.message,
        intent: intent.intent,
        action: response.action,
        steps: response.steps,
        agentAddress: "0x0000000000000000000000000000000000000000", // placeholder
      });
    } catch (e: any) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`\nAIGENT Agent Server running on http://localhost:${PORT}`);
  console.log("POST /api/chat  —  { message: string }");
  console.log("Mode: simulated (no LLM API key required)");
  console.log("Press Ctrl+C to stop\n");
});
