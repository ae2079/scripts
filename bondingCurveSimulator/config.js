/**
 * Configuration file for Bonding Curve Simulator
 * 
 * Add your bonding curve contracts here for easy switching
 */

// Load environment variables from .env file
require('dotenv').config();

module.exports = {
    // RPC endpoints
    // Priority: Environment variables > Default values
    rpc: {
        polygon: process.env.POLYGON_RPC_URL || process.env.RPC_URL || "https://polygon-rpc.com",
        polygonBackup: process.env.POLYGON_RPC_URL_BACKUP || "https://rpc-mainnet.matic.network",
        ethereum: process.env.ETHEREUM_RPC_URL || "https://eth.llamarpc.com",
        arbitrum: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
        optimism: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
        base: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    },

    // Your bonding curve contracts
    contracts: {
        // Add your contracts here
        "example_project": {
            address: "0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56",
            network: "polygon",
            name: "Example Project",
            description: "Example bonding curve contract",
            deployedDate: "2025-06-19",
        },

        // Add more contracts like this:
        // "project_name": {
        //     address: "0x...",
        //     network: "polygon",
        //     name: "Project Display Name",
        //     description: "Project description",
        //     deployedDate: "YYYY-MM-DD",
        // },
    },

    // Default settings
    defaults: {
        network: "polygon",
        targetSupplies: [
            1000000,
            2500000,
            5000000,
            7500000,
            10000000,
            15000000,
            20000000,
            25000000,
            50000000,
        ],
        buyAmounts: [
            10000,
            50000,
            100000,
            500000,
            1000000,
        ],
    },

    // Token decimals (standard)
    decimals: {
        usdc: 6,
        wpol: 18,
        pol: 18,
        token: 18,
    },

    // Token prices (update as needed)
    prices: {
        pol: 0.195, // POL price in USD (update manually or fetch from API)
        wpol: 0.195, // WPOL = POL
    },

    // Warning thresholds
    warnings: {
        highPrice: 1000000, // Price per token in USDC
        lowPrice: 0.000001, // Price per token in USDC
        highSpread: 30, // Buy/sell spread percentage
    },
};