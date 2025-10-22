// Load environment variables from .env file
require('dotenv').config();

module.exports = {
    // RPC endpoints
    rpc: {
        polygon: process.env.POLYGON_RPC_URL || process.env.RPC_URL || "https://polygon-rpc.com",
    },

    // QuickSwap contracts
    quickswap: {
        factoryV2: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32", // QuickSwap V2 Factory
        factoryV3: "0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28", // QuickSwap V3 Factory (corrected)
        router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap Router
        wmatic: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC (WPOL)
        // QuickSwap Analytics API
        analyticsAPI: "https://leaderboard.quickswap.exchange/analytics/top-pair-details",
    },

    // Bonding curve projects (from tokensInfo.json)
    projects: {
        "AKARUN": {
            projectName: "AKARUN",
            bondingCurve: "0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56",
            issuanceToken: "0xA3dd6163B5742B0D8Cb7d79CB5DFE3F81F8F8fC4",
        },
        "ANCIENT_BEAST": {
            projectName: "ANCIENT_BEAST",
            bondingCurve: "0x5B34dE32e40842e2e1D0135f0F52C467Ad8b2baB",
            issuanceToken: "0x4191F84f66e0B7CC10370Ff47a0E2168E35b9Bdf",
        },
        "CITIZEN_WALLET": {
            projectName: "CITIZEN_WALLET",
            bondingCurve: "0xE1B18FE51289627C22944aC0A8A22b605Fcc21DA",
            issuanceToken: "0x0D9B0790E97e3426C161580dF4Ee853E4A7C4607",
        },
        "GRIDLOCK_SOCIAL_RECOVERY_WALLET": {
            projectName: "GRIDLOCK_SOCIAL_RECOVERY_WALLET",
            bondingCurve: "0xC72666Dd3D30e150738CcF41aa474CcD0af4D4f9",
            issuanceToken: "0x69CE536f95a84E1eF51Ed0132C514c7CE012E49b",
        },
        "HOW_TO_DAO": {
            projectName: "HOW_TO_DAO",
            bondingCurve: "0x1C98d67Bb5326C645bfc20ae94F35B6269859E03",
            issuanceToken: "0x6Fc91FBE42f72941486c98D11724B14Fb8d18b36",
        },
        "MELODEX": {
            projectName: "MELODEX",
            bondingCurve: "0xa2a1efb352166d6B38e2F1C24A913390a1367435",
            issuanceToken: "0x5FDAF637Aed59B2e6d384d9e84D8ac5cF03c6697",
        },
        "PRISMO_TECHNOLOGY": {
            projectName: "PRISMO_TECHNOLOGY",
            bondingCurve: "0xaBAb922f048aa22515c561c5c71f3ABD05F0B938",
            issuanceToken: "0x0b7a46E1af45E1EaadEeD34B55b6FC00A85c7c68",
        },
        "THE_GRAND_TIMELINE": {
            projectName: "THE_GRAND_TIMELINE",
            bondingCurve: "0x9d2720d1Bb13F8F5aC51fc32c0a9742A3DD101Be",
            issuanceToken: "0xfAFB870F1918827fe57Ca4b891124606EaA7e6bd",
        },
        "TO_DA_MOON": {
            projectName: "TO_DA_MOON",
            bondingCurve: "0x2B3F6dCed3C06A31AF2b8fb5DA8b48496198f3e2",
            issuanceToken: "0x878b6bF76F7BA67D0c4Da616eAc1933f9b133C1c",
        },
        "WEB3_PACKS": {
            projectName: "WEB3_PACKS",
            bondingCurve: "0x8675459B17d1d93eC0C41c783bDA16fF9b9b589B",
            issuanceToken: "0x4Fb9B94BD8bBbD684a7D5A5544Bc7A07188E5617",
        },
        "X23AI": {
            projectName: "X23AI",
            bondingCurve: "0x4b2502ad254855AC83990998695c6fD16c2CeeD9",
            issuanceToken: "0xc530B75465Ce3c6286e718110A7B2e2B64Bdc860",
        },
        "XADE_FINANCE": {
            projectName: "XADE_FINANCE",
            bondingCurve: "0x1d4fa4979BE3638D46D61e125f992dB703bC3173",
            issuanceToken: "0xA1a78aC9884aDc9d04d59b2b743f1eC709618e55",
        },
    },

    // Token decimals
    decimals: {
        wmatic: 18,
        wpol: 18,
        token: 18,
    },

    // Analysis settings
    analysis: {
        targetSupply: 7500000, // Target supply for bonding curve analysis
        minLiquidity: 1000, // Minimum LP liquidity in USD to consider
        maxSlippage: 5, // Maximum acceptable slippage percentage
    },

    // API endpoints
    apis: {
        coingecko: "https://api.coingecko.com/api/v3/simple/price?ids=polygon&vs_currencies=usd",
        quickswapGraph: "https://api.thegraph.com/subgraphs/name/sameepsi/quickswap06",
    },
};