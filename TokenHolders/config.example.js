/**
 * Example configuration file for Token Holders Fetcher
 * 
 * Copy this file to use different settings without modifying the main script:
 * 1. Copy this file: cp config.example.js config.js
 * 2. Edit config.js with your settings
 * 3. Import it in getTokenHolders.js
 */

module.exports = {
    // Polygon RPC endpoint - you can use Alchemy, Infura, or public RPCs
    RPC_URL: "https://polygon-rpc.com",

    // Alternative RPC URLs (fallback options)
    ALTERNATIVE_RPC_URLS: [
        "https://polygon.llamarpc.com",
        "https://rpc-mainnet.matic.network",
        "https://polygon-bor-rpc.publicnode.com",
        // Add your own RPC endpoints below:
        // "https://polygon-mainnet.g.alchemy.com/v2/YOUR-API-KEY",
        // "https://polygon-mainnet.infura.io/v3/YOUR-PROJECT-ID",
    ],

    // Token contract addresses for common tokens on Polygon
    // Uncomment the one you want to analyze or add your own
    TOKENS: {
        // USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        // USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        // WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
        // WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        // DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",

        // Add your custom token here:
        CUSTOM: "0x0000000000000000000000000000000000000000"
    },

    // Which token to analyze (key from TOKENS object above)
    TARGET_TOKEN: "CUSTOM",

    // Minimum balance to consider (in token units, not wei)
    // Addresses with less than this balance will be filtered out
    MIN_BALANCE: 0.0001,

    // Output directory for results
    OUTPUT_DIR: "./output",

    // Batch size for balance checks (number of addresses per batch)
    // Lower this if you're hitting rate limits
    BATCH_SIZE: 100,

    // Block range for event queries (blocks per query)
    // Lower this if you're getting timeout errors
    BLOCK_RANGE: 10000,

    // Optional: Specify the block where the contract was created
    // This can significantly speed up the process
    // Leave as 0 to scan from genesis (slower but thorough)
    START_BLOCK: 0,

    // Optional: End block for analysis (useful for historical snapshots)
    // Leave as null to use the latest block
    END_BLOCK: null,

    // Enable/disable progress logging
    SHOW_PROGRESS: true,

    // Enable/disable detailed logging
    VERBOSE: false
};