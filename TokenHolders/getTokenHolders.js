const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Configuration - Read from environment variables or use defaults
const CONFIG = {
    // Polygon RPC endpoint
    RPC_URL: process.env.RPC_URL || "https://polygon-rpc.com",
    // Alternative RPC URLs (in case one fails)
    ALTERNATIVE_RPC_URLS: process.env.ALTERNATIVE_RPC_URLS ?
        process.env.ALTERNATIVE_RPC_URLS.split(',') : [
            "https://polygon.llamarpc.com",
            "https://rpc-mainnet.matic.network",
            "https://polygon-bor-rpc.publicnode.com"
        ],
    // Token contract address (change this to your target token)
    TOKEN_ADDRESS: process.env.TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",
    // Minimum balance to consider (in human-readable format)
    MIN_BALANCE: parseFloat(process.env.MIN_BALANCE) || 0.0001,
    // Output file path
    OUTPUT_DIR: process.env.OUTPUT_DIR || "./output",
    // Batch size for balance checks
    BATCH_SIZE: parseInt(process.env.BATCH_SIZE) || 100,
    // Block range for event queries (to avoid timeouts)
    BLOCK_RANGE: parseInt(process.env.BLOCK_RANGE) || 10000
};

// Standard ERC20 ABI
const ERC20_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function totalSupply() view returns (uint256)"
];

class TokenHoldersFetcher {
    constructor(tokenAddress, rpcUrl) {
        this.tokenAddress = tokenAddress;
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
        this.holders = new Map(); // address -> balance
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
     * Get all Transfer events from the token contract
     */
    async getAllTransferEvents() {
        try {
            console.log("\n🔍 Fetching Transfer events...");
            const currentBlock = await this.provider.getBlockNumber();
            console.log(`   Current block: ${currentBlock}`);

            // Get contract creation block (or use 0 if unknown)
            const fromBlock = 0; // You can optimize by finding the contract creation block
            const toBlock = currentBlock;

            const allEvents = [];
            const blockRange = CONFIG.BLOCK_RANGE;

            // Fetch events in chunks to avoid timeout
            for (let start = fromBlock; start <= toBlock; start += blockRange) {
                const end = Math.min(start + blockRange - 1, toBlock);
                const progress = ((start - fromBlock) / (toBlock - fromBlock) * 100).toFixed(2);

                process.stdout.write(`\r   Fetching blocks ${start} to ${end} (${progress}% complete)`);

                try {
                    const filter = this.contract.filters.Transfer();
                    const events = await this.contract.queryFilter(filter, start, end);
                    allEvents.push(...events);
                } catch (error) {
                    console.error(`\n   ⚠️  Error fetching blocks ${start}-${end}: ${error.message}`);
                    // Continue with next batch
                }
            }

            console.log(`\n   ✅ Total Transfer events found: ${allEvents.length}`);
            return allEvents;
        } catch (error) {
            console.error("\n❌ Error fetching transfer events:", error.message);
            throw error;
        }
    }

    /**
     * Extract unique addresses from Transfer events
     */
    extractUniqueAddresses(events) {
        console.log("\n📝 Extracting unique addresses...");
        const addresses = new Set();

        // Zero address (burn address) - we'll filter this out
        const zeroAddress = ethers.ZeroAddress;

        for (const event of events) {
            const from = event.args.from;
            const to = event.args.to;

            // Add addresses (excluding zero address for 'from' in mints)
            if (from !== zeroAddress) {
                addresses.add(from);
            }
            if (to !== zeroAddress) {
                addresses.add(to);
            }
        }

        console.log(`   Unique addresses found: ${addresses.size}`);
        return Array.from(addresses);
    }

    /**
     * Get current balances for all addresses
     */
    async getCurrentBalances(addresses, decimals) {
        console.log("\n💰 Fetching current balances...");
        const batchSize = CONFIG.BATCH_SIZE;
        const holders = [];

        for (let i = 0; i < addresses.length; i += batchSize) {
            const batch = addresses.slice(i, i + batchSize);
            const progress = ((i / addresses.length) * 100).toFixed(2);
            process.stdout.write(`\r   Processing ${i + batch.length}/${addresses.length} addresses (${progress}% complete)`);

            try {
                const balancePromises = batch.map(async(address) => {
                    try {
                        const balance = await this.contract.balanceOf(address);
                        return { address, balance };
                    } catch (error) {
                        console.error(`\n   ⚠️  Error fetching balance for ${address}: ${error.message}`);
                        return { address, balance: BigInt(0) };
                    }
                });

                const results = await Promise.all(balancePromises);

                // Filter out zero balances and format
                for (const { address, balance }
                    of results) {
                    const formattedBalance = ethers.formatUnits(balance, decimals);
                    const numericBalance = parseFloat(formattedBalance);

                    if (numericBalance >= CONFIG.MIN_BALANCE) {
                        holders.push({
                            address,
                            balance: formattedBalance,
                            balanceRaw: balance.toString()
                        });
                    }
                }
            } catch (error) {
                console.error(`\n   ⚠️  Error processing batch: ${error.message}`);
            }
        }

        console.log(`\n   ✅ Active holders with balance >= ${CONFIG.MIN_BALANCE}: ${holders.length}`);
        return holders;
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
            console.log("\n🚀 Starting Token Holders Fetcher");
            console.log("=".repeat(50));

            // Step 1: Get token metadata
            const metadata = await this.getTokenMetadata();

            // Step 2: Get all transfer events
            const events = await this.getAllTransferEvents();

            // Step 3: Extract unique addresses
            const addresses = this.extractUniqueAddresses(events);

            // Step 4: Get current balances
            const holders = await this.getCurrentBalances(addresses, metadata.decimals);

            // Step 5: Calculate statistics
            const { holdersWithStats, statistics } = this.calculateStatistics(
                holders,
                metadata.totalSupply,
                metadata.decimals
            );

            // Step 6: Save results
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
            throw error;
        }
    }
}

/**
 * Main function
 */
async function main() {
    try {
        // Check if token address is provided
        if (CONFIG.TOKEN_ADDRESS === "0x0000000000000000000000000000000000000000") {
            console.error("❌ Please set a valid TOKEN_ADDRESS in the CONFIG object");
            console.log("\nYou can set it by either:");
            console.log("1. Editing the CONFIG.TOKEN_ADDRESS in the script");
            console.log("2. Passing it as a command line argument:");
            console.log("   node getTokenHolders.js <TOKEN_ADDRESS>");
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
        console.log(`   RPC URL: ${CONFIG.RPC_URL}`);
        console.log(`   Min Balance: ${CONFIG.MIN_BALANCE}`);
        console.log(`   Block Range: ${CONFIG.BLOCK_RANGE}`);

        const fetcher = new TokenHoldersFetcher(tokenAddress, CONFIG.RPC_URL);
        const results = await fetcher.fetchAllHolders();

        console.log("\n📋 Summary:");
        console.log(`   Token: ${results.metadata.name} (${results.metadata.symbol})`);
        console.log(`   Total Holders: ${results.statistics.totalHolders}`);
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

module.exports = { TokenHoldersFetcher, CONFIG };