const { ethers } = require('ethers');
const solc = require('solc');
const fs = require('fs');
const path = require('path');

async function main() {
  const envPath = path.join(__dirname, '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const privKey = envContent.match(/PRIVATE_KEY=([^\r\n]+)/)?.[1]?.trim();
  const provider = new ethers.JsonRpcProvider('https://rpc.xlayer.tech');
  const wallet = new ethers.Wallet(privKey, provider);
  const me = wallet.address;

  const AIGENT = '0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39';

  // Compile
  const vaultSource = fs.readFileSync(path.join(__dirname, 'contracts', 'AIGENTVault.sol'), 'utf8');

  function findImports(source) {
    const fullPath = path.join(__dirname, 'node_modules', source);
    if (fs.existsSync(fullPath)) {
      return { contents: fs.readFileSync(fullPath, 'utf8') };
    }
    return { error: 'File not found: ' + source };
  }

  const input = {
    language: 'Solidity',
    sources: { 'AIGENTVault.sol': { content: vaultSource } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
      evmVersion: 'paris',
    },
  };

  console.log('Compiling Vault...');
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    const severe = output.errors.filter(e => e.severity === 'error');
    if (severe.length > 0) {
      console.error('Compile errors:', JSON.stringify(severe, null, 2));
      process.exit(1);
    }
  }

  const contract = output.contracts['AIGENTVault.sol']['AIGENTVault'];
  const abi = contract.abi;
  const bytecode = contract.evm.bytecode.object;
  console.log('Compiled OK. Deploying...');

  // Deploy new Vault
  const factory = new ethers.ContractFactory(abi, '0x' + bytecode, wallet);
  const vault = await factory.deploy(AIGENT, me);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log('New Vault:', vaultAddr);

  // Create vesting: 90M, start now, 30d cliff, 48mo vesting
  const NINETY_MILLION = 90000000n * 10n**18n;
  const now = Math.floor(Date.now() / 1000);
  const cliff30d = 30 * 86400;
  const vest48m = 4 * 365 * 86400;

  // Approve AIGENT to vault
  const aigent = new ethers.Contract(AIGENT, [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
  ], wallet);

  const tx1 = await aigent.approve(vaultAddr, NINETY_MILLION);
  await tx1.wait();
  console.log('Approved 90M.');

  // Create vesting
  const vaultC = new ethers.Contract(vaultAddr, abi, wallet);
  const tx2 = await vaultC.createVesting(me, NINETY_MILLION, now, cliff30d, vest48m);
  console.log('Vesting tx:', tx2.hash);
  await tx2.wait();
  console.log('Vesting created.');

  // Verify
  const aigentR = new ethers.Contract(AIGENT, ['function balanceOf(address) view returns (uint256)'], provider);
  const vaultBal = await aigentR.balanceOf(vaultAddr);
  const walletBal = await aigentR.balanceOf(me);

  console.log('');
  console.log('========================================');
  console.log('  NEW VAULT: ' + vaultAddr);
  console.log('  Vault balance: ' + ethers.formatEther(vaultBal) + ' AIGENT');
  console.log('  Wallet balance: ' + ethers.formatEther(walletBal) + ' AIGENT (for LP)');
  console.log('========================================');
  console.log('');
  console.log('Schedule: 30-day cliff, 48-month linear vesting');
  console.log('First release: ' + new Date((now + cliff30d) * 1000).toISOString());
}

main().catch(err => {
  console.error('Deploy failed:', err.message || err);
  process.exit(1);
});
