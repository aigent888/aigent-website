const { ethers } = require('ethers');
const solc = require('solc');
const fs = require('fs');
const path = require('path');

async function main() {
  // Load env
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found');
    process.exit(1);
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  const privKey = envContent.match(/PRIVATE_KEY=([^\r\n]+)/)?.[1]?.trim();
  if (!privKey) {
    console.error('ERROR: PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  console.log('Address:', ethers.computeAddress(privKey));

  // Compile
  const source = fs.readFileSync(path.join(__dirname, 'contracts', 'AIGENTAirdrop.sol'), 'utf8');

  const input = {
    language: 'Solidity',
    sources: { 'AIGENTAirdrop.sol': { content: source } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
      evmVersion: 'paris',
    },
  };

  console.log('Compiling...');

  function findImports(source) {
    const fullPath = path.join(__dirname, 'node_modules', source);
    if (fs.existsSync(fullPath)) {
      return { contents: fs.readFileSync(fullPath, 'utf8') };
    }
    return { error: 'File not found: ' + source };
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    const severe = output.errors.filter(e => e.severity === 'error');
    if (severe.length > 0) {
      console.error('Compile errors:', JSON.stringify(severe, null, 2));
      process.exit(1);
    }
  }

  const contract = output.contracts['AIGENTAirdrop.sol']['AIGENTAirdrop'];
  const abi = contract.abi;
  const bytecode = contract.evm.bytecode.object;

  console.log('Compiled OK. ABI length:', abi.length, 'Bytecode length:', bytecode.length);

  // Connect to X Layer
  const provider = new ethers.JsonRpcProvider('https://rpc.xlayer.tech');
  const wallet = new ethers.Wallet(privKey, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log('OKB balance:', ethers.formatEther(balance), 'OKB');

  if (balance === 0n) {
    console.error('ERROR: 0 OKB balance. You need OKB for gas on X Layer.');
    console.error('Get OKB from OKX exchange or bridge.');
    process.exit(1);
  }

  // Deploy
  const AIGENT_ADDR = '0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39';
  console.log('Deploying AIGENTAirdrop with AIGENT token:', AIGENT_ADDR);

  const factory = new ethers.ContractFactory(abi, '0x' + bytecode, wallet);
  const airdrop = await factory.deploy(AIGENT_ADDR);
  await airdrop.waitForDeployment();

  const addr = await airdrop.getAddress();
  console.log('');
  console.log('========================================');
  console.log('  AIRDROP CONTRACT: ' + addr);
  console.log('========================================');
  console.log('');
  console.log('Now update index.html AIRDROP_ADDR to:', addr);
  console.log('Then send 400,000,000 AIGENT to this address.');
}

main().catch(err => {
  console.error('Deploy failed:', err.message || err);
  process.exit(1);
});
