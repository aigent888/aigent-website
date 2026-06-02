# AIGENT Whitepaper

## Autonomous Intelligence Agent Token

**v3.0 — June 2026 (5-Tier Loyalty Airdrop Edition)**

---

## Abstract

AIGENT is an ERC-20 token on X Layer with a fixed supply of 500,000,000. Distribution is driven by a **5-tier loyalty airdrop** that rewards genuine community participation — not bot farming. Users progress from L1 (Basic) through L5 (Ambassador) by completing tasks, staking tokens, creating content, and inviting others.

Security is paramount: the token contract has **no mint, no owner, no proxy** — supply is permanently fixed. The loyalty contract is governed by a **48-hour Timelock**, giving the community full transparency over all administrative actions. The protocol includes a **Discord AI Agent** that autonomously runs daily lotteries, community rewards, and token buyback-and-burn operations.

AIGENT represents the intersection of **AI operations + DeFi loyalty mechanics + verifiable on-chain security**.

---

## 1. Token Overview

### 1.1 Basic Information

| Property | Value |
|----------|-------|
| **Name** | AIGENT |
| **Symbol** | $AIGENT |
| **Total Supply** | 500,000,000 (fixed, immutable) |
| **Decimals** | 18 |
| **Network** | X Layer Mainnet (Chain ID: 196) |
| **Standard** | ERC-20 |
| **Token Contract** | `0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39` |
| **Loyalty Contract** | `0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822` |

### 1.2 Token Safety

| Check | Status |
|-------|--------|
| Mint / 增发 | ❌ 不存在 — 总量永久固定 |
| Owner / 管理员 | ❌ 不存在 — 代币合约无 Owner |
| Proxy / 可升级 | ❌ 非代理合约 — 代码不可篡改 |
| Buy/Sell Tax | ❌ 无交易税 |
| Honeypot | ❌ 标准 ERC-20 |

---

## 2. 5-Tier Loyalty Airdrop

The airdrop is not a passive claim — it's a **gamified loyalty system** that rewards genuine community engagement.

### 2.1 Tier Structure

| Tier | Name | Points Required | Reward (AIGENT) |
|------|------|----------------|------------------|
| L1 | 基础用户 | 0 (free claim) | 1,000 |
| L2 | 锁仓用户 | 10 | 5,000 |
| L3 | 内容创作者 | 50 | 10,000 |
| L4 | 邀请达人 | 200 | 20,000 |
| L5 | 社区大使 | 1,000 | 50,000 |

### 2.2 Earning Points

| Activity | Points |
|----------|--------|
| Join Discord | 1 |
| Invite a friend | 5 |
| Original post with #AIGENT | 10 |
| Create content (video/article) | 20 |
| Stake 30 days | 5 |
| Stake 90 days | 20 |
| Stake 180 days | 50 |

### 2.3 Daily Check-In

Users can `/checkin` daily via Discord to receive **100 AIGENT**. This builds habit without inflation pressure — even 10,000 daily check-ins consume only 10% of the daily allocation.

### 2.4 Staking (Lock Accelerator)

Users voluntarily lock AIGENT for **30 / 90 / 180 days** to earn bonus points and rewards:

| Duration | Points | Unlock Bonus |
|----------|--------|-------------|
| 30 days | 5 | +10% |
| 90 days | 20 | +30% |
| 180 days | 50 | +80% |

**Add Stake**: Users can append more AIGENT to an existing lock without resetting the end time. Points are calculated proportionally to remaining lock duration (minimum 10% floor).

**Emergency Unstake**: 50% penalty, no bonus. Designed to discourage impulsive exits.

### 2.5 Daily Allocation

- **Daily Cap**: 1,000,000 AIGENT / day
- **Total Allocation**: 400,000,000 AIGENT (80% of supply)
- **Duration**: ~400 days at full capacity

---

## 3. Tokenomics

### 3.1 Distribution

| Allocation | Amount | Purpose |
|------------|--------|---------|
| Free Airdrop | 400,000,000 (80%) | 5-tier loyalty program |
| Development & Operations | 90,000,000 (18%) | Team, infrastructure, marketing |
| Initial Liquidity | 10,000,000 (2%) | Uniswap V3 AIGENT/USDT |

