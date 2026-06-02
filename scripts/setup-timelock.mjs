/**
 * 部署 TimelockController 并转移 Loyalty 合约 Owner
 *
 * 步骤:
 *  1. 部署 Timelock (48h 最小延迟, deployer = proposer + executor)
 *  2. loyalty.transferOwnership(timelock地址)
 *  3. 验证
 *
 * 之后所有 owner 操作都需: propose → 等 48h → execute
 */
import { createPublicClient, createWalletClient, http, encodeFunctionData, encodeAbiParameters, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";
import "dotenv/config";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) { console.error("PRIVATE_KEY not set in .env"); process.exit(1); }

const LOYALTY_ADDRESS = "0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822";

const account = privateKeyToAccount(PRIVATE_KEY);
const pubClient = createPublicClient({ chain: xLayer, transport: http("https://rpc.xlayer.tech") });
const wallet = createWalletClient({ account, chain: xLayer, transport: http("https://rpc.xlayer.tech") });

// ── TimelockController ABI (minimal) ──
const TIMELOCK_ABI = parseAbi([
  "constructor(uint256 minDelay, address[] proposers, address[] executors, address admin)",
  "function getMinDelay() view returns (uint256)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function PROPOSER_ROLE() view returns (bytes32)",
  "function EXECUTOR_ROLE() view returns (bytes32)",
  "function CANCELLER_ROLE() view returns (bytes32)",
]);

const LOYALTY_ABI = parseAbi([
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)",
]);

// ── Step 1: Deploy Timelock ──
const MIN_DELAY = 172800n; // 48 hours
const proposers = [account.address];
const executors = [account.address];
const admin = account.address;

console.log("╔══════════════════════════════════╗");
console.log("║  🔒 Timelock 安全部署           ║");
console.log("╚══════════════════════════════════╝\n");

console.log(`Deployer: ${account.address}`);
console.log(`Min Delay: 48 hours (${MIN_DELAY}s)`);
console.log(`Proposers: ${proposers}`);
console.log(`Executors: ${executors}\n`);

// Compile and deploy TimelockController
import { readFileSync } from "fs";

// Use Hardhat-compiled artifact
const timelockArtifact = JSON.parse(
  readFileSync("artifacts/@openzeppelin/contracts/governance/TimelockController.sol/TimelockController.json", "utf-8")
);

// ABI-encode constructor args manually with encodeAbiParameters
const constructorArgs = encodeAbiParameters(
  [
    { type: "uint256", name: "minDelay" },
    { type: "address[]", name: "proposers" },
    { type: "address[]", name: "executors" },
    { type: "address", name: "admin" },
  ],
  [MIN_DELAY, proposers, executors, admin],
);

console.log("📝 Deploying TimelockController...");
const deployHash = await wallet.sendTransaction({
  data: timelockArtifact.bytecode + constructorArgs.slice(2),
  gas: 3000000n,
});
console.log(`  TX: https://www.oklink.com/xlayer/tx/${deployHash}`);

const deployReceipt = await pubClient.waitForTransactionReceipt({ hash: deployHash });
const timelockAddress = deployReceipt.contractAddress;
console.log(`  ✅ Timelock deployed: ${timelockAddress}\n`);

// Verify roles
const PROPOSER_ROLE = await pubClient.readContract({
  address: timelockAddress,
  abi: TIMELOCK_ABI,
  functionName: "PROPOSER_ROLE",
});
const hasProposerRole = await pubClient.readContract({
  address: timelockAddress,
  abi: TIMELOCK_ABI,
  functionName: "hasRole",
  args: [PROPOSER_ROLE, account.address],
});
console.log(`Deployer has PROPOSER_ROLE: ${hasProposerRole}`);

// ── Step 2: Transfer ownership of Loyalty to Timelock ──
console.log("\n📝 Transferring Loyalty ownership to Timelock...");

// First check current owner
const currentOwner = await pubClient.readContract({
  address: LOYALTY_ADDRESS,
  abi: LOYALTY_ABI,
  functionName: "owner",
});
console.log(`  Current owner: ${currentOwner}`);

const transferData = encodeFunctionData({
  abi: LOYALTY_ABI,
  functionName: "transferOwnership",
  args: [timelockAddress],
});

const transferHash = await wallet.sendTransaction({
  to: LOYALTY_ADDRESS,
  data: transferData,
  gas: 200000n,
});
console.log(`  TX: https://www.oklink.com/xlayer/tx/${transferHash}`);

await pubClient.waitForTransactionReceipt({ hash: transferHash });

// Verify
const newOwner = await pubClient.readContract({
  address: LOYALTY_ADDRESS,
  abi: LOYALTY_ABI,
  functionName: "owner",
});
console.log(`  New owner: ${newOwner}`);

if (newOwner.toLowerCase() === timelockAddress.toLowerCase()) {
  console.log("\n╔══════════════════════════════════╗");
  console.log("║  ✅ Timelock 部署成功!          ║");
  console.log("╚══════════════════════════════════╝");
  console.log(`\n  Timelock: ${timelockAddress}`);
  console.log(`  Min Delay: 48 hours`);
  console.log(`\n  以后所有 owner 操作流程:`);
  console.log(`    1. schedule() → 等 48h`);
  console.log(`    2. 社区看到链上交易，有逃生窗口`);
  console.log(`    3. execute() → 执行`);
  console.log(`\n  ⚠️ Timelock 地址请记下来，这是合约的新 Owner`);
} else {
  console.log("\n❌ Ownership transfer failed!");
}
