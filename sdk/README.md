# @aigent/sdk v2.0

**EIP-2612 Gasless Token + 5-Tier Loyalty System**

## Install

```bash
npm install @aigent/sdk viem
```

## Architecture

```
┌─────────────────────────────────────────────┐
│  Layer 1: EIP-2612 Permit (Core)            │
│  Gasless approvals for autonomous AI agents  │
│  ─────────────────────────────────────────  │
│  signPermit()  gaslessTransfer()            │
│  buildRelayPayload()  getNonce()            │
├─────────────────────────────────────────────┤
│  Layer 2: 5-Tier Loyalty System             │
│  Stake, claim, tasks, referrals             │
│  ─────────────────────────────────────────  │
│  claimL1()  stake()  addStake()  unstake()  │
│  submitTask()  getPlayer()  getStatus()     │
└─────────────────────────────────────────────┘
```

## Quick Start

### Layer 1 — Gasless AI Agent Transfer

```ts
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";
import { signPermit, gaslessTransfer } from "@aigent/sdk";

const account = privateKeyToAccount("0x...");
const wallet = createWalletClient({ account, chain: xLayer, transport: http() });
const publicClient = createPublicClient({ chain: xLayer, transport: http() });

// AI agent signs a Permit OFF-CHAIN (no gas!)
const permit = await signPermit(
  wallet, account, publicClient,
  "0xRecipient...",  // spender
  100n * 10n**18n,   // 100 AIGENT
);

// Relayer submits on-chain (agent never touches OKB)
const txHash = await gaslessTransfer(
  wallet, account, publicClient,
  "0xRecipient...",
  100n * 10n**18n,
);
```

### Layer 2 — Stake & Earn

```ts
import { AigentClient } from "@aigent/sdk";

const aigent = new AigentClient({ publicClient, walletClient: wallet, account });

// Claim L1 airdrop (1,000 AIGENT)
await aigent.claimL1();

// Stake 1,000 AIGENT for 90 days (earns +30% bonus)
await aigent.stake(1000n * 10n**18n, 90);

// Check your stats
const player = await aigent.getPlayer();
console.log(`Tier: ${aigent.tierName(player.tier)}`);
console.log(`Points: ${player.points}`);

// Unlock when time's up
await aigent.unstake();
```

## API

### EIP-2612 Permit

| Function | Description |
|----------|-------------|
| `signPermit(wallet, account, client, spender, amount)` | Sign permit off-chain |
| `gaslessTransfer(wallet, account, client, to, amount)` | Permit + transfer in 1 tx |
| `buildRelayPayload(permit, to)` | Build relayer-compatible payload |
| `getNonce(client, address)` | Get current nonce |

### Loyalty (AigentClient)

| Method | Description |
|--------|-------------|
| `getPlayer(address?)` | Get player tier, points, referrals |
| `getStake(address?)` | Get active stake info |
| `getStatus()` | Airdrop status (daily cap, claimed) |
| `getBalance(address?)` | AIGENT token balance |
| `claimL1(referrer?)` | Claim L1 airdrop (1,000 AIGENT) |
| `stake(amount, days)` | Lock AIGENT for 30/90/180 days |
| `addStake(amount)` | Add to existing stake |
| `unstake()` | Unlock after duration (+ bonus) |
| `emergencyUnstake()` | Emergency unlock (50% penalty) |
| `submitTask(taskId, sig)` | Submit verifier-signed task |
| `format(wei)` | Convert wei → human readable |
| `parse(amount)` | Convert human → wei |

## Contract Addresses (X Layer)

| Contract | Address |
|----------|---------|
| AIGENT Token | `0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39` |
| Loyalty Airdrop | `0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822` |
| Timelock (48h) | `0xb3d85a7571f1302f4ccc8842e6c8a672ad2799f6` |

## Links

- Website: https://www.aigent.ink
- Discord: https://discord.gg/EzSfdPKTK8
- Explorer: https://www.oklink.com/xlayer
