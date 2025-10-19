/**
 * Batch Token Analyzer
 * Analyze multiple tokens in sequence and generate a comparison report
 * 
 * Usage: node batchAnalyze.js
 */

const { TokenHoldersFetcher, CONFIG } = require("./getTokenHolders");
const fs = require("fs");
const path = require("path");

// Configure tokens to analyze
const TOKENS_TO_ANALYZE = [{
        name: "USDC",
        address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        enabled: false // Set to true to analyze
    },
    {
        name: "USDT",
        address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        enabled: false
    },
    {
        name: "WETH",
        address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
        enabled: false
    },
    {
        name: "WMATIC",
        address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        enabled: false
    },
    {
        name: "DAI",
        address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        enabled: false
    },
    // Add your custom tokens here:
    // {
    //     name: "My Custom Token",
    //     address: "0x...",
    //     enabled: true
    // }
];

class BatchAnalyzer {
    constructor(tokens) {
        this.tokens = tokens.filter(t => t.enabled);
        this.results = [];
    }

    /**
     * Analyze all enabled tokens
     */
    async analyzeAll() {
        console.log("\n🚀 Starting Batch Token Analysis");
        console.log("=".repeat(60));
        console.log(`📊 Tokens to analyze: ${this.tokens.length}`);

        if (this.tokens.length === 0) {
            console.log("\n⚠️  No tokens enabled for analysis!");
            console.log("Edit batchAnalyze.js and set 'enabled: true' for tokens you want to analyze.");
            return;
        }

        console.log("\n📝 Token list:");
        this.tokens.forEach((token, index) => {
            console.log(`   ${index + 1}. ${token.name} (${token.address})`);
        });
        console.log("=".repeat(60));

        const startTime = Date.now();

        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            console.log(`\n\n${"=".repeat(60)}`);
            console.log(`📈 Analyzing ${i + 1}/${this.tokens.length}: ${token.name}`);
            console.log("=".repeat(60));

            try {
                const fetcher = new TokenHoldersFetcher(token.address, CONFIG.RPC_URL);
                const result = await fetcher.fetchAllHolders();

                this.results.push({
                    tokenName: token.name,
                    address: token.address,
                    success: true,
                    ...result
                });

                console.log(`\n✅ ${token.name} analysis completed`);
            } catch (error) {
                console.error(`\n❌ Failed to analyze ${token.name}:`, error.message);
                this.results.push({
                    tokenName: token.name,
                    address: token.address,
                    success: false,
                    error: error.message
                });
            }

            // Add a small delay between tokens to avoid rate limiting
            if (i < this.tokens.length - 1) {
                console.log("\n⏳ Waiting 5 seconds before next token...");
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);

        console.log("\n\n" + "=".repeat(60));
        console.log("✅ Batch Analysis Complete!");
        console.log(`⏱️  Total time: ${duration} minutes`);
        console.log("=".repeat(60));

        // Generate comparison report
        this.generateComparisonReport();
    }

    /**
     * Generate a comparison report of all analyzed tokens
     */
    generateComparisonReport() {
        console.log("\n📊 Generating comparison report...");

        const successfulResults = this.results.filter(r => r.success);

        if (successfulResults.length === 0) {
            console.log("❌ No successful analyses to compare");
            return;
        }

        // Create comparison table
        const comparison = successfulResults.map(result => ({
            token: result.metadata.name,
            symbol: result.metadata.symbol,
            totalSupply: result.metadata.totalSupply,
            holders: result.statistics.totalHolders,
            avgBalance: result.statistics.averageBalance,
            medianBalance: result.statistics.medianBalance,
            top10: result.statistics.top10Concentration,
            top50: result.statistics.top50Concentration,
            top100: result.statistics.top100Concentration
        }));

        // Print comparison table
        console.log("\n📋 Token Comparison:");
        console.log("=".repeat(100));
        console.log("| Token | Symbol | Holders | Avg Balance | Median | Top 10% | Top 50% | Top 100% |");
        console.log("|-------|--------|---------|-------------|--------|---------|---------|----------|");

        comparison.forEach(c => {
            const token = c.token.padEnd(15).substring(0, 15);
            const symbol = c.symbol.padEnd(8).substring(0, 8);
            const holders = String(c.holders).padStart(8);
            const avg = String(c.avgBalance).substring(0, 12).padStart(12);
            const median = String(c.medianBalance).substring(0, 8).padStart(8);
            const top10 = c.top10.padStart(7);
            const top50 = c.top50.padStart(7);
            const top100 = c.top100.padStart(7);

            console.log(`| ${token} | ${symbol} | ${holders} | ${avg} | ${median} | ${top10} | ${top50} | ${top100} |`);
        });
        console.log("=".repeat(100));

        // Save comparison report
        this.saveComparisonReport(comparison);
    }

    /**
     * Save comparison report to file
     */
    saveComparisonReport(comparison) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const fileName = `comparison_report_${timestamp}.json`;
            const filePath = path.join(CONFIG.OUTPUT_DIR, fileName);

            const report = {
                generatedAt: new Date().toISOString(),
                tokensAnalyzed: this.results.length,
                successfulAnalyses: this.results.filter(r => r.success).length,
                failedAnalyses: this.results.filter(r => !r.success).length,
                comparison,
                fullResults: this.results
            };

            fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
            console.log(`\n💾 Comparison report saved: ${filePath}`);

            // Also save CSV
            const csvFileName = `comparison_report_${timestamp}.csv`;
            const csvFilePath = path.join(CONFIG.OUTPUT_DIR, csvFileName);

            const csvHeader = "Token,Symbol,Total Supply,Holders,Avg Balance,Median Balance,Top 10%,Top 50%,Top 100%\n";
            const csvRows = comparison.map(c =>
                `"${c.token}","${c.symbol}",${c.totalSupply},${c.holders},${c.avgBalance},${c.medianBalance},${c.top10},${c.top50},${c.top100}`
            ).join("\n");

            fs.writeFileSync(csvFilePath, csvHeader + csvRows);
            console.log(`💾 CSV report saved: ${csvFilePath}`);

            // Print file locations
            console.log("\n📁 Output files:");
            console.log(`   Comparison JSON: ${filePath}`);
            console.log(`   Comparison CSV: ${csvFilePath}`);

            // List individual token reports
            console.log("\n   Individual token reports:");
            this.results.filter(r => r.success).forEach(r => {
                console.log(`   - ${r.metadata.name}: ${r.files.jsonPath}`);
            });

        } catch (error) {
            console.error("❌ Error saving comparison report:", error.message);
        }
    }
}

/**
 * Main function
 */
async function main() {
    try {
        console.log("\n🔧 Batch Token Analyzer for Polygon Network");
        console.log("=".repeat(60));

        const analyzer = new BatchAnalyzer(TOKENS_TO_ANALYZE);
        await analyzer.analyzeAll();

        console.log("\n✅ All done! Check the output directory for results.\n");
    } catch (error) {
        console.error("\n❌ Fatal error:", error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { BatchAnalyzer, TOKENS_TO_ANALYZE };