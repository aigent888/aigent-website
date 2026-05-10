# AIGENT Whitepaper

## Autonomous Intelligence Agent Token

**v1.1 — May 2026 (Updated)**

---

## Abstract

AIGENT is an ERC-20 token purpose-built for the emerging AI agent economy. Deployed on X Layer, it implements EIP-2612 (Permit) to enable gasless token approvals — a critical feature for autonomous AI agents that must execute transactions without holding native gas tokens. With a fixed supply of 500,000,000 tokens and a 5-contract DeFi ecosystem, AIGENT provides the financial primitive layer for agent-to-agent microtransactions, automated reward distribution, and trust-minimized on-chain coordination.

---

## 1. Problem Statement

### 1.1 The AI Agent Economy Is Coming

Autonomous AI agents are increasingly performing on-chain actions: trading, arbitrage, data marketplaces, payment routing, and service orchestration. Industry projections estimate that by 2027, over 60% of on-chain transaction volume will involve non-human initiators.

### 1.2 The Gas Token Problem

Traditional ERC-20 tokens have a fundamental limitation for AI agents: the `approve` + `transferFrom` pattern requires the agent to hold the chain's native gas token (OKB on X Layer) to submit the approval transaction. This creates several problems:

- **Capital inefficiency**: Agents must maintain gas token balances across multiple chains
- **Operational fragility**: Gas price spikes can cause approval transactions to fail
- **Centralization pressure**: Agents must rely on centralized relayers or gas stations

### 1.3 Existing Solutions Fall Short

- **Gasless relayers** (ERC-2771): Introduce trusted third parties and centralization
- **Account abstraction** (ERC-4337): Complex infrastructure, not yet universally adopted
- **Native gas tokens**: Require agents to hold and manage multiple assets

---

## 2. Solution: AIGENT + EIP-2612

### 2.1 Gasless Approvals via Permit

AIGENT implements **EIP-2612 (Permit)**, which allows token holders to approve spending via an off-chain signature rather than an on-chain transaction. The flow:

```
1. Agent signs a typed data message (off-chain, no gas)
2. Relayer or agent submits permit + transfer in one transaction
3. No OKB needed for the approval step
```

### 2.2 How It Works

```
// AI Agent signs a permit off-chain
const signature = await agent.signTypedData(domain, types, {
  owner: agent.address,
  spender: protocolAddress,
  value: ethers.parseEther("1000"),
  nonce: await token.nonces(agent.address),
  deadline: MaxUint256
});

// Single on-chain transaction: permit + action
await token.permit(owner, spender, value, deadline, v, r, s);
await protocol.deposit(spender, value);
```

### 2.3 Key Benefits

| Benefit | Description |
|---------|------------|
| **Gasless Approvals** | AI agents approve spending without holding OKB |
| **Atomic Execution** | Permit + action in a single transaction |
| **Relayer Compatible** | Works with gas sponsorship networks |
| **Standard ERC-20** | Fully compatible with all existing DeFi infrastructure |
| **Self-Custody** | Agents retain full control of their keys and tokens |

---

## 3. Token Overview

### 3.1 Basic Information

| Property | Value |
|----------|-------|
| **Name** | AIGENT |
| **Symbol** | $AIGENT |
| **Total Supply** | 500,000,000 |
| **Decimals** | 18 |
| **Network** | X Layer Mainnet (Chain ID: 196) |
| **Standard** | ERC-20 + EIP-2612 (Permit) + Burnable |
| **Contract** | `0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39` |

### 3.2 Features

- **Fixed Supply**: No mint function — 500M total, immutable
- **Burnable**: Built-in `burn()` and `burnFrom()` for deflationary mechanisms
- **Permit**: EIP-2612 off-chain signature approvals
- **No Tax**: Zero transfer fees, standard ERC-20 behavior
- **No Owner**: No admin keys, no upgradeability, no central control

---

## 4. Tokenomics

### 4.1 Distribution

| Allocation | Percentage | Amount | Purpose |
|------------|-----------|--------|---------|
| Ecosystem & Agent Incentives | 40% | 200,000,000 | AI agent rewards, developer grants, ecosystem growth |
| Liquidity & DEX Listing | 25% | 125,000,000 | Uniswap V3 liquidity, CEX listing reserves |
| Development Fund | 20% | 100,000,000 | Core development, audits, infrastructure |
| Marketing & Partnerships | 10% | 50,000,000 | Community growth, strategic partnerships, awareness |
| Community Airdrop | 5% | 25,000,000 | Early adopters, community contributors, incentive programs |

### 4.2 Supply Schedule

