// Bytecode comparison - check if it's just metadata mismatch
import { createPublicClient, http } from "viem";
import { xLayer } from "viem/chains";
import { readFileSync } from "fs";

const client = createPublicClient({ chain: xLayer, transport: http("https://rpc.xlayer.tech") });

const onChainCode = await client.getBytecode({
  address: "0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822",
});
const artifact = JSON.parse(readFileSync("artifacts/contracts/AIGENTLoyaltyAirdrop.sol/AIGENTLoyaltyAirdrop.json", "utf-8"));

const onChain = onChainCode?.replace("0x", "") ?? "";
const artifactBC = artifact.deployedBytecode.replace("0x", "");

// Strip metadata (last 53 bytes = 106 hex chars)
// Format: a2 64 'i' 'p' 'f' 's' ...
// The CBOR-encoded metadata is at the end, starts with a26469706673...
const metaStart = onChain.lastIndexOf("a26469706673");
const onChainNoMeta = onChain.substring(0, metaStart);
const artifactNoMeta = artifactBC.substring(0, artifactBC.lastIndexOf("a26469706673"));

console.log("Without metadata:");
console.log("  On-chain:", onChainNoMeta.length, "hex chars");
console.log("  Artifact:", artifactNoMeta.length, "hex chars");
console.log("  Match:", onChainNoMeta === artifactNoMeta);

if (onChainNoMeta !== artifactNoMeta) {
  // Find first diff position
  const minLen = Math.min(onChainNoMeta.length, artifactNoMeta.length);
  for (let i = 0; i < minLen; i++) {
    if (onChainNoMeta[i] !== artifactNoMeta[i]) {
      console.log("  First diff at hex pos:", i);
      console.log("  On-chain:", onChainNoMeta.substring(i, i + 64));
      console.log("  Artifact:", artifactNoMeta.substring(i, i + 64));
      break;
    }
  }
}
