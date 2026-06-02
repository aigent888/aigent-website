/**
 * AI Agent Gasless Transfer — EIP-2612 Permit
 *
 * This demonstrates the CORE AIGENT feature:
 *   An autonomous AI agent executes a transfer WITHOUT holding OKB.
 *
 * Run: npx tsx sdk/examples/ai-agent-permit.ts
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";
import { signPermit, gaslessTransfer, getNonce } from "../src/index.js";

async function main() {
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
  const wallet = createWalletClient({
    account,
    chain: xLayer,
    transport: http("https://rpc.xlayer.tech"),
  });

  // Simulated recipient (replace with actual AI agent address)
  const recipient = "0x0000000000000000000000000000000000000001" as `0x${string}`;
  const amount = 100n * 10n ** 18n; // 100 AIGENT

  console.log("╔═══════════════════════════════════╗");
  console.log("║  🤖 AI Agent Gasless Transfer    ║");
  console.log("╚═══════════════════════════════════╝\n");

  console.log(`Agent: ${account.address}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Amount: ${amount / 10n ** 18n} AIGENT`);
  console.log(`Nonce: ${await getNonce(publicClient, account.address)}\n`);

  // ── Step 1: Sign permit OFF-CHAIN ──
  console.log("📝 Step 1: Signing EIP-2612 Permit (off-chain, 0 gas)...");
  const spender = account.address; // self-spend for direct transfer
  const permit = await signPermit(
    wallet, account, publicClient,
    spender, amount,
  );
  console.log(`  ✅ Signed! v=${permit.v}, r=${permit.r.slice(0, 20)}...`);

  // ── Step 2: Execute transfer ON-CHAIN ──
  // In a real scenario, this would be done by a RELAYER that pays the gas.
  // The AI agent never touches OKB.
  console.log("\n🚀 Step 2: Executing permit + transfer (relayer pays gas)...");
  try {
    const hash = await gaslessTransfer(
      wallet, account, publicClient,
      recipient, amount,
    );
    console.log(`  ✅ TX: https://www.oklink.com/xlayer/tx/${hash}`);
  } catch (e) {
    console.log(`  ⚠️  ${e.message.slice(0, 100)}`);
    console.log("  (Expected if agent has no tokens — this is a demo)");
  }

  console.log("\n💡 Flow summary:");
  console.log("  1. Agent signs Permit (off-chain, 0 OKB)");
  console.log("  2. Relayer submits tx (pays ~0.0001 OKB gas)");
  console.log("  3. Agent receives/spends AIGENT without holding gas token");
  console.log("\n✅ This is why AIGENT exists.");
}

main().catch(console.error);
