/**
 * Add AIGENT/USDT liquidity on Uniswap V3 (X Layer)
 * Usage: node scripts/add-liquidity.js
 *
 * Prerequisites:
 *   - AIGENT in wallet (10M at 0x38bA1dD6...)
 *   - ~1000 USDT in wallet
 *   - OKB for gas (0.018 is plenty)
 */

require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ── Config ──
const RPC_URL = process.env.RPC_URL || "https://rpc.xlayer.tech";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const AIGENT = "0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39";

// X Layer Uniswap V3 addresses (verified on-chain)
const UNI_V3_POSITION_MANAGER = "0x315e413A11AB0df498eF83873012430ca36638Ae";
const UNI_V3_FACTORY = "0x4B2ab38DBF28D31D467aA8993f6c2585981D6804";
const UNI_V3_ROUTER = "0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca";

// USDT on X Layer (OKX bridged — verified by actual withdrawal)
const USDT = "0x779ded0c9e1022225f8e0630b35a9b54be713736";

// Pool config
const AIGENT_AMOUNT = "10000000"; // 10M AIGENT
const USDT_AMOUNT = "1000";       // 1000 USDT
const AIGENT_PRICE = 0.0001;      // $0.0001 per AIGENT

// ERC20 ABI (minimal)
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// Uniswap V3 NonfungiblePositionManager ABI (relevant parts)
const POSITION_MANAGER_ABI = [
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external returns (address pool)",
];

// Uniswap V3 Factory ABI
const FACTORY_ABI = [
  "function getPool(address token0, address token1, uint24 fee) view returns (address)",
];

if (!PRIVATE_KEY) {
  console.error("❌ PRIVATE_KEY not set in .env");
  process.exit(1);
}

// ── Tick math helpers ──
// For AIGENT at $0.0001 and USDT:
// price = USDT / AIGENT = 0.0001 (1 AIGENT = 0.0001 USDT)
// sqrtPriceX96 = sqrt(price) * 2^96
// Since AIGENT < USDT (price wise), AIGENT is token0
// price = token1/token0 = USDT/AIGENT = 0.0001
function getSqrtPriceX96(price) {
  // sqrt(price) * 2^96, using BigInt to avoid overflow
  const sqrt = Math.sqrt(price);
  // Scale: multiply by 1e18 for precision, then by 2^96 / 1e18
  const Q96 = BigInt("79228162514264337593543950336"); // 2^96
  const scaled = BigInt(Math.floor(sqrt * 1e18));
  return ((scaled * Q96) / BigInt(1e18)).toString();
}

