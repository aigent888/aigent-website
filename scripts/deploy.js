/**
 * Deploy AIGENTLoyaltyAirdrop to X Layer mainnet
 * Usage: node scripts/deploy.js
 */
require("dotenv").config();
const solc = require("solc");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const AIGENT = "0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39";
const RPC_URL = process.env.RPC_URL || "https://rpc.xlayer.tech";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("❌ PRIVATE_KEY not set in .env");
  process.exit(1);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`Deployer: ${wallet.address}`);

  // ── Compile ──
  console.log("Compiling AIGENTLoyaltyAirdrop.sol...");

  const contractPath = path.join(__dirname, "..", "contracts", "AIGENTLoyaltyAirdrop.sol");
  const source = fs.readFileSync(contractPath, "utf8");

  function findImport(importPath) {
    const nodeModules = path.join(__dirname, "..", "node_modules");
    const resolved = path.join(nodeModules, importPath);
    if (fs.existsSync(resolved)) {
      return { contents: fs.readFileSync(resolved, "utf8") };
    }
    return { error: `Import not found: ${importPath}` };
  }

  const input = {
    language: "Solidity",
    sources: {
      "AIGENTLoyaltyAirdrop.sol": { content: source },
    },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  };

  const compiled = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

  if (compiled.errors) {
    const errors = compiled.errors.filter(e => e.severity === "error");
    if (errors.length > 0) {
      console.error("Compilation errors:");
      errors.forEach(e => console.error(`  ${e.formattedMessage}`));
      process.exit(1);
    }
  }

  const contract = compiled.contracts["AIGENTLoyaltyAirdrop.sol"]["AIGENTLoyaltyAirdrop"];
  const abi = contract.abi;
  const bytecode = "0x" + contract.evm.bytecode.object;

  console.log(`Bytecode size: ${bytecode.length / 2} bytes`);

  // ── Deploy ──
  console.log(`\nDeploying to X Layer...`);
  console.log(`  AIGENT token: ${AIGENT}`);
  console.log(`  Verifier:     ${wallet.address}`);
  console.log(`  RPC:          ${RPC_URL}`);

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const deployed = await factory.deploy(AIGENT, wallet.address);
  await deployed.waitForDeployment();

  const address = await deployed.getAddress();
  console.log(`\n✅ Deployed at: ${address}`);

  // ── Write artifacts ──
  const deployFile = path.join(__dirname, "..", "deploy.json");
  fs.writeFileSync(deployFile, JSON.stringify({
    contract: "AIGENTLoyaltyAirdrop",
    address,
    deployer: wallet.address,
    verifier: wallet.address,
    aigent: AIGENT,
    chain: "X Layer",
    chainId: 196,
    deployedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`Artifacts saved to deploy.json`);

  // ── Write ABI for frontend ──
  fs.writeFileSync(
    path.join(__dirname, "..", "loyalty-abi.json"),
    JSON.stringify(abi, null, 2)
  );
  console.log(`ABI saved to loyalty-abi.json`);
}

main().catch(e => {
  console.error(`\n❌ Deployment failed: ${e.message}`);
  process.exit(1);
});
