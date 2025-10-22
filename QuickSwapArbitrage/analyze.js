const ArbitrageCalculator = require('./calculateArbitrage');
const QuickSwapLPAnalyzer = require('./getLPData');
const config = require('./config');
const fs = require('fs');
const path = require('path');

class QuickSwapArbitrageAnalyzer {
    constructor() {
        this.arbitrageCalculator = new ArbitrageCalculator();
        this.lpAnalyzer = new QuickSwapLPAnalyzer();
    }

    /**
     * Generate comprehensive arbitrage report
     */
    async generateReport(projectName = null, targetSupply = null) {
        console.log('🚀 Starting Comprehensive Arbitrage Analysis...\n');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const reportsDir = path.join(__dirname, 'reports');

        // Create reports directory if it doesn't exist
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        let results = [];

        if (projectName) {
            // Analyze single project
            const projectData = config.projects[projectName.toUpperCase()];
            if (!projectData) {
                console.error(`❌ Project "${projectName}" not found`);
                return;
            }

            const result = await this.arbitrageCalculator.calculateArbitrage(projectName.toUpperCase(), targetSupply);
            if (result) {
                results = [result];
            }
        } else {
            // Analyze all projects
            results = await this.arbitrageCalculator.analyzeAllArbitrage(targetSupply);
        }

        if (results.length === 0) {
            console.log('❌ No arbitrage opportunities found');
            return;
        }

        // Generate JSON report
        const jsonReport = {
            timestamp: new Date().toISOString(),
            targetSupply: targetSupply || config.analysis.targetSupply,
            totalProjects: results.length,
            arbitrageOpportunities: results.filter(r => r.strategy !== 'no_arbitrage').length,
            results: results.map(result => ({
                projectName: result.projectName,
                strategy: result.strategy,
                bondingCurvePrice: result.bondingCurvePrice,
                quickswapPrice: result.quickswapPrice,
                priceDifference: result.priceDifference,
                arbitragePercentage: result.arbitragePercentage,
                lpData: result.lpData ? {
                    pairAddress: result.lpData.pairAddress,
                    tokenSymbol: result.lpData.tokenSymbol,
                    liquidity: result.lpData.totalLiquidityWMATIC,
                    reserves: {
                        wmatic: result.lpData.wmaticReserve,
                        token: result.lpData.tokenReserve
                    }
                } : null,
                tokensToBuy: result.tokensToBuy ? {
                    wmaticNeeded: result.tokensToBuy.wmaticNeeded,
                    tokensReceived: result.tokensToBuy.tokensReceived,
                    slippage: result.tokensToBuy.slippage
                } : null
            }))
        };

        // Save JSON report
        const jsonPath = path.join(reportsDir, `arbitrage_${timestamp}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

        // Generate Markdown report
        const markdownReport = this.generateMarkdownReport(jsonReport);
        const mdPath = path.join(reportsDir, `arbitrage_${timestamp}.md`);
        fs.writeFileSync(mdPath, markdownReport);

        console.log(`\n📄 Reports saved:`);
        console.log(`   JSON: ${jsonPath}`);
        console.log(`   MD:   ${mdPath}`);

        // Display summary
        this.displaySummary(results);
    }

    /**
     * Generate Markdown report
     */
    generateMarkdownReport(data) {
        const { results, timestamp, targetSupply } = data;

        let markdown = `# QuickSwap Arbitrage Analysis Report\n\n`;
        markdown += `**Generated:** ${new Date(timestamp).toLocaleString()}\n`;
        markdown += `**Target Supply:** ${targetSupply ? targetSupply.toLocaleString() : 'Current'}\n`;
        markdown += `**Total Projects:** ${results.length}\n`;
        markdown += `**Arbitrage Opportunities:** ${results.filter(r => r.strategy !== 'no_arbitrage').length}\n\n`;

        // Summary table
        markdown += `## Summary\n\n`;
        markdown += `| Project | Strategy | BC Price | QS Price | Profit % |\n`;
        markdown += `|---------|----------|----------|-----------|----------|\n`;

        results.forEach(result => {
            const strategy = result.strategy === 'buy_quickswap_sell_bonding' ? 'QS→BC' :
                result.strategy === 'buy_bonding_sell_quickswap' ? 'BC→QS' : 'None';
            markdown += `| ${result.projectName} | ${strategy} | ${result.bondingCurvePrice.toFixed(6)} | ${result.quickswapPrice.toFixed(6)} | ${result.arbitragePercentage.toFixed(2)}% |\n`;
        });

        // Detailed analysis
        markdown += `\n## Detailed Analysis\n\n`;

        results.forEach(result => {
            markdown += `### ${result.projectName}\n\n`;
            markdown += `**Strategy:** ${result.strategy}\n`;
            markdown += `**Bonding Curve Price:** ${result.bondingCurvePrice.toFixed(8)} WMATIC/token\n`;
            markdown += `**QuickSwap Price:** ${result.quickswapPrice.toFixed(8)} WMATIC/token\n`;
            markdown += `**Price Difference:** ${result.priceDifference.toFixed(8)} WMATIC/token\n`;
            markdown += `**Arbitrage Percentage:** ${result.arbitragePercentage.toFixed(2)}%\n\n`;

            if (result.lpData) {
                markdown += `**LP Information:**\n`;
                markdown += `- Pair Address: \`${result.lpData.pairAddress}\`\n`;
                markdown += `- Token: ${result.lpData.tokenSymbol}\n`;
                markdown += `- Total Liquidity: ${result.lpData.totalLiquidityWMATIC.toFixed(2)} WMATIC\n`;
                markdown += `- WMATIC Reserve: ${result.lpData.wmaticReserve.toFixed(2)} WMATIC\n`;
                markdown += `- Token Reserve: ${result.lpData.tokenReserve.toFixed(2)} tokens\n\n`;
            }

            if (result.tokensToBuy) {
                markdown += `**Arbitrage Calculation:**\n`;
                markdown += `- WMATIC Needed: ${result.tokensToBuy.wmaticNeeded.toFixed(6)} WMATIC\n`;
                markdown += `- Tokens Received: ${result.tokensToBuy.tokensReceived.toFixed(2)} tokens\n`;
                markdown += `- Slippage: ${result.tokensToBuy.slippage.toFixed(2)}%\n\n`;
            }

            markdown += `---\n\n`;
        });

        return markdown;
    }

    /**
     * Display summary in console
     */
    displaySummary(results) {
        console.log('\n📊 Arbitrage Summary:');
        console.log('═'.repeat(100));
        console.log(`${'Project'.padEnd(25)} | ${'Strategy'.padEnd(20)} | ${'BC Price'.padStart(10)} | ${'QS Price'.padStart(10)} | ${'Profit %'.padStart(8)}`);
        console.log('═'.repeat(100));

        results.forEach(result => {
            const strategy = result.strategy === 'buy_quickswap_sell_bonding' ? 'QS→BC' :
                result.strategy === 'buy_bonding_sell_quickswap' ? 'BC→QS' : 'None';
            console.log(`${result.projectName.padEnd(25)} | ${strategy.padEnd(20)} | ${result.bondingCurvePrice.toFixed(6).padStart(10)} | ${result.quickswapPrice.toFixed(6).padStart(10)} | ${result.arbitragePercentage.toFixed(2).padStart(8)}%`);
        });

        const opportunities = results.filter(r => r.strategy !== 'no_arbitrage');
        if (opportunities.length > 0) {
            console.log('\n💰 Best Opportunities:');
            opportunities.slice(0, 3).forEach((result, index) => {
                console.log(`${index + 1}. ${result.projectName}: ${result.arbitragePercentage.toFixed(2)}% profit`);
            });
        }
    }

    /**
     * Quick price comparison for all projects
     */
    async quickCompare() {
        console.log('🔍 Quick Price Comparison...\n');

        const comparisons = [];

        for (const [projectName, projectData] of Object.entries(config.projects)) {
            try {
                // Get bonding curve price
                const bondingCurveData = await this.arbitrageCalculator.getBondingCurvePrice(projectName);

                // Get QuickSwap LP data
                const lpData = await this.lpAnalyzer.analyzeProject(projectName, projectData);

                if (bondingCurveData && lpData) {
                    const priceDiff = ((bondingCurveData.currentBuyPrice - lpData.tokenPrice) / lpData.tokenPrice) * 100;

                    comparisons.push({
                        project: projectName,
                        bondingCurvePrice: bondingCurveData.currentBuyPrice,
                        quickswapPrice: lpData.tokenPrice,
                        priceDifference: priceDiff,
                        liquidity: lpData.totalLiquidityWMATIC
                    });
                }

                // Small delay
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error analyzing ${projectName}:`, error.message);
            }
        }

        // Sort by price difference
        comparisons.sort((a, b) => Math.abs(b.priceDifference) - Math.abs(a.priceDifference));

        console.log('\n📊 Price Comparison Results:');
        console.log('═'.repeat(90));
        console.log(`${'Project'.padEnd(25)} | ${'BC Price'.padStart(10)} | ${'QS Price'.padStart(10)} | ${'Diff %'.padStart(8)} | ${'Liquidity'.padStart(10)}`);
        console.log('═'.repeat(90));

        comparisons.forEach(comp => {
            console.log(`${comp.project.padEnd(25)} | ${comp.bondingCurvePrice.toFixed(6).padStart(10)} | ${comp.quickswapPrice.toFixed(6).padStart(10)} | ${comp.priceDifference.toFixed(2).padStart(8)}% | ${comp.liquidity.toFixed(0).padStart(10)} WMATIC`);
        });

        return comparisons;
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
┌─────────────────────────────────────────────────────────────┐
│         QuickSwap Arbitrage Analyzer                       │
└─────────────────────────────────────────────────────────────┘

Usage:
  node analyze.js [project_name] [target_supply] [--compare]

Arguments:
  project_name    Project name to analyze (optional, analyzes all if not provided)
  target_supply   Target supply for bonding curve analysis (optional)

Flags:
  --compare       Quick price comparison only (no detailed analysis)

Examples:
  # Analyze all projects
  node analyze.js

  # Analyze specific project
  node analyze.js AKARUN

  # Quick price comparison
  node analyze.js --compare

  # Analyze with target supply
  node analyze.js AKARUN 7500000

Features:
  ✓ Compares bonding curve vs QuickSwap prices
  ✓ Calculates arbitrage opportunities
  ✓ Generates detailed reports (JSON + Markdown)
  ✓ Considers liquidity and slippage
  ✓ Provides optimal trading strategies
        `);
        process.exit(0);
    }

    const analyzer = new QuickSwapArbitrageAnalyzer();

    if (args.includes('--compare')) {
        // Quick comparison only
        await analyzer.quickCompare();
    } else {
        // Full analysis
        const projectName = args[0];
        const targetSupply = args[1] ? parseFloat(args[1]) : null;

        await analyzer.generateReport(projectName, targetSupply);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('\n❌ Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = QuickSwapArbitrageAnalyzer;