/**
 * AIGENT AI Agent CLI Demo
 *
 * Usage:
 *   npx tsx agent.ts "send 100 AIGENT to 0x..."
 *   npx tsx agent.ts --repl          # interactive mode
 */

import "dotenv/config";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { aigentTools } from "@aigent/sdk";
import { createAgentContext } from "./setup";
import readline from "readline";

const SYSTEM_PROMPT = `You are an AIGENT token agent running on X Layer (Chain ID 196).
You control a wallet and can execute token operations using the tools provided.

Your capabilities:
- Send AIGENT tokens using gasless EIP-2612 permits (no OKB approval needed)
- Check AIGENT balances of any address
- View total AIGENT supply

Important facts:
- AIGENT contract: 0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39
- Total supply: 500,000,000 AIGENT
- Network: X Layer mainnet (Chain ID 196)

Always confirm transfer details before executing. Be concise in your responses.`;

function getModel() {
  const provider = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  if (provider === "openai") return openai("gpt-4o");
  return anthropic("claude-sonnet-4-6");
}

async function runSingle(prompt: string) {
  const { account, wallet, publicClient } = createAgentContext();
  const tools = aigentTools(account as any, wallet as any, publicClient as any);
  const model = getModel();

  console.log(`\nAIGENT Agent`);
  console.log(`Agent: ${account.address}`);
  console.log(`Prompt: ${prompt}\n`);
  console.log("-".repeat(50));

  const result = await generateText({
    model,
    tools: tools as any,
    system: SYSTEM_PROMPT,
    prompt,
    maxSteps: 5,
  });

  for (const tc of (result as any).toolCalls ?? []) {
    console.log(`\n[Tool: ${tc.toolName}]`, tc.args);
  }

  console.log(`\n${result.text}\n`);
  console.log("-".repeat(50));
  console.log(`Steps: ${(result as any).steps?.length ?? 1} | Finish: ${result.finishReason}`);
}

async function runRepl() {
  const { account, wallet, publicClient } = createAgentContext();
  const tools = aigentTools(account as any, wallet as any, publicClient as any);
  const model = getModel();

  console.log(`\nAIGENT Agent REPL`);
  console.log(`Agent: ${account.address}`);
  console.log('Type "exit" to quit, "balance" for quick balance check\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve));

  while (true) {
    const input = await ask("> ");
    if (!input.trim()) continue;
    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") break;

    if (/^(balance|bal)$/i.test(input.trim())) {
      try {
        const bal = await (publicClient as any).readContract({
          address: "0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39",
          abi: ["function balanceOf(address) view returns (uint256)"],
          functionName: "balanceOf",
          args: [account.address],
        });
        console.log(`  Balance: ${Number(bal) / 1e18} AIGENT\n`);
      } catch (e) { console.log("  Failed to read balance\n"); }
      continue;
    }

    console.log("  Thinking...");
    try {
      const result = await generateText({
        model,
        tools: tools as any,
        system: SYSTEM_PROMPT,
        prompt: input,
        maxSteps: 5,
      });

      for (const tc of (result as any).toolCalls ?? []) {
        console.log(`  [Tool: ${tc.toolName}]`, tc.args);
      }
      console.log(`\n  ${result.text}\n`);
    } catch (e: any) {
      console.log(`  Error: ${e.message}\n`);
    }
  }

  rl.close();
  console.log("Goodbye.\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--repl") || args.includes("-r") || args.length === 0) {
    await runRepl();
  } else {
    await runSingle(args.join(" "));
  }
}

main().catch(console.error);
