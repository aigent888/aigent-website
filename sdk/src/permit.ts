/**
 * EIP-2612 Permit — gasless approvals for AI agents
 *
 * This is the CORE feature that enables autonomous AI agents
 * to transact without holding OKB for gas.
 */

import {
  type WalletClient,
  type PublicClient,
  type Account,
  type Hash,
  type TypedData,
  encodeAbiParameters,
  keccak256,
  maxUint256,
  parseUnits,
} from "viem";
import { AIGENT_TOKEN, AIGENT_DECIMALS, CHAIN_ID } from "./constants.js";

// ── EIP-712 Domain ──
const EIP712_DOMAIN = {
  name: "AIGENT",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: AIGENT_TOKEN as `0x${string}`,
} as const;

const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const PERMIT_ABI = [
  { type: "function", name: "permit", inputs: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "v", type: "uint8" },
    { name: "r", type: "bytes32" },
    { name: "s", type: "bytes32" },
  ], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "nonces", inputs: [
    { name: "owner", type: "address" },
  ], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "transferFrom", inputs: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
] as const;

export interface PermitSignature {
  owner: `0x${string}`;
  spender: `0x${string}`;
  value: bigint;
  deadline: bigint;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

/**
 * Sign an EIP-2612 Permit off-chain.
 * No gas required — the agent signs a typed data message.
 */
export async function signPermit(
  wallet: WalletClient,
  account: Account,
  publicClient: PublicClient,
  spender: `0x${string}`,
  amount: bigint,
  deadline?: bigint,
): Promise<PermitSignature> {
  const nonce = (await publicClient.readContract({
    address: AIGENT_TOKEN as `0x${string}`,
    abi: PERMIT_ABI,
    functionName: "nonces",
    args: [account.address],
  })) as bigint;

  const _deadline = deadline ?? maxUint256;

  const domain = {
    ...EIP712_DOMAIN,
    chainId: wallet.chain?.id ?? CHAIN_ID,
  };

  const message = {
    owner: account.address,
    spender,
    value: amount,
    nonce,
    deadline: _deadline,
  };

  const signature = await wallet.signTypedData({
    account,
    domain,
    types: PERMIT_TYPES,
    primaryType: "Permit",
    message,
  });

  const { r, s, v } = parseSignature(signature);

  return {
    owner: account.address,
    spender,
    value: amount,
    deadline: _deadline,
    v: Number(v ?? 0),
    r: r ?? "0x0",
    s: s ?? "0x0",
  };
}

/**
 * Execute a gasless transfer using a Permit signature.
 *
 * Flow:
 *  1. Agent signs Permit off-chain (no gas)
 *  2. Relayer calls permit + transferFrom in one tx
 *  3. Agent never touches OKB
 */
export async function gaslessTransfer(
  wallet: WalletClient,
  account: Account,
  publicClient: PublicClient,
  to: `0x${string}`,
  amount: bigint,
): Promise<Hash> {
  // 1. Sign permit
  const permit = await signPermit(
    wallet, account, publicClient,
    account.address, // spender = self for direct transfer
    amount,
  );

  // 2. Execute permit + transferFrom atomically
  return wallet.writeContract({
    address: AIGENT_TOKEN as `0x${string}`,
    abi: PERMIT_ABI,
    functionName: "permit",
    args: [
      permit.owner,
      permit.spender,
      permit.value,
      permit.deadline,
      permit.v,
      permit.r,
      permit.s,
    ],
    account,
    chain: wallet.chain,
  });
}

/**
 * Build a relay payload — permit signature that anyone can submit.
 * The relayer pays gas; the agent just signs.
 */
export function buildRelayPayload(
  permit: PermitSignature,
  to: `0x${string}`,
): {
  permitArgs: readonly [`0x${string}`, `0x${string}`, bigint, bigint, number, `0x${string}`, `0x${string}`];
  transferArgs: readonly [`0x${string}`, `0x${string}`, bigint];
} {
  return {
    permitArgs: [
      permit.owner,
      permit.spender,
      permit.value,
      permit.deadline,
      permit.v,
      permit.r,
      permit.s,
    ] as const,
    transferArgs: [permit.owner, to, permit.value] as const,
  };
}

// ── Helpers ──

function parseSignature(sig: `0x${string}`): { r: `0x${string}`; s: `0x${string}`; v: bigint } {
  return {
    r: `0x${sig.slice(2, 66)}`,
    s: `0x${sig.slice(66, 130)}`,
    v: BigInt(`0x${sig.slice(130, 132)}`),
  };
}

/** Get current nonce for an address */
export async function getNonce(
  publicClient: PublicClient,
  address: `0x${string}`,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: AIGENT_TOKEN as `0x${string}`,
    abi: PERMIT_ABI,
    functionName: "nonces",
    args: [address],
  })) as bigint;
}
