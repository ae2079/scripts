const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Configuration - Read from environment variables or use defaults
const CONFIG = {
    // PolygonScan API Key - Get one for free at https://polygonscan.com/apis
    POLYGONSCAN_API_KEY: process.env.POLYGONSCAN_API_KEY || "YourApiKeyToken",

    // PolygonScan API endpoint
    POLYGONSCAN_API_URL: "https://api.polygonscan.com/api",

    // Polygon RPC endpoint (for balance checks)
    RPC_URL: process.env.RPC_URL || "https://polygon-rpc.com",

    // Token contract address
    TOKEN_ADDRESS: process.env.TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",

    // Minimum balance to consider (in human-readable format)
    MIN_BALANCE: parseFloat(process.env.MIN_BALANCE) || 0.0001,

    // Output file path
    OUTPUT_DIR: process.env.OUTPUT_DIR || "./output",

    // Page size for API requests (max 10000)
    PAGE_SIZE: parseInt(process.env.PAGE_SIZE) || 10000,

    // Delay between API requests (milliseconds)
    API_DELAY: parseInt(process.env.API_DELAY) || 250
};

// Standard ERC20 ABI
const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function totalSupply() view returns (uint256)"
];

class TokenHoldersFetcherAPI {
    constructor(tokenAddress, apiKey, rpcUrl) {
        this.tokenAddress = tokenAddress;
        this.apiKey = apiKey;
        this.apiUrl = CONFIG.POLYGONSCAN_API_URL;
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    }

    /**
     * Get token metadata
     */
    async getTokenMetadata() {
        try {
            console.log("\n📊 Fetching token metadata...");
            const [name, symbol, decimals, totalSupply] = await Promise.all([
                this.contract.name(),
                this.contract.symbol(),
                this.contract.decimals(),
                this.contract.totalSupply()
            ]);

            const metadata = {
                name,
                symbol,
                decimals: Number(decimals),
                totalSupply: ethers.formatUnits(totalSupply, decimals),
                address: this.tokenAddress
            };

            console.log(`   Token: ${metadata.name} (${metadata.symbol})`);
            console.log(`   Decimals: ${metadata.decimals}`);
            console.log(`   Total Supply: ${metadata.totalSupply}`);
            console.log(`   Contract: ${metadata.address}`);

            return metadata;
        } catch (error) {
            console.error("❌ Error fetching token metadata:", error.message);
            throw error;
        }
    }

    /**
     * Get token holders from PolygonScan API
     */
    async getTokenHoldersFromAPI() {
        try {
            console.log("\n🔍 Fetching token holders from PolygonScan API...");

            let allHolders = [];
            let page = 1;
            let hasMorePages = true;

            while (hasMorePages) {
                const offset = (page - 1) * CONFIG.PAGE_SIZE;
                const url = `${this.apiUrl}?module=token&action=tokenholderlist&contractaddress=${this.tokenAddress}&page=${page}&offset=${CONFIG.PAGE_SIZE}&apikey=${this.apiKey}`;

                process.stdout.write(`\r   Fetching page ${page}...`);

                try {
                    const response = await fetch(url);
                    const data = await response.json();

                    if (data.status === "1" && data.result && Array.isArray(data.result)) {
                        if (data.result.length === 0) {
                            hasMorePages = false;
                        } else {
                            allHolders.push(...data.result);

                            // Check if we got less than PAGE_SIZE results, meaning we're on the last page
                            if (data.result.length < CONFIG.PAGE_SIZE) {
                                hasMorePages = false;
                            }

                            page++;

                            // Add delay to respect rate limits
                            await new Promise(resolve => setTimeout(resolve, CONFIG.API_DELAY));
                        }
                    } else if (data.status === "0") {
                        if (data.message === "No transactions found" || data.result === "Error! No records found") {
                            console.log(`\n   ℹ️  No more holders found`);
                            hasMorePages = false;
                        } else {
                            throw new Error(data.message || data.result || "API request failed");
                        }
                    } else {
                        throw new Error("Unexpected API response format");
                    }
                } catch (error) {
                    console.error(`\n   ❌ Error fetching page ${page}:`, error.message);

                    // If it's an API key error, stop immediately
                    if (error.message.includes("Invalid API Key") || error.message.includes("Max rate limit")) {
                        throw error;
                    }

                    // Otherwise, break and use what we have
                    hasMorePages = false;
                }
            }

            console.log(`\n   ✅ Total holders fetched: ${allHolders.length}`);
            return allHolders;
        } catch (error) {
            console.error("\n❌ Error fetching token holders from API:", error.message);
            throw error;
        }
    }

