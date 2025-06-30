require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.19",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        polygon: {
            url: "https://lb.drpc.org/ogrpc?network=polygon&dkey=AkwVEpAy8kYom-mKjqkdWlWH4pw146oR76kzqi5fk9AX",
            accounts: [process.env.PRIVATE_KEY || "23d91e100f795a6f0e58ee96726cfe7cd600fd48eec81d5bba2752925d197edf"],
            chainId: 137,
        },
        hardhat: {
            chainId: 31337,
        },
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
};