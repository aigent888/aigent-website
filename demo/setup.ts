import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";

export function createAgentContext() {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x")) {
    throw new Error("AGENT_PRIVATE_KEY not set or invalid (needs 0x prefix)");
  }

  const account = privateKeyToAccount(pk as `0x${string}`);
  const rpcUrl = process.env.RPC_URL ?? "https://rpc.xlayer.tech";

  const wallet = createWalletClient({
    account,
    chain: xLayer,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: xLayer,
    transport: http(rpcUrl),
  });

  return { account, wallet, publicClient, rpcUrl };
}
