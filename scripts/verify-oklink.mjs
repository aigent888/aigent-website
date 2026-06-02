// OKLink verification - use sol-merger flattened (cleaner)
import { readFileSync } from "fs";

const API_KEY = "484f0138-b1c1-455e-905c-1b3117376765";
const VERIFY_URL = "https://www.oklink.com/api/v5/explorer/contract/verify-source-code";
const CHECK_URL = "https://www.oklink.com/api/v5/explorer/contract/check-verify-result";

// sol-merger version has no imports, no duplicate pragmas, no SPDX conflicts
const sourceCode = readFileSync(
  "contracts/AIGENTLoyaltyAirdrop_flat.sol/AIGENTLoyaltyAirdrop.sol",
  "utf-8"
);

console.log(`Source: ${(sourceCode.length / 1024).toFixed(1)} KB, ` +
  `imports: ${(sourceCode.match(/import /g) || []).length}, ` +
  `pragmas: ${(sourceCode.match(/pragma /g) || []).length}`);

const body = {
  chainShortName: "XLAYER",
  contractAddress: "0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822",
  contractName: "AIGENTLoyaltyAirdrop",
  sourceCode,
  codeFormat: "solidity-single-file",
  compilerVersion: "v0.8.35+commit.47b9dedd",
  optimization: "true",
  optimizationRuns: "200",
  evmVersion: "cancun",
  licenseType: "MIT",
  constructorArguments: "0x000000000000000000000000e54357d170e2521c1638e2c8ec138eecebfc3e3900000000000000000000000038ba1dd6ca31c8b2971de7c61a87f1f7c4eba7e4",
};

console.log("Submitting...");
const res = await fetch(`${VERIFY_URL}?apikey=${API_KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const data = await res.json();
console.log("Submit:", JSON.stringify(data));

if (data.code === "0" && data.data?.[0]) {
  const guid = data.data[0];
  console.log(`GUID: ${guid}`);
  console.log("Waiting 20s for compilation...");
  await new Promise(r => setTimeout(r, 20000));

  const check = await fetch(`${CHECK_URL}?apikey=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainShortName: "XLAYER", guid }),
  });
  const checkData = await check.json();
  console.log("Result:", JSON.stringify(checkData));

  if (checkData.data?.[0] === "Pass") {
    console.log("\n🎉🎉🎉 验证成功! 🎉🎉🎉");
    console.log("https://www.oklink.com/xlayer/address/0x021B4D1C57c8Ca7e1bafdc5da2bE21c3c2400822");
  } else if (checkData.data?.[0] === "Pending") {
    console.log("Still pending, check again in 30s...");
    await new Promise(r => setTimeout(r, 30000));
    const recheck = await fetch(`${CHECK_URL}?apikey=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainShortName: "XLAYER", guid }),
    });
    const recheckData = await recheck.json();
    console.log("Recheck:", JSON.stringify(recheckData));
  }
}
