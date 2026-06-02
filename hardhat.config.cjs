require("@nomicfoundation/hardhat-toolbox");

const config = {
  solidity: {
    version: "0.8.35",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    xlayer: {
      url: process.env.RPC_URL || "https://rpc.xlayer.tech",
      chainId: 196,
    },
  },
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://repo.sourcify.dev",
  },
  etherscan: {
    apiKey: {
      xlayer: "484f0138-b1c1-455e-905c-1b3117376765",
    },
    customChains: [
      {
        network: "xlayer",
        chainId: 196,
        urls: {
          apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER",
          browserURL: "https://www.oklink.com/xlayer",
        },
      },
    ],
  },
};

module.exports = config;