// Wide range around current price (tick ~92108)
// Must be multiples of tickSpacing (60 for 0.3%)
const currentTick = 92108;
const rangeOffset = 50000; // wide range
const TICK_SPACING = 60;
const tickLower = Math.floor((currentTick - rangeOffset) / TICK_SPACING) * TICK_SPACING;
const tickUpper = Math.ceil((currentTick + rangeOffset) / TICK_SPACING) * TICK_SPACING;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("═══════════════════════════════════════");
  console.log("  AIGENT/USDT Uniswap V3 Liquidity");
  console.log("═══════════════════════════════════════");
  console.log(`  Wallet:     ${wallet.address}`);
  console.log(`  AIGENT:     ${AIGENT}`);
  console.log(`  USDT:       ${USDT}`);
  console.log(`  Amount:     ${AIGENT_AMOUNT} AIGENT + ${USDT_AMOUNT} USDT`);
  console.log(`  Price:      $${AIGENT_PRICE}/AIGENT`);
  console.log(`  Fee tier:   0.3%`);
  console.log("═══════════════════════════════════════\n");

  const aigentToken = new ethers.Contract(AIGENT, ERC20_ABI, wallet);
  const usdtToken = new ethers.Contract(USDT, ERC20_ABI, wallet);
  const posManager = new ethers.Contract(UNI_V3_POSITION_MANAGER, POSITION_MANAGER_ABI, wallet);
  const factory = new ethers.Contract(UNI_V3_FACTORY, FACTORY_ABI, provider);

  // ── Step 0: Verify balances ──
  const [aigentDec, usdtDec, aigentSym, usdtSym] = await Promise.all([
    aigentToken.decimals(),
    usdtToken.decimals(),
    aigentToken.symbol(),
    usdtToken.symbol(),
  ]);

  const [aigentBal, usdtBal, okbBal] = await Promise.all([
    aigentToken.balanceOf(wallet.address),
    usdtToken.balanceOf(wallet.address),
    provider.getBalance(wallet.address),
  ]);

  console.log("Current balances:");
  console.log(`  ${ethers.formatUnits(aigentBal, aigentDec)} ${aigentSym}`);
  console.log(`  ${ethers.formatUnits(usdtBal, usdtDec)} ${usdtSym}`);
  console.log(`  ${ethers.formatEther(okbBal)} OKB\n`);

  const aigentWei = ethers.parseUnits(AIGENT_AMOUNT, aigentDec);
  const usdtWei = ethers.parseUnits(USDT_AMOUNT, usdtDec);

  if (aigentBal < aigentWei) {
    console.error(`❌ Insufficient AIGENT. Have ${ethers.formatUnits(aigentBal, aigentDec)}, need ${AIGENT_AMOUNT}`);
    process.exit(1);
  }
  if (usdtBal < usdtWei) {
    console.error(`❌ Insufficient USDT. Have ${ethers.formatUnits(usdtBal, usdtDec)}, need ${USDT_AMOUNT}`);
    process.exit(1);
  }

  // ── Determine token order ──
  // token0 = lower address lexicographically
  const AIGENT_LOWER = AIGENT.toLowerCase();
  const USDT_LOWER = USDT.toLowerCase();
  const token0 = AIGENT_LOWER < USDT_LOWER ? AIGENT : USDT;
  const token1 = AIGENT_LOWER < USDT_LOWER ? USDT : AIGENT;
  const isAigentToken0 = token0 === AIGENT;

  // price = token1 / token0
  // If AIGENT is token0: price = USDT/AIGENT = 0.0001
  // If USDT is token0: price = AIGENT/USDT = 10000
  const poolPrice = isAigentToken0 ? AIGENT_PRICE : (1 / AIGENT_PRICE);
  const sqrtPriceX96 = getSqrtPriceX96(poolPrice);

  const amount0 = isAigentToken0 ? aigentWei : usdtWei;
  const amount1 = isAigentToken0 ? usdtWei : aigentWei;

  console.log("Pool setup:");
  console.log(`  token0: ${isAigentToken0 ? 'AIGENT' : 'USDT'} (${token0})`);
  console.log(`  token1: ${isAigentToken0 ? 'USDT' : 'AIGENT'} (${token1})`);
  console.log(`  sqrtPriceX96: ${sqrtPriceX96}`);
  console.log(`  amount0: ${ethers.formatUnits(amount0, isAigentToken0 ? aigentDec : usdtDec)}`);
  console.log(`  amount1: ${ethers.formatUnits(amount1, isAigentToken0 ? usdtDec : aigentDec)}\n`);

  // ── Fee tier: 0.3% for volatile pairs ──
  const FEE = 3000; // 0.3%

  // ── Step 1: Check if pool exists, create if needed ──
  console.log("Step 1: Check / create pool...");
  let pool = await factory.getPool(token0, token1, FEE);
  if (pool === ethers.ZeroAddress) {
    console.log("  Pool does not exist. Creating...");
    const tx = await posManager.createAndInitializePoolIfNecessary(
      token0, token1, FEE, sqrtPriceX96
    );
    console.log(`  TX: ${tx.hash}`);
    await tx.wait();
    pool = await factory.getPool(token0, token1, FEE);
    console.log(`  Pool created: ${pool}`);
  } else {
    console.log(`  Pool exists: ${pool}`);
  }

  // ── Step 2: Approve AIGENT ──
  console.log("\nStep 2: Approve AIGENT...");
  const aigentAllowance = await aigentToken.allowance(wallet.address, UNI_V3_POSITION_MANAGER);
  if (aigentAllowance < amount0) {
    const tx = await aigentToken.approve(UNI_V3_POSITION_MANAGER, ethers.MaxUint256);
    console.log(`  TX: ${tx.hash}`);
    await tx.wait();
    console.log("  ✅ AIGENT approved");
  } else {
    console.log("  ✅ AIGENT already approved");
  }

  // ── Step 3: Approve USDT ──
  console.log("\nStep 3: Approve USDT...");
  const usdtAllowance = await usdtToken.allowance(wallet.address, UNI_V3_POSITION_MANAGER);
  if (usdtAllowance < amount1) {
    const tx = await usdtToken.approve(UNI_V3_POSITION_MANAGER, ethers.MaxUint256);
    console.log(`  TX: ${tx.hash}`);
    await tx.wait();
    console.log("  ✅ USDT approved");
  } else {
    console.log("  ✅ USDT already approved");
  }

  // ── Step 4: Add liquidity ──
  console.log("\nStep 4: Add liquidity...");
  const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 min

  // Full range for simplicity
  const params = {
    token0: token0,
    token1: token1,
    fee: FEE,
    tickLower: tickLower,
    tickUpper: tickUpper,
    amount0Desired: amount0,
    amount1Desired: amount1,
    amount0Min: 0,
    amount1Min: 0,
    recipient: wallet.address,
    deadline: deadline,
  };

  console.log("  Minting full-range position...");
  console.log(`  amount0Desired: ${ethers.formatUnits(amount0, isAigentToken0 ? aigentDec : usdtDec)}`);
  console.log(`  amount1Desired: ${ethers.formatUnits(amount1, isAigentToken0 ? usdtDec : aigentDec)}`);

  const tx = await posManager.mint(params);
  console.log(`  TX: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  ✅ Liquidity added!`);

  // ── Summary ──
  console.log("\n═══════════════════════════════════════");
  console.log("  🎉 Pool is LIVE!");
  console.log("═══════════════════════════════════════");
  console.log(`  Token:      AIGENT/USDT`);
  console.log(`  Fee:        0.3%`);
  console.log(`  Price:      $${AIGENT_PRICE}/AIGENT`);
  console.log(`  Pool:       ${pool}`);
  console.log(`  Uniswap:    https://app.uniswap.org/#/pool/${pool}`);
  console.log(`  Explorer:   https://www.okx.com/xlayer/explorer/address/${pool}`);
  console.log("═══════════════════════════════════════\n");

  // Save pool info
  const info = {
    pool,
    token0,
    token1,
    fee: FEE,
    aigent: AIGENT,
    usdt: USDT,
    aigentAmount: AIGENT_AMOUNT,
    usdtAmount: USDT_AMOUNT,
    price: AIGENT_PRICE,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(__dirname, "..", "pool-info.json"),
    JSON.stringify(info, null, 2)
  );
  console.log("Pool info saved to pool-info.json");
}

main().catch(e => {
  console.error(`\n❌ Failed: ${e.message}`);
  if (e.data) console.error("Revert data:", e.data);
  process.exit(1);
});
