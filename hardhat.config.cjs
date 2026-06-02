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
};

module.exports = config;
