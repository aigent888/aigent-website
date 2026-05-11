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
  intent: "balance" | "supply" | "transfer" | "help" | "greet" | "unknown";
  params?: { to?: string; amount?: string };
  confidence: number;
}

function parseIntent(text: string): ParsedIntent {
  const t = text.toLowerCase().trim();

  // Greetings
  if (/^(hi|hey|hello|yo|greet)/i.test(t)) return { intent: "greet", confidence: 0.95 };

  // Help
  if (/\b(help|what can you do|commands|capabilities)\b/i.test(t))
    return { intent: "help", confidence: 0.9 };

  // Balance
  if (/\b(balance|how much|check balance|show balance|my balance|my tokens|my aigent|how many (tokens|aigent) do i have)\b/i.test(t))
    return { intent: "balance", confidence: 0.85 };

  // Total supply
  if (/\b(total supply|supply|how many tokens exist|total tokens|circulation|max supply|total aigent)\b/i.test(t))
    return { intent: "supply", confidence: 0.85 };

  // Transfer - pattern: send/transfer/pay/give X to ADDRESS
  const sendRe = /(?:send|transfer|pay|give|move)\s+(\d+(?:\.\d+)?)\s+(?:to\s+)?(0x[a-fA-F0-9]{40})/i;
  const sendRev = /(?:send|transfer|pay|give|move)\s+(?:to\s+)?(0x[a-fA-F0-9]{40})\s+(\d+(?:\.\d+)?)/i;
  let m = t.match(sendRe) || t.match(sendRev);
  if (m) {
    const addr = m[1].startsWith("0x") ? m[1] : m[2];
    const amt = m[1].startsWith("0x") ? m[2] : m[1];
    return { intent: "transfer", params: { to: addr, amount: amt }, confidence: 0.8 };
  }

  // Fuzzy transfer: "I want to send X to ADDRESS"
  const fuzzyRe = /(?:send|transfer|pay|give).+?(\d+(?:\.\d+)?).+?(0x[a-fA-F0-9]{40})/i;
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
        message: "Hello! I'm your AIGENT AI agent. I can help you:\n\n• **Check balance** — view your AIGENT tokens\n• **Total supply** — see the 500M fixed supply\n• **Send tokens** — transfer AIGENT via gasless EIP-2612 Permit\n\nJust tell me what you want to do in plain English.",
      };

    case "help":
      return {
        message: "I'm an autonomous AI agent running on X Layer. Here's what I can do:\n\n`check balance` — Read your AIGENT balance from the chain\n`total supply` — View the fixed 500M total supply\n`send 100 to 0x...` — Transfer AIGENT with a gasless EIP-2612 Permit signature\n\nAll transfers use EIP-2612: I sign off-chain, you pay zero OKB for approval.",
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

    default:
      return {
        message: "I'm not sure what you mean. Try:\n\n• **Check my balance**\n• **What's the total supply?**\n• **Send 100 to 0xAbC...**\n\nOr just say **help** to see all commands.",
      };
  }
}

// ── HTTP Server ──

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    setCORS(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/chat") {
    json(res, 404, { error: "Not found" });
    return;
  }

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
});

server.listen(PORT, () => {
  console.log(`\nAIGENT Agent Server running on http://localhost:${PORT}`);
  console.log("POST /api/chat  —  { message: string }");
  console.log("Mode: simulated (no LLM API key required)");
  console.log("Press Ctrl+C to stop\n");
});