    /**
     * Process and filter holders
     */
    async processHolders(holders, decimals) {
        console.log("\n💰 Processing holder data...");

        const processedHolders = [];
        let filteredCount = 0;

        for (let i = 0; i < holders.length; i++) {
            const holder = holders[i];
            const progress = ((i / holders.length) * 100).toFixed(2);
            process.stdout.write(`\r   Processing ${i + 1}/${holders.length} (${progress}% complete)`);

            try {
                // The API returns balance in wei (as a string)
                const balanceWei = BigInt(holder.TokenHolderQuantity);
                const formattedBalance = ethers.formatUnits(balanceWei, decimals);
                const numericBalance = parseFloat(formattedBalance);

                if (numericBalance >= CONFIG.MIN_BALANCE) {
                    processedHolders.push({
                        address: holder.TokenHolderAddress,
                        balance: formattedBalance,
                        balanceRaw: balanceWei.toString()
                    });
                } else {
                    filteredCount++;
                }
            } catch (error) {
                console.error(`\n   ⚠️  Error processing holder ${holder.TokenHolderAddress}: ${error.message}`);
            }
        }

        console.log(`\n   ✅ Active holders with balance >= ${CONFIG.MIN_BALANCE}: ${processedHolders.length}`);
        console.log(`   📉 Filtered out (below threshold): ${filteredCount}`);

        return processedHolders;
    }

    /**
     * Calculate holder statistics
     */
    calculateStatistics(holders, totalSupply, decimals) {
        console.log("\n📈 Calculating statistics...");

        // Sort holders by balance (descending)
        holders.sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));

        // Calculate distribution
        const totalSupplyNum = parseFloat(totalSupply);
        let cumulativeBalance = 0;

        const holdersWithPercentage = holders.map((holder, index) => {
            const balance = parseFloat(holder.balance);
            const percentage = (balance / totalSupplyNum) * 100;
            cumulativeBalance += balance;
            const rank = index + 1;

            return {
                rank,
                ...holder,
                percentage: percentage.toFixed(6),
                percentageNum: percentage
            };
        });

        // Find top 10, top 50, top 100 concentration
        const top10 = holdersWithPercentage.slice(0, 10);
        const top50 = holdersWithPercentage.slice(0, 50);
        const top100 = holdersWithPercentage.slice(0, 100);

        const top10Percentage = top10.reduce((sum, h) => sum + h.percentageNum, 0);
        const top50Percentage = top50.reduce((sum, h) => sum + h.percentageNum, 0);
        const top100Percentage = top100.reduce((sum, h) => sum + h.percentageNum, 0);

        const statistics = {
            totalHolders: holders.length,
            totalSupply: totalSupply,
            totalHeldTokens: cumulativeBalance.toFixed(decimals),
            averageBalance: (cumulativeBalance / holders.length).toFixed(decimals),
            medianBalance: holders[Math.floor(holders.length / 2)] ? holders[Math.floor(holders.length / 2)].balance : "0",
            top10Concentration: top10Percentage.toFixed(2) + "%",
            top50Concentration: top50Percentage.toFixed(2) + "%",
            top100Concentration: top100Percentage.toFixed(2) + "%",
            largestHolder: holders[0]
        };

        console.log(`   Total Holders: ${statistics.totalHolders}`);
        console.log(`   Average Balance: ${statistics.averageBalance}`);
        console.log(`   Median Balance: ${statistics.medianBalance}`);
        console.log(`   Top 10 Concentration: ${statistics.top10Concentration}`);
        console.log(`   Top 50 Concentration: ${statistics.top50Concentration}`);
        console.log(`   Top 100 Concentration: ${statistics.top100Concentration}`);

        return { holdersWithStats: holdersWithPercentage, statistics };
    }

    /**
     * Save results to file
     */
    async saveResults(data, metadata, statistics) {
        try {
            // Create output directory if it doesn't exist
            if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
                fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const fileName = `token_holders_${metadata.symbol}_${timestamp}.json`;
            const filePath = path.join(CONFIG.OUTPUT_DIR, fileName);

            const output = {
                metadata,
                statistics,
                fetchedAt: new Date().toISOString(),
                method: "PolygonScan API",
                holders: data
            };

            fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
            console.log(`\n💾 Results saved to: ${filePath}`);

            // Also save a CSV version
            const csvFileName = `token_holders_${metadata.symbol}_${timestamp}.csv`;
            const csvFilePath = path.join(CONFIG.OUTPUT_DIR, csvFileName);

            const csvHeader = "Rank,Address,Balance,Percentage\n";
            const csvRows = data.map(h => `${h.rank},"${h.address}",${h.balance},${h.percentage}%`).join("\n");

            fs.writeFileSync(csvFilePath, csvHeader + csvRows);
            console.log(`💾 CSV saved to: ${csvFilePath}`);

            return { jsonPath: filePath, csvPath: csvFilePath };
        } catch (error) {
            console.error("❌ Error saving results:", error.message);
            throw error;
        }
    }

    /**
     * Main execution method
     */
    async fetchAllHolders() {
        try {
            console.log("\n🚀 Starting Token Holders Fetcher (PolygonScan API)");
            console.log("=".repeat(50));

            // Step 1: Get token metadata
            const metadata = await this.getTokenMetadata();

            // Step 2: Get holders from PolygonScan API
            const holders = await this.getTokenHoldersFromAPI();

            // Step 3: Process and filter holders
            const processedHolders = await this.processHolders(holders, metadata.decimals);

            // Step 4: Calculate statistics
            const { holdersWithStats, statistics } = this.calculateStatistics(
                processedHolders,
                metadata.totalSupply,
                metadata.decimals
            );

            // Step 5: Save results
            const files = await this.saveResults(holdersWithStats, metadata, statistics);

            console.log("\n✅ Process completed successfully!");
            console.log("=".repeat(50));

            return {
                metadata,
                statistics,
                holders: holdersWithStats,
                files
            };
        } catch (error) {
            console.error("\n❌ Fatal error:", error.message);

            // Provide helpful error messages
            if (error.message.includes("Invalid API Key")) {
                console.error("\n💡 Tip: Get a free API key at https://polygonscan.com/apis");
                console.error("   Then update CONFIG.POLYGONSCAN_API_KEY in the script");
            } else if (error.message.includes("Max rate limit")) {
                console.error("\n💡 Tip: You've hit the rate limit. Wait a minute and try again,");
                console.error("   or upgrade your PolygonScan API plan for higher limits");
            }

            throw error;
        }
    }
}