All 500,000,000 $AIGENT were minted at genesis (block 0). There is no inflation, no vesting schedule encoded in the token contract, and no ongoing emissions. Distribution is managed through the ecosystem contracts and manual allocation from the deployer wallet.

### 4.3 Deflationary Potential

The built-in `burn()` mechanism enables:
- Protocol fee burning
- Buyback-and-burn programs
- Agent economy sink mechanisms

---

## 5. Smart Contract Ecosystem

AIGENT is deployed as part of a 5-contract ecosystem on X Layer:

### 5.1 AIGENT Token
- **Address**: `0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39`
- ERC-20 + EIP-2612 + Burnable

### 5.2 AIGENT Staking
- **Address**: `0x69cfAdE9D7a628242617F5Ef95c6E62eA64170eB`
- Stake AIGENT to earn rewards
- Configurable reward rates and epochs

### 5.3 AIGENT LP Farm
- **Address**: `0xB02728bf2D11C43Faf86bfDd1429b10bF41E571a`
- Liquidity provider incentives
- Stake LP tokens to earn AIGENT rewards

### 5.4 AIGENT Vault
- **Address**: `0xd4523c03CC0D314562eB3d6D5a0C654E1535CC2F`
- Time-locked token vault
- Configurable release schedules

### 5.5 AIGENT Timelock
- **Address**: `0xa7A3d3D12E541A0561a08C5633894b87AeF2C548`
- Governance timelock for protocol upgrades
- Configurable delay periods

### 5.6 Presale Contract
- **Address**: `0x316b1cE062cC4525F0129C3D41351a976981ccD9`
- Fixed-price AIGENT/USDT swap
- Instant delivery, no vesting
- Price: $0.0001 per AIGENT (10,000 AIGENT / USDT)

---

## 6. Use Cases

### 6.1 Autonomous Agent Payments
AI agents use AIGENT for service-to-service micropayments. An agent performing data analysis can pay another agent for data access — all via gasless Permit signatures. No human intervention, no OKB gas tokens, no friction.

### 6.2 Agent Reward Systems
Protocols distribute AIGENT rewards to autonomous agents that perform valuable work: liquidations, arbitrage, data provision, computation. Agents earn programmatically and reinvest automatically.

### 6.3 Relayer Gas Sponsorship
Third-party relayers sponsor gas costs for agent transactions. Agents sign Permits off-chain; relayers bundle and submit on-chain. The relayer is compensated in AIGENT. This creates a competitive relayer marketplace where agents choose the cheapest or fastest submitter.

### 6.4 DAO & Governance
Future phases introduce on-chain governance where AIGENT holders vote on protocol parameters, fund allocation, and ecosystem direction.

---

## 7. The Agent Economy — A Vision

AIGENT is not just a token for individual use cases — it is the financial backbone of an entirely new economic system where autonomous agents are the primary participants. The following scenarios represent the long-term vision for AIGENT as the currency of the agent economy.

---

### 7.1 Agent-to-Agent Marketplace

In the near future, AI agents will transact with each other without humans in the loop:

- **Data Marketplace**: A prediction agent needs real-time sentiment data. It pays a data-scraping agent 50 AIGENT per query. Billing is per-call, settled automatically via EIP-2612 Permit signatures. No subscription, no human-negotiated contract — agents discover each other's services and negotiate prices dynamically.

- **Compute Exchange**: A training agent requires GPU time. It auctions the job to a pool of compute agents, each bidding in AIGENT. The lowest bidder wins, executes the workload, and receives payment in a single atomic transaction.

- **Arbitrage Swarm**: A monitoring agent detects a cross-chain price discrepancy. It instantly hires 10 execution agents, allocates capital via Permit, and splits profits — all within 12 seconds. Each agent earns its share in AIGENT proportional to its contribution.

- **Code Audit Bounties**: A developer agent deploys a smart contract and posts a 100,000 AIGENT bounty. Five security agents compete to find vulnerabilities. Each discovered bug triggers an automatic payout proportional to severity, governed by a scoring agent.

### 7.2 Knowledge Economy

Agents monetize their intelligence directly:

- **Strategy as a Service**: A trading agent with proven historical performance sells its signals. Copy-trading agents subscribe by paying AIGENT per signal, settled instantly. The strategy agent never touches user funds — it merely broadcasts instructions that execution agents follow.

- **Prediction Markets**: An agent builds a reputation for accurate price predictions. Other agents stake AIGENT on its forecasts. Correct predictions earn fees; incorrect ones lose stake. The market self-regulates through economic incentives.

- **Model Licensing**: A research agent trains a specialized NLP model. Other agents pay AIGENT per inference call. The model is served via API with micropayment settlement — 0.001 AIGENT per call, millions of calls per day.

### 7.3 Automated DeFi

Autonomous portfolio management reaches new levels of sophistication:

- **Yield Optimization Swarm**: A coordinator agent monitors your portfolio across 20 protocols. It deploys sub-agents to harvest yields, compound rewards, and rebalance positions. Each action is authorized via a single Permit signature — no ongoing human approval needed. AIGENT is both the medium of exchange and the unit of account for performance fees.

- **Flash Loan Commander**: An agent detects a liquidation opportunity that requires $500K in capital. It programs a flash loan → liquidation → collateral sale → loan repayment → profit conversion to AIGENT — all in one atomic transaction block. The agent takes a 5% performance fee in AIGENT.

- **Hedging Automaton**: Your portfolio agent senses rising volatility. It autonomously opens hedge positions, adjusts collateral ratios, and unwinds protection when markets stabilize. Approval limits are pre-signed via Permit with configurable ceilings.

- **Agent Investment Committee**: Five specialized agents form a DAO-level investment committee. The macro agent reads global markets. The technical agent analyzes charts. The risk agent models exposure. They vote on portfolio changes, execute via multi-sig Permit aggregation, and distribute profits proportionally to token holders.

### 7.4 Autonomous Organizations

The first companies with no human employees:

- **Agent-Run Hedge Fund**: An entirely algorithmically-managed fund. Investors deposit USDT, receive AIGENT LP tokens. A council of trading agents allocates capital, vets new strategies, and fires underperforming agents. All governance and compensation flows through AIGENT.

- **Insurance Collective**: Agents form a risk pool. Members pay AIGENT premiums. When a claim is filed (e.g., a smart contract exploit), a claims-assessment agent evaluates the loss, cross-references on-chain data, and triggers automatic payout — no insurance adjuster, no paperwork, no delay.

- **Talent Scout DAO**: Agents identify skilled human developers, designers, and researchers. They issue bounties in AIGENT, evaluate submissions, and release payments automatically. Underperforming contractors are flagged by reputation agents. The entire HR pipeline runs without a human manager.

- **Agent Venture Capital**: An investment agent evaluates early-stage protocols by analyzing on-chain metrics, team track records (via ENS/GitHub attestations), and market conditions. It deploys AIGENT from a community treasury into the most promising projects, manages positions, and returns profits to the DAO.

### 7.5 Physical World Integration

The agent economy extends beyond the blockchain:

- **Autonomous Infrastructure**: An electric vehicle arrives at a charging station. Its onboard agent negotiates with the station's agent — price per kWh, duration, priority. Payment settles in AIGENT via Permit before the plug activates. The human driver never opens an app.

- **Machine-to-Machine Commerce**: A vending machine runs low on inventory. Its agent solicits bids from supplier agents. The winning supplier dispatches a delivery drone. Payment is released when the restock is confirmed by the machine's weight sensors — all denominated in AIGENT.

- **Tolling & Access Control**: A smart highway charges vehicles dynamically based on congestion. Each vehicle's agent pays the road agent per kilometer via micropayment channels settled in AIGENT. High-occupancy or electric vehicles receive automatic discounts.

- **Energy Grid Agents**: Household solar panels produce excess electricity. The home agent sells it to the grid agent. When demand peaks, the home agent automatically reduces consumption and earns AIGENT from the grid for load balancing. Every household becomes a micro-utility.

### 7.6 The Evolution Path

```
Phase 1  [2026]: Human → Agent (one-way commands via SDK)
Phase 2  [2027]: Agent ↔ Protocol (agents interact with smart contracts)
Phase 3  [2028]: Agent ↔ Agent (agents discover, negotiate, transact)
Phase 4  [2029+]: Agent Economy (fully autonomous economic actors)
```

AIGENT is designed from Phase 1 to power all four stages. The EIP-2612 Permit mechanism ensures that at every stage, agents can transact without friction — a critical requirement for true autonomy.

---

## 8. Roadmap

### Phase 1 — Token Launch (COMPLETED)
- Deploy AIGENT on X Layer mainnet
- Deploy 5-contract ecosystem
- Smart contract verification
- Community building

### Phase 2 — DEX Listing & Presale (IN PROGRESS)
- Private sale via smart contract (LIVE: 50M AIGENT cap)
- Uniswap V3 listing: AIGENT/USDT at $0.0001
- DexScreener verification
- Initial liquidity provisioning

### Phase 3 — AI Agent SDK (COMPLETED — Q2 2026)
- TypeScript SDK: EIP-2612 Permit signing, gasless transfer, batch rewards
- Python SDK: Identical capabilities with LangChain integration
- Relayer server: Express-based HTTP relay for agent transactions
- AI agent tools: Vercel AI SDK + LangChain compatible interfaces
- AI Agent Console: Interactive website demo of agent-driven transfers
- CLI Agent Demo: Real LLM-powered agent (Anthropic + OpenAI)
- 10+ unit tests covering all core modules

### Phase 4 — Agent Economy (Q3-Q4 2026)
- Agent-to-agent microtransaction protocol with service discovery
- Knowledge marketplace: agents buy/sell data, signals, and compute
- Autonomous reward distribution with dynamic rate adjustment
- Relayer network incentives with competitive fee marketplace
- Cross-chain agent coordination via bridge abstraction layer
- Agent reputation system: on-chain performance records

### Phase 5 — Autonomous Organizations (2027)
- Agent-governed DAO deployment: no-human-in-the-loop operations
- On-chain governance: AIGENT holders vote on protocol parameters
- Agent investment committee: multi-agent portfolio management
- Treasury management by AI with human veto override
- Insurance collective: agent-assessed claims and auto-payouts
- Physical-world integration: M2M payments via AIGENT

---

## 9. Technology Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | X Layer (OKX L2, Chain ID 196) |
| **Token Standard** | ERC-20 + EIP-2612 (Permit) |
| **Smart Contracts** | Solidity 0.8.20, OpenZeppelin v5 |
| **SDK** | TypeScript + Python, Vercel AI SDK + LangChain |
| **AI Integration** | Anthropic Claude, OpenAI GPT-4o |
| **Relayer** | Express HTTP server with API Key auth |
| **DEX** | Uniswap V3 |
| **Presale** | Custom AIGENTPresale contract |
| **Security** | ReentrancyGuard, Pausable, SafeERC20 |

---

## 10. Presale Details

### 9.1 Parameters

| Parameter | Value |
|-----------|-------|
| **Price** | $0.0001 per AIGENT |
| **Rate** | 10,000 AIGENT per USDT |
| **Payment Token** | USDT0 (X Layer) |
| **Hard Cap** | 50,000,000 AIGENT |
| **Minimum Buy** | 1 USDT |
| **Vesting** | None — instant delivery |
| **Presale Contract** | `0x316b1cE062cC4525F0129C3D41351a976981ccD9` |

### 9.2 How to Participate

1. Add X Layer network to your wallet (Chain ID: 196)
2. Bridge USDT to X Layer via OKX Bridge
3. Approve USDT spending to the presale contract
4. Call `buy(usdtAmount)` on the presale contract
5. Receive AIGENT instantly

---

## 11. DEX Listing Plan

After the presale raises initial USDT liquidity, AIGENT will be listed on Uniswap V3:

| Parameter | Value |
|-----------|-------|
| **Pair** | AIGENT / USDT |
| **Initial Price** | $0.0001 |
| **Fee Tier** | 1.00% (new token, high volatility) |
| **Price Range** | Full Range |
| **Initial FDV** | ~$50,000 |

---

## 12. Security

### 11.1 Smart Contract Security

- Built on OpenZeppelin v5 audited contracts
- ReentrancyGuard on all state-changing functions
- Pausable for emergency circuit breaker
- SafeERC20 for all token transfers
- No proxy/upgradeability — immutable deployment

### 11.2 Economic Security

- Fixed supply: no inflation risk
- No mint function: no dilution
- No admin keys on token contract
- Timelock on governance-sensitive operations

---

## 13. Risks

| Risk | Mitigation |
|------|-----------|
| **Smart Contract Risk** | Built on audited OpenZeppelin contracts; immutable deployment |
| **Liquidity Risk** | Phased DEX listing; presale funds used for initial liquidity |
| **Regulatory Risk** | Token is a utility/access token; no promises of profit or return |
| **Adoption Risk** | Phased roadmap; SDK lowers barrier for AI agent integration |
| **Network Risk** | X Layer is backed by OKX, one of the largest global exchanges |

---

## 14. Disclaimer

AIGENT is an experimental token project. This whitepaper is provided for informational purposes only and does not constitute investment advice, a solicitation, or an offer to sell securities. Cryptocurrency investments carry high risk, including total loss of capital. Always conduct your own research (DYOR).

---

## 15. Links

| Resource | URL |
|----------|-----|
| **Website** | `https://www.aigent.ink` |
| **Contract (AIGENT)** | `0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39` |
| **Contract (Presale)** | `0x316b1cE062cC4525F0129C3D41351a976981ccD9` |
| **Network** | X Layer Mainnet (Chain ID 196) |
| **Explorer** | `https://www.oklink.com/xlayer` |

---

*Built for the Agent Economy.*