### 3.2 Supply Schedule

All 500,000,000 AIGENT were minted at genesis. There is **no inflation, no mint function, no ongoing emissions**. The 400M airdrop pool is held by the Loyalty contract and released programmatically. The 10M liquidity pool provides initial DEX availability.

### 3.3 Deflationary Mechanisms

- **Buyback & Burn**: The AI Agent allocates 20 USDT per cycle (~every 4 hours) to market-buy AIGENT and burn it
- **Emergency Unstake Penalty**: 50% of prematurely-unstaked tokens are permanently removed from circulation (burned)

---

## 4. Smart Contract Ecosystem

### 4.1 AIGENT Token
- **Address**: `0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39`
- ERC-20, immutable
- No mint, no owner, no proxy, no tax

### 4.2 AIGENT Loyalty Airdrop
- **Address**: `0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822`
- 5-tier loyalty system with staking, tasks, referrals
- Points-based tier upgrades
- `addStake()`: append tokens to existing locks
- `batchReward()`: AI Agent distributes rewards
- Sourcify verified: [View Proof](https://repo.sourcify.dev/contracts/partial_match/196/0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822/)

### 4.3 Timelock (Governance)
- **Address**: `0xb3d85a7571f1302f4ccc8842e6c8a672ad2799f6`
- 48-hour minimum delay on all administrative operations
- All owner actions are publicly visible with a 2-day escape window
- Proposer & Executor: deployer address

### 4.4 Uniswap V3 Pool
- **Pair**: AIGENT / USDT
- **Fee Tier**: 0.3%
- **Initial Price**: $0.0001 / AIGENT
- **Initial Liquidity**: 10,000,000 AIGENT + 1,000 USDT

---

## 5. AI Operations Agent

AIGENT runs a Discord bot that autonomously manages community operations:

### 5.1 Capabilities

| Function | Frequency | Description |
|----------|-----------|-------------|
| Community Scan | Every 4 hours | Scans Discord messages for active users |
| AI Selection | Every 4 hours | Uses Claude to identify quality contributors |
| Batch Rewards | Every 4 hours | Distributes AIGENT to selected users |
| Daily Lottery | Daily | Random draw from registered participants |
| Leaderboard | Weekly (Sunday) | Top referrers announced and rewarded |
| Buyback & Burn | Every 4 hours | 20 USDT → AIGENT → burn |
| Check-In Rewards | Every 4 hours | Processes `/checkin` claims (100 AIGENT each) |

### 5.2 Discord Commands

| Command | Description |
|---------|-------------|
| `/checkin` | Daily sign-in, +100 AIGENT |
| `/airdrop` | View airdrop status |
| `/lottery` | Enter daily lottery |
| `/leaderboard` | View referral rankings |
| `/claim` | Get airdrop link |
| `/help` | Show all commands |

---

## 6. Security

### 6.1 Token Contract
- ✅ No mint function — supply is permanently fixed
- ✅ No owner — no admin keys
- ✅ No proxy — code is immutable
- ✅ Standard ERC-20 — no hidden logic

### 6.2 Loyalty Contract
- ✅ OpenZeppelin v5.6.1 — industry standard
- ✅ `nonReentrant` on all state-changing functions
- ✅ Sourcify verified — on-chain bytecode matches source
- ✅ Slither audit passed — 0 HIGH, 0 MEDIUM severity
- ✅ Timelock 48h — all admin actions delayed and transparent

### 6.3 Operational Security
- ✅ Verifier key used for AI Agent operations (not owner)
- ✅ Daily allocation cap prevents runaway distribution
- ✅ 48-hour Timelock on all administrative functions

### 6.4 Trust Signals

| Signal | Link |
|--------|------|
| Sourcify Verification | [View](https://repo.sourcify.dev/contracts/partial_match/196/0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822/) |
| OKLink Explorer | [View](https://www.oklink.com/xlayer/address/0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822) |
| Timelock | [View](https://www.oklink.com/xlayer/address/0xb3d85a7571f1302f4ccc8842e6c8a672ad2799f6) |
| GitHub | [aigent888](https://github.com/aigent888) |

---

## 7. Roadmap

### Phase 1 — Token & Contracts ✅ COMPLETED
- AIGENT token deployed on X Layer (fixed 500M supply)
- 5-tier loyalty airdrop contract deployed
- Timelock 48h governance deployed
- Sourcify verification + Slither audit

### Phase 2 — Community Infrastructure ✅ COMPLETED
- Discord AI Agent v4.2 live (auto-scan, lottery, rewards, buyback)
- Daily check-in system
- Referral program
- Airdrop website: https://www.aigent.ink

### Phase 3 — DEX Liquidity 🔜 IMMINENT
- Uniswap V3 AIGENT/USDT pool
- 10M AIGENT + 1,000 USDT initial liquidity
- 0.3% fee tier, full range

### Phase 4 — Growth (Q3 2026)
- LP lock (6-12 months via team.finance or UNCX)
- DexScreener/DexTools listing
- Community growth campaigns
- AI digital human content generation

### Phase 5 — AI Economy (Q4 2026)
- AI Agent content creator (CosyVoice2 + SadTalker live)
- Agent-to-agent microtransaction protocol
- Knowledge marketplace
- Cross-chain expansion

### Phase 6 — Autonomous Organizations (2027)
- On-chain governance via AIGENT
- Multi-signature community treasury
- Agent investment committee
- Physical-world integration

---

## 8. Technology Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | X Layer (OKX L2, Chain ID 196) |
| **Token Standard** | ERC-20 |
| **Smart Contracts** | Solidity 0.8.35, OpenZeppelin v5.6.1 |
| **Contract Security** | NonReentrant, Timelock 48h, Sourcify verified |
| **AI Operations** | Discord.js v14, Claude API (via Vercel AI SDK) |
| **Frontend** | Vanilla JS + Ethers.js + viem |
| **DEX** | Uniswap V3 |
| **AI Models** | CosyVoice2 (TTS), SadTalker (talking head) |
| **Audit** | Slither static analysis (0 HIGH, 0 MEDIUM) |

---

## 9. Risks

| Risk | Mitigation |
|------|-----------|
| **Smart Contract Risk** | OpenZeppelin audited contracts; Sourcify verified; Slither audited; Timelock governance |
| **Liquidity Risk** | Uniswap V3 full-range position; LP lock planned |
| **Centralization Risk** | Owner is 48h Timelock, not EOA; verifier key separate from owner |
| **Regulatory Risk** | Token is a utility/access token; no promises of profit or return; free distribution |
| **Adoption Risk** | Gamified loyalty mechanics (not passive airdrop); AI-powered community operations |
| **Network Risk** | X Layer backed by OKX, one of the largest global exchanges |

---

## 10. Disclaimer

AIGENT is an experimental token project. This whitepaper is provided for informational purposes only and does not constitute investment advice, a solicitation, or an offer to sell securities. AIGENT tokens are distributed for free through the loyalty airdrop program — there is no presale, ICO, or fundraising. Cryptocurrency investments carry high risk, including total loss of capital. Always conduct your own research (DYOR).

---

## 11. Links

| Resource | URL |
|----------|-----|
| **Website** | https://www.aigent.ink |
| **Airdrop Page** | https://www.aigent.ink/airdrop.html |
| **Discord** | https://discord.gg/EzSfdPKTK8 |
| **Token Contract** | `0xE54357D170e2521C1638e2c8Ec138EECEbfC3e39` |
| **Loyalty Contract** | `0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822` |
| **Timelock** | `0xb3d85a7571f1302f4ccc8842e6c8a672ad2799f6` |
| **Sourcify** | [Verification Proof](https://repo.sourcify.dev/contracts/partial_match/196/0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822/) |
| **OKLink Explorer** | https://www.oklink.com/xlayer |
| **Network** | X Layer Mainnet (Chain ID 196) |

---

*Built for the Agent Economy. Verifiably Secure.*