/**
 * Main function
 */
async function main() {
    try {
        // Check if API key is set
        if (CONFIG.POLYGONSCAN_API_KEY === "YourApiKeyToken") {
            console.error("\n❌ Please set a valid POLYGONSCAN_API_KEY in the CONFIG object");
            console.log("\n📝 To get a free API key:");
            console.log("   1. Go to https://polygonscan.com/");
            console.log("   2. Sign up for a free account");
            console.log("   3. Go to https://polygonscan.com/myapikey");
            console.log("   4. Create a new API key");
            console.log("   5. Copy the API key and paste it in CONFIG.POLYGONSCAN_API_KEY");
            console.log("\n💡 Free tier allows 5 requests/second, which is perfect for this script!");
            process.exit(1);
        }

        // Check if token address is provided
        if (CONFIG.TOKEN_ADDRESS === "0x0000000000000000000000000000000000000000") {
            console.error("\n❌ Please set a valid TOKEN_ADDRESS in the CONFIG object");
            console.log("\nYou can set it by either:");
            console.log("1. Editing the CONFIG.TOKEN_ADDRESS in the script");
            console.log("2. Passing it as a command line argument:");
            console.log("   node getTokenHoldersAPI.js <TOKEN_ADDRESS>");
            process.exit(1);
        }

        // Allow passing token address as command line argument
        const tokenAddress = process.argv[2] || CONFIG.TOKEN_ADDRESS;

        // Validate address
        if (!ethers.isAddress(tokenAddress)) {
            console.error("❌ Invalid token address:", tokenAddress);
            process.exit(1);
        }

        console.log("\n🔧 Configuration:");
        console.log(`   Token Address: ${tokenAddress}`);
        console.log(`   API: PolygonScan`);
        console.log(`   Min Balance: ${CONFIG.MIN_BALANCE}`);
        console.log(`   Page Size: ${CONFIG.PAGE_SIZE}`);

        const startTime = Date.now();
        const fetcher = new TokenHoldersFetcherAPI(tokenAddress, CONFIG.POLYGONSCAN_API_KEY, CONFIG.RPC_URL);
        const results = await fetcher.fetchAllHolders();
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        console.log("\n📋 Summary:");
        console.log(`   Token: ${results.metadata.name} (${results.metadata.symbol})`);
        console.log(`   Total Holders: ${results.statistics.totalHolders}`);
        console.log(`   Time Taken: ${duration} seconds ⚡`);
        console.log(`   JSON File: ${results.files.jsonPath}`);
        console.log(`   CSV File: ${results.files.csvPath}`);

    } catch (error) {
        console.error("\n❌ Application error:", error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { TokenHoldersFetcherAPI, CONFIG };