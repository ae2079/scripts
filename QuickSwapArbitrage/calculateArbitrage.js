const { ethers } = require('ethers');
const axios = require('axios');
const config = require('./config');
const QuickSwapLPAnalyzer = require('./getLPData');

class ArbitrageCalculator {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(config.rpc.polygon);
        this.lpAnalyzer = new QuickSwapLPAnalyzer();
    }

    /**
     * Load bonding curve target prices from summary.json
     */
    loadBondingCurveTargetPrices() {
        try {
            const fs = require('fs');
            const path = require('path');

            // Look for summary.json in the BondingCurveSimulator reports directory
            const summaryPath = path.join(__dirname, '../BondingCurveSimulator/reports/summary.json');

            if (!fs.existsSync(summaryPath)) {
                console.log('⚠️  summary.json not found, using current bonding curve prices');
                return null;
            }

            const summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

            // Create a map of project names to target prices
            const targetPrices = {};
            summaryData.projects.forEach(project => {
                if (project.success) {
                    targetPrices[project.name] = {
                        targetBuyPrice: project.targetBuyPrice,
                        targetStaticPrice: project.targetStaticPrice,
                        targetSellPrice: project.targetSellPrice,
                        currentBuyPrice: project.currentBuyPrice,
                        currentSupply: project.currentSupply,
                        targetSupply: project.targetSupply,
                        tokensToBuy: project.tokensToBuy,
                        wpolCost: project.wpolCost,
                        polPrice: project.polPrice
                    };
                }
            });

            console.log(`✓ Loaded target prices for ${Object.keys(targetPrices).length} projects from summary.json`);
            return targetPrices;
        } catch (error) {
            console.error('Error loading target prices:', error.message);
            return null;
        }
    }

    /**
     * Get bonding curve buy price for a project
     */
    async getBondingCurvePrice(projectName, targetSupply = null) {
        try {
            const projectData = config.projects[projectName];
            if (!projectData) {
                throw new Error(`Project ${projectName} not found`);
            }

            // Import bonding curve checker from parent directory
            const bondingCurvePath = '../BondingCurveSimulator/check.js';
            const { accurateCheck } = require(bondingCurvePath);

            // Get current bonding curve price
            const result = await accurateCheck(projectData.bondingCurve, targetSupply, null, false);

            return {
                currentBuyPrice: result.currentPrices ? result.currentPrices.buy ? result.currentPrices.buy.wpol : 0 : 0,
                currentSellPrice: result.currentPrices ? result.currentPrices.sell ? result.currentPrices.sell.wpol : 0 : 0,
                currentStaticPrice: result.currentPrices ? result.currentPrices.static ? result.currentPrices.static.wpol : 0 : 0,
                currentSupply: result.currentState ? result.currentState.supply : 0,
                targetBuyPrice: result.targetAnalysis ? result.targetAnalysis.pricesAtTarget ? result.targetAnalysis.pricesAtTarget.buy ? result.targetAnalysis.pricesAtTarget.buy.wpol : 0 : 0 : 0,
                targetSupply: result.targetAnalysis ? result.targetAnalysis.targetSupply ? result.targetAnalysis.targetSupply : targetSupply : targetSupply,
                polPrice: result.polPrice || 0.195
            };
        } catch (error) {
            console.error(`Error getting bonding curve price for ${projectName}:`, error.message);
            return null;
        }
    }

    /**
     * Calculate tokens needed for both current and target bonding curve prices
     */
    async calculateBothScenarios(projectName) {
        console.log(`\n🔄 Calculating tokens needed for ${projectName} (both scenarios)...`);

        // Get QuickSwap LP data first
        const projectData = config.projects[projectName];
        const lpData = await this.lpAnalyzer.analyzeProject(projectName, projectData);
        if (!lpData) {
            console.log(`❌ No LP found for ${projectName}`);
            return null;
        }

        const quickswapPrice = lpData.tokenPrice;
        console.log(`✓ QuickSwap Price: ${quickswapPrice.toFixed(8)} WPOL/token`);

        // Load target prices from summary.json
        const targetPrices = this.loadBondingCurveTargetPrices();

        const results = {
            projectName,
            quickswapPrice,
            lpData,
            scenarios: {}
        };

        // Scenario 1: Target Price (from summary.json)
        if (targetPrices && targetPrices[projectName]) {
            const targetPrice = targetPrices[projectName].targetBuyPrice;
            console.log(`\n📊 Target Price Scenario:`);
            console.log(`   Bonding Curve TARGET Price: ${targetPrice.toFixed(8)} WPOL/token`);
            console.log(`   QuickSwap Price:         ${quickswapPrice.toFixed(8)} WPOL/token`);

            if (targetPrice > quickswapPrice) {
                const tokensToBuy = await this.lpAnalyzer.calculateTokensToBuyForPrice(lpData, targetPrice);
                const priceDifference = targetPrice - quickswapPrice;

                console.log(`   ✅ Price Equalization Opportunity: ${priceDifference.toFixed(8)} WPOL/token difference`);
                console.log(`   WMATIC needed: ${tokensToBuy.wmaticNeeded.toFixed(6)} WMATIC`);
                console.log(`   Tokens received: ${tokensToBuy.tokensReceived.toFixed(2)} tokens`);

                if (tokensToBuy.liquidityExhausted) {
                    console.log(`   ⚠️  WARNING: LP liquidity exhausted - this is the maximum possible`);
                }

                results.scenarios.target = {
                    bondingCurvePrice: targetPrice,
                    hasOpportunity: true,
                    priceDifference,
                    tokensToBuy,
                    bondingCurveData: targetPrices[projectName]
                };
            } else {
                console.log(`   ❌ No opportunity: QuickSwap price >= Target price`);
                results.scenarios.target = {
                    bondingCurvePrice: targetPrice,
                    hasOpportunity: false,
                    reason: 'QuickSwap price too high'
                };
            }
        }

        // Scenario 2: Current Price (from blockchain)
        console.log(`\n📊 Current Price Scenario:`);
        const currentData = await this.getBondingCurvePrice(projectName);
        if (currentData) {
            const currentPrice = currentData.currentBuyPrice;
            console.log(`   Bonding Curve CURRENT Price: ${currentPrice.toFixed(8)} WPOL/token`);
            console.log(`   QuickSwap Price:         ${quickswapPrice.toFixed(8)} WPOL/token`);

            if (currentPrice > quickswapPrice) {
                const tokensToBuy = await this.lpAnalyzer.calculateTokensToBuyForPrice(lpData, currentPrice);
                const priceDifference = currentPrice - quickswapPrice;

                console.log(`   ✅ Price Equalization Opportunity: ${priceDifference.toFixed(8)} WPOL/token difference`);
                console.log(`   WMATIC needed: ${tokensToBuy.wmaticNeeded.toFixed(6)} WMATIC`);
                console.log(`   Tokens received: ${tokensToBuy.tokensReceived.toFixed(2)} tokens`);

                if (tokensToBuy.liquidityExhausted) {
                    console.log(`   ⚠️  WARNING: LP liquidity exhausted - this is the maximum possible`);
                }

                results.scenarios.current = {
                    bondingCurvePrice: currentPrice,
                    hasOpportunity: true,
                    priceDifference,
                    tokensToBuy,
                    bondingCurveData: currentData
                };
            } else {
                console.log(`   ❌ No opportunity: QuickSwap price >= Current price`);
                results.scenarios.current = {
                    bondingCurvePrice: currentPrice,
                    hasOpportunity: false,
                    reason: 'QuickSwap price too high'
                };
            }
        }

        return results;
    }

    /**
     * Analyze all projects for both current and target scenarios
     */
    async analyzeAllScenarios() {
        console.log(`🚀 Starting Price Equalization Analysis (Both Current & Target Scenarios)...\n`);

        const results = [];

        for (const projectName of Object.keys(config.projects)) {
            const result = await this.calculateBothScenarios(projectName);
            if (result) {
                results.push(result);
            }

            // Delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Generate reports
        const reportPaths = await this.generateScenarioReport(results);

        return { results, reportPaths };
    }

    /**
     * Generate comprehensive scenario report
     */
    async generateScenarioReport(results) {
        const fs = require('fs');
        const path = require('path');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const reportsDir = path.join(__dirname, 'reports');

        // Create reports directory if it doesn't exist
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        // Count opportunities
        let targetOpportunities = 0;
        let currentOpportunities = 0;

        results.forEach(result => {
            if (result.scenarios ? result.scenarios.target ? result.scenarios.target.hasOpportunity : false : false) targetOpportunities++;
            if (result.scenarios ? result.scenarios.current ? result.scenarios.current.hasOpportunity : false : false) currentOpportunities++;
        });

        // Generate JSON report
        const jsonReport = {
            timestamp: new Date().toISOString(),
            analysisType: 'price_equalization',
            summary: {
                totalProjects: results.length,
                targetOpportunities,
                currentOpportunities,
                projectsWithLPs: results.filter(r => r.lpData).length
            },
            projects: results.map(result => ({
                projectName: result.projectName,
                quickswapPrice: result.quickswapPrice,
                scenarios: {
                    target: result.scenarios ? result.scenarios.target ? {
                        bondingCurvePrice: result.scenarios.target.bondingCurvePrice,
                        hasOpportunity: result.scenarios.target.hasOpportunity,
                        priceDifference: result.scenarios.target.priceDifference || 0,
                        wmaticNeeded: result.scenarios.target.tokensToBuy ? result.scenarios.target.tokensToBuy.wmaticNeeded : 0,
                        tokensReceived: result.scenarios.target.tokensToBuy ? result.scenarios.target.tokensToBuy.tokensReceived : 0,
                        slippage: result.scenarios.target.tokensToBuy ? result.scenarios.target.tokensToBuy.slippage : 0,
                        liquidityExhausted: result.scenarios.target.tokensToBuy ? result.scenarios.target.tokensToBuy.liquidityExhausted : false,
                        note: result.scenarios.target.tokensToBuy ? result.scenarios.target.tokensToBuy.note : null,
                        reason: result.scenarios.target.reason || null
                    } : null : null,
                    current: result.scenarios ? result.scenarios.current ? {
                        bondingCurvePrice: result.scenarios.current.bondingCurvePrice,
                        hasOpportunity: result.scenarios.current.hasOpportunity,
                        priceDifference: result.scenarios.current.priceDifference || 0,
                        wmaticNeeded: result.scenarios.current.tokensToBuy ? result.scenarios.current.tokensToBuy.wmaticNeeded : 0,
                        tokensReceived: result.scenarios.current.tokensToBuy ? result.scenarios.current.tokensToBuy.tokensReceived : 0,
                        slippage: result.scenarios.current.tokensToBuy ? result.scenarios.current.tokensToBuy.slippage : 0,
                        liquidityExhausted: result.scenarios.current.tokensToBuy ? result.scenarios.current.tokensToBuy.liquidityExhausted : false,
                        note: result.scenarios.current.tokensToBuy ? result.scenarios.current.tokensToBuy.note : null,
                        reason: result.scenarios.current.reason || null
                    } : null : null
                }
            }))
        };

        const jsonPath = path.join(reportsDir, `price_equalization_${timestamp}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

        // Generate Markdown report
        let markdown = `# QuickSwap Price Equalization Analysis\n\n`;
        markdown += `**Generated:** ${new Date().toLocaleString()}\n\n`;
        markdown += `## Summary\n\n`;
        markdown += `- **Total Projects:** ${results.length}\n`;
        markdown += `- **Target Price Opportunities:** ${targetOpportunities}\n`;
        markdown += `- **Current Price Opportunities:** ${currentOpportunities}\n`;
        markdown += `- **Projects with LPs:** ${results.filter(r => r.lpData).length}\n\n`;

        markdown += `## Target Price Scenarios (7.5M Supply)\n\n`;
        markdown += `| Project | BC Target | QS Price | Price Diff | WMATIC Needed | Tokens | Slippage | Status |\n`;
        markdown += `|---------|-----------|-----------|------------|---------------|--------|----------|--------|\n`;

        results.forEach(result => {
            const target = result.scenarios ? result.scenarios.target ? result.scenarios.target : null : null;
            if (target) {
                if (target.hasOpportunity && target.tokensToBuy) {
                    const status = target.tokensToBuy.liquidityExhausted ? '⚠️ LP Exhausted' : '✅ Available';
                    markdown += `| ${result.projectName} | ${target.bondingCurvePrice.toFixed(6)} | ${result.quickswapPrice.toFixed(6)} | ${target.priceDifference.toFixed(6)} | ${target.tokensToBuy.wmaticNeeded.toFixed(2)} | ${target.tokensToBuy.tokensReceived.toFixed(0)} | ${target.tokensToBuy.slippage.toFixed(2)}% | ${status} |\n`;
                } else {
                    markdown += `| ${result.projectName} | ${target.bondingCurvePrice.toFixed(6)} | ${result.quickswapPrice.toFixed(6)} | ${target.reason || 'No LP'} |\n`;
                }
            }
        });

        markdown += `\n## Current Price Scenarios\n\n`;
        markdown += `| Project | BC Current | QS Price | Price Diff | WMATIC Needed | Tokens | Slippage | Status |\n`;
        markdown += `|---------|-------------|-----------|------------|---------------|--------|----------|--------|\n`;

        results.forEach(result => {
            const current = result.scenarios ? result.scenarios.current ? result.scenarios.current : null : null;
            if (current) {
                if (current.hasOpportunity && current.tokensToBuy) {
                    const status = current.tokensToBuy.liquidityExhausted ? '⚠️ LP Exhausted' : '✅ Available';
                    markdown += `| ${result.projectName} | ${current.bondingCurvePrice.toFixed(6)} | ${result.quickswapPrice.toFixed(6)} | ${current.priceDifference.toFixed(6)} | ${current.tokensToBuy.wmaticNeeded.toFixed(2)} | ${current.tokensToBuy.tokensReceived.toFixed(0)} | ${current.tokensToBuy.slippage.toFixed(2)}% | ${status} |\n`;
                } else {
                    markdown += `| ${result.projectName} | ${current.bondingCurvePrice.toFixed(6)} | ${result.quickswapPrice.toFixed(6)} | ${current.reason || 'No LP'} |\n`;
                }
            }
        });

        const mdPath = path.join(reportsDir, `price_equalization_${timestamp}.md`);
        fs.writeFileSync(mdPath, markdown);

        console.log(`\n📄 Reports saved:`);
        console.log(`   JSON: ${jsonPath}`);
        console.log(`   MD:   ${mdPath}`);

        return { jsonPath, mdPath };
    }
    async calculateTokensToReachBondingCurvePrice(projectName, useTargetPrice = true) {
        console.log(`\n🔄 Calculating tokens needed for ${projectName}...`);

        // Load target prices from summary.json
        const targetPrices = this.loadBondingCurveTargetPrices();

        let bondingCurvePrice;
        let bondingCurveData;

        if (useTargetPrice && targetPrices && targetPrices[projectName]) {
            // Use target price from summary.json
            bondingCurvePrice = targetPrices[projectName].targetBuyPrice;
            bondingCurveData = targetPrices[projectName];
            console.log(`✓ Using TARGET price from summary.json: ${bondingCurvePrice.toFixed(8)} WMATIC/token`);
        } else {
            // Fallback to current price calculation
            console.log(`⚠️  Using current bonding curve price (summary.json not available)`);
            const currentData = await this.getBondingCurvePrice(projectName);
            if (!currentData) {
                console.log(`❌ Failed to get bonding curve data for ${projectName}`);
                return null;
            }
            bondingCurvePrice = currentData.currentBuyPrice;
            bondingCurveData = currentData;
        }

        // Get QuickSwap LP data
        const projectData = config.projects[projectName];
        const lpData = await this.lpAnalyzer.analyzeProject(projectName, projectData);
        if (!lpData) {
            console.log(`❌ No LP found for ${projectName}`);
            return null;
        }

        const quickswapPrice = lpData.tokenPrice;

        console.log(`\n📊 Price Comparison:`);
        console.log(`   Bonding Curve ${useTargetPrice ? 'TARGET' : 'Current'} Price: ${bondingCurvePrice.toFixed(8)} WPOL/token`);
        console.log(`   QuickSwap Price:         ${quickswapPrice.toFixed(8)} WPOL/token`);
        console.log(`   Price Difference:        ${((bondingCurvePrice - quickswapPrice) / quickswapPrice * 100).toFixed(2)}%`);

        // Only proceed if QuickSwap price is lower than bonding curve price
        if (bondingCurvePrice <= quickswapPrice) {
            console.log(`\n❌ No arbitrage opportunity: QuickSwap price (${quickswapPrice.toFixed(8)} WPOL/token) >= Bonding Curve ${useTargetPrice ? 'TARGET' : 'current'} price (${bondingCurvePrice.toFixed(8)} WPOL/token)`);
            return {
                projectName,
                hasArbitrage: false,
                bondingCurvePrice,
                quickswapPrice,
                reason: 'QuickSwap price too high',
                priceType: useTargetPrice ? 'target' : 'current'
            };
        }

        // Calculate how many tokens to buy to reach bonding curve price on QuickSwap
        const tokensToBuy = await this.lpAnalyzer.calculateTokensToBuyForPrice(lpData, bondingCurvePrice);

        const priceDifference = bondingCurvePrice - quickswapPrice;
        const arbitragePercentage = (priceDifference / quickswapPrice) * 100;

        console.log(`\n💰 Arbitrage Opportunity:`);
        console.log(`   Strategy: Buy on QuickSwap, Sell on Bonding Curve`);
        console.log(`   Profit per token: ${priceDifference.toFixed(8)} WPOL`);
        console.log(`   Profit percentage: ${arbitragePercentage.toFixed(2)}%`);

        console.log(`\n🎯 To reach bonding curve ${useTargetPrice ? 'TARGET' : 'current'} price on QuickSwap:`);
        console.log(`   WMATIC needed: ${tokensToBuy.wmaticNeeded.toFixed(6)} WMATIC`);
        console.log(`   Tokens received: ${tokensToBuy.tokensReceived.toFixed(2)} tokens`);
        console.log(`   New QuickSwap price: ${tokensToBuy.newPrice.toFixed(8)} WMATIC/token`);
        console.log(`   Slippage: ${tokensToBuy.slippage.toFixed(2)}%`);

        return {
            projectName,
            hasArbitrage: true,
            bondingCurvePrice,
            quickswapPrice,
            priceDifference,
            arbitragePercentage,
            tokensToBuy,
            lpData,
            bondingCurveData,
            priceType: useTargetPrice ? 'target' : 'current'
        };
    }

    /**
     * Analyze arbitrage opportunities for all projects (QuickSwap → Bonding Curve TARGET prices)
     */
    async analyzeAllArbitrage(useTargetPrice = true) {
        const priceType = useTargetPrice ? 'TARGET' : 'current';
        console.log(`🚀 Starting Arbitrage Analysis (QuickSwap → Bonding Curve ${priceType} prices)...\n`);

        const results = [];

        for (const projectName of Object.keys(config.projects)) {
            const result = await this.calculateTokensToReachBondingCurvePrice(projectName, useTargetPrice);
            if (result) {
                results.push(result);
            }

            // Delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Filter only projects with arbitrage opportunities
        const arbitrageOpportunities = results.filter(r => r.hasArbitrage);

        // Sort by arbitrage percentage
        arbitrageOpportunities.sort((a, b) => b.arbitragePercentage - a.arbitragePercentage);

        console.log(`\n📊 Arbitrage Summary (QuickSwap → Bonding Curve ${priceType} prices):`);
        console.log('═'.repeat(130));
        console.log(`${'Project'.padEnd(25)} | ${'BC Target'.padStart(10)} | ${'QS Price'.padStart(10)} | ${'Profit %'.padStart(8)} | ${'WMATIC Needed'.padStart(12)} | ${'Tokens'.padStart(10)} | ${'Slippage'.padStart(8)}`);
        console.log('═'.repeat(130));

        arbitrageOpportunities.forEach(result => {
            console.log(`${result.projectName.padEnd(25)} | ${result.bondingCurvePrice.toFixed(6).padStart(10)} | ${result.quickswapPrice.toFixed(6).padStart(10)} | ${result.arbitragePercentage.toFixed(2).padStart(8)}% | ${result.tokensToBuy.wmaticNeeded.toFixed(2).padStart(12)} | ${result.tokensToBuy.tokensReceived.toFixed(0).padStart(10)} | ${result.tokensToBuy.slippage.toFixed(2).padStart(8)}%`);
        });

        if (arbitrageOpportunities.length === 0) {
            console.log(`❌ No arbitrage opportunities found (QuickSwap prices >= Bonding Curve ${priceType} prices)`);
        } else {
            console.log(`\n✅ Found ${arbitrageOpportunities.length} arbitrage opportunities`);

            // Show best opportunities
            console.log('\n🏆 Best Opportunities:');
            arbitrageOpportunities.slice(0, 3).forEach((result, index) => {
                console.log(`${index + 1}. ${result.projectName}: ${result.arbitragePercentage.toFixed(2)}% profit (${result.tokensToBuy.wmaticNeeded.toFixed(0)} WMATIC needed)`);
            });
        }

        // Generate reports (even if no arbitrage opportunities)
        const reportPaths = await this.generateArbitrageReport(results, useTargetPrice);

        return { results, reportPaths };
    }

    /**
     * Generate comprehensive arbitrage report
     */
    async generateArbitrageReport(results, useTargetPrice = true) {
        const fs = require('fs');
        const path = require('path');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const reportsDir = path.join(__dirname, 'reports');

        // Create reports directory if it doesn't exist
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const arbitrageOpportunities = results.filter(r => r.hasArbitrage);
        const priceType = useTargetPrice ? 'TARGET' : 'current';

        // Generate JSON report
        const jsonReport = {
            timestamp: new Date().toISOString(),
            priceType: priceType.toLowerCase(),
            totalProjects: results.length,
            arbitrageOpportunities: arbitrageOpportunities.length,
            noArbitrageProjects: results.length - arbitrageOpportunities.length,
            summary: {
                totalWMATICNeeded: arbitrageOpportunities.reduce((sum, r) => sum + r.tokensToBuy.wmaticNeeded, 0),
                totalTokensToBuy: arbitrageOpportunities.reduce((sum, r) => sum + r.tokensToBuy.tokensReceived, 0),
                averageProfitPercentage: arbitrageOpportunities.length > 0 ?
                    arbitrageOpportunities.reduce((sum, r) => sum + r.arbitragePercentage, 0) / arbitrageOpportunities.length : 0,
                bestOpportunity: arbitrageOpportunities.length > 0 ?
                    arbitrageOpportunities[0].projectName : null,
                bestProfitPercentage: arbitrageOpportunities.length > 0 ?
                    arbitrageOpportunities[0].arbitragePercentage : 0
            },
            projects: results.map(result => ({
                projectName: result.projectName,
                hasArbitrage: result.hasArbitrage,
                bondingCurvePrice: result.bondingCurvePrice,
                quickswapPrice: result.quickswapPrice,
                priceDifference: result.priceDifference,
                arbitragePercentage: result.arbitragePercentage,
                reason: result.reason || null,
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
                    slippage: result.tokensToBuy.slippage,
                    newPrice: result.tokensToBuy.newPrice
                } : null
            }))
        };

        // Save JSON report
        const jsonPath = path.join(reportsDir, `arbitrage_${priceType.toLowerCase()}_${timestamp}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

        // Generate Markdown report
        const markdownReport = this.generateMarkdownReport(jsonReport);
        const mdPath = path.join(reportsDir, `arbitrage_${priceType.toLowerCase()}_${timestamp}.md`);
        fs.writeFileSync(mdPath, markdownReport);

        console.log(`\n📄 Reports saved:`);
        console.log(`   JSON: ${jsonPath}`);
        console.log(`   MD:   ${mdPath}`);

        return { jsonPath, mdPath };
    }

    /**
     * Generate Markdown report
     */
    generateMarkdownReport(data) {
        const { projects, timestamp, priceType, summary } = data;
        const arbitrageOpportunities = projects.filter(p => p.hasArbitrage);

        let markdown = `# QuickSwap Arbitrage Analysis Report\n\n`;
        markdown += `**Generated:** ${new Date(timestamp).toLocaleString()}\n`;
        markdown += `**Price Type:** ${priceType.toUpperCase()} Bonding Curve Prices\n`;
        markdown += `**Total Projects:** ${projects.length}\n`;
        markdown += `**Arbitrage Opportunities:** ${arbitrageOpportunities.length}\n`;
        markdown += `**No Arbitrage:** ${projects.length - arbitrageOpportunities.length}\n\n`;

        // Summary section
        markdown += `## Summary\n\n`;
        markdown += `| Metric | Value |\n`;
        markdown += `|--------|-------|\n`;
        markdown += `| Total WMATIC Needed | ${summary.totalWMATICNeeded.toFixed(2)} WMATIC |\n`;
        markdown += `| Total Tokens to Buy | ${summary.totalTokensToBuy.toFixed(0)} tokens |\n`;
        markdown += `| Average Profit % | ${summary.averageProfitPercentage.toFixed(2)}% |\n`;
        markdown += `| Best Opportunity | ${summary.bestOpportunity || 'None'} |\n`;
        markdown += `| Best Profit % | ${summary.bestProfitPercentage.toFixed(2)}% |\n\n`;

        if (arbitrageOpportunities.length > 0) {
            // Arbitrage opportunities table
            markdown += `## Arbitrage Opportunities\n\n`;
            markdown += `| Project | BC ${priceType} Price | QS Price | Profit % | WMATIC Needed | Tokens | Slippage |\n`;
            markdown += `|---------|---------------------|----------|----------|---------------|--------|----------|\n`;

            arbitrageOpportunities.forEach(result => {
                markdown += `| ${result.projectName} | ${result.bondingCurvePrice.toFixed(6)} | ${result.quickswapPrice.toFixed(6)} | ${result.arbitragePercentage.toFixed(2)}% | ${result.tokensToBuy.wmaticNeeded.toFixed(2)} | ${result.tokensToBuy.tokensReceived.toFixed(0)} | ${result.tokensToBuy.slippage.toFixed(2)}% |\n`;
            });

            // Detailed analysis
            markdown += `\n## Detailed Analysis\n\n`;

            arbitrageOpportunities.forEach(result => {
                markdown += `### ${result.projectName}\n\n`;
                markdown += `**Strategy:** Buy on QuickSwap, Sell on Bonding Curve\n`;
                markdown += `**Bonding Curve ${priceType} Price:** ${result.bondingCurvePrice.toFixed(8)} WMATIC/token\n`;
                markdown += `**QuickSwap Price:** ${result.quickswapPrice.toFixed(8)} WMATIC/token\n`;
                markdown += `**Price Difference:** ${result.priceDifference.toFixed(8)} WMATIC/token\n`;
                markdown += `**Arbitrage Percentage:** ${result.arbitragePercentage.toFixed(2)}%\n\n`;

                if (result.lpData) {
                    markdown += `**LP Information:**\n`;
                    markdown += `- Pair Address: \`${result.lpData.pairAddress}\`\n`;
                    markdown += `- Token: ${result.lpData.tokenSymbol}\n`;
                    markdown += `- Total Liquidity: ${result.lpData.liquidity.toFixed(2)} WMATIC\n`;
                    markdown += `- WMATIC Reserve: ${result.lpData.reserves.wmatic.toFixed(2)} WMATIC\n`;
                    markdown += `- Token Reserve: ${result.lpData.reserves.token.toFixed(2)} tokens\n\n`;
                }

                markdown += `**Arbitrage Calculation:**\n`;
                markdown += `- WMATIC Needed: ${result.tokensToBuy.wmaticNeeded.toFixed(6)} WMATIC\n`;
                markdown += `- Tokens Received: ${result.tokensToBuy.tokensReceived.toFixed(2)} tokens\n`;
                markdown += `- New QuickSwap Price: ${result.tokensToBuy.newPrice.toFixed(8)} WMATIC/token\n`;
                markdown += `- Slippage: ${result.tokensToBuy.slippage.toFixed(2)}%\n\n`;

                markdown += `---\n\n`;
            });
        } else {
            markdown += `## No Arbitrage Opportunities\n\n`;
            markdown += `No projects currently have arbitrage opportunities where QuickSwap price < Bonding Curve ${priceType} price.\n\n`;
        }

        // Projects without arbitrage
        const noArbitrageProjects = projects.filter(p => !p.hasArbitrage);
        if (noArbitrageProjects.length > 0) {
            markdown += `## Projects Without Arbitrage\n\n`;
            markdown += `| Project | BC ${priceType} Price | QS Price | Reason |\n`;
            markdown += `|---------|---------------------|----------|--------|\n`;

            noArbitrageProjects.forEach(result => {
                markdown += `| ${result.projectName} | ${result.bondingCurvePrice.toFixed(6)} | ${result.quickswapPrice || 'N/A'} | ${result.reason || 'No LP'} |\n`;
            });
        }

        markdown += `\n---\n\n`;
        markdown += `*Report generated by QuickSwap Arbitrage Analyzer*\n`;
        markdown += `*Target prices loaded from BondingCurveSimulator summary.json*\n`;

        return markdown;
    }

    /**
     * Calculate optimal arbitrage strategy for a specific project (QuickSwap → Bonding Curve TARGET)
     */
    async calculateOptimalStrategy(projectName, maxWMATIC = 1000, useTargetPrice = true) {
        const arbitrageData = await this.calculateTokensToReachBondingCurvePrice(projectName, useTargetPrice);
        if (!arbitrageData || !arbitrageData.hasArbitrage) {
            console.log(`❌ No arbitrage opportunity for ${projectName}`);
            return null;
        }

        const { bondingCurvePrice, quickswapPrice, tokensToBuy, lpData, priceType } = arbitrageData;

        // Calculate maximum tokens we can buy with available WMATIC
        if (tokensToBuy.wmaticNeeded > maxWMATIC) {
            // Scale down to available WMATIC
            const scaleFactor = maxWMATIC / tokensToBuy.wmaticNeeded;
            const scaledTokens = tokensToBuy.tokensReceived * scaleFactor;
            const scaledWMATIC = maxWMATIC;

            console.log(`\n💡 Optimal Strategy (Limited by ${maxWMATIC} WMATIC):`);
            console.log(`   Buy ${scaledTokens.toFixed(2)} tokens on QuickSwap`);
            console.log(`   Cost: ${scaledWMATIC.toFixed(6)} WMATIC`);
            console.log(`   Sell on bonding curve at ${priceType} price for profit`);
            console.log(`   Estimated profit: ${(scaledTokens * (bondingCurvePrice - quickswapPrice)).toFixed(6)} WMATIC`);

            return {
                action: 'buy_quickswap',
                tokensToBuy: scaledTokens,
                wmaticNeeded: scaledWMATIC,
                estimatedProfit: scaledTokens * (bondingCurvePrice - quickswapPrice),
                profitPercentage: ((bondingCurvePrice - quickswapPrice) / quickswapPrice) * 100,
                slippage: tokensToBuy.slippage
            };
        } else {
            console.log(`\n💡 Optimal Strategy:`);
            console.log(`   Buy ${tokensToBuy.tokensReceived.toFixed(2)} tokens on QuickSwap`);
            console.log(`   Cost: ${tokensToBuy.wmaticNeeded.toFixed(6)} WMATIC`);
            console.log(`   Sell on bonding curve at ${priceType} price for profit`);
            console.log(`   Estimated profit: ${(tokensToBuy.tokensReceived * (bondingCurvePrice - quickswapPrice)).toFixed(6)} WMATIC`);

            return {
                action: 'buy_quickswap',
                tokensToBuy: tokensToBuy.tokensReceived,
                wmaticNeeded: tokensToBuy.wmaticNeeded,
                estimatedProfit: tokensToBuy.tokensReceived * (bondingCurvePrice - quickswapPrice),
                profitPercentage: ((bondingCurvePrice - quickswapPrice) / quickswapPrice) * 100,
                slippage: tokensToBuy.slippage
            };
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
┌─────────────────────────────────────────────────────────────┐
│         QuickSwap Price Equalization Calculator             │
└─────────────────────────────────────────────────────────────┘

Usage:
  node calculateArbitrage.js [project_name]

Arguments:
  project_name    Project name to analyze (optional, analyzes all if not provided)

Examples:
  # Analyze all projects (shows both current and target scenarios)
  node calculateArbitrage.js

  # Analyze specific project
  node calculateArbitrage.js AKARUN

Features:
  ✓ Shows both CURRENT and TARGET bonding curve price scenarios
  ✓ Calculates exact tokens needed to equalize QuickSwap price
  ✓ Uses TARGET prices from summary.json (7.5M supply)
  ✓ Uses CURRENT prices from blockchain
  ✓ Considers slippage and liquidity constraints
  ✓ Generates JSON and Markdown reports automatically
        `);
        process.exit(0);
    }

    const calculator = new ArbitrageCalculator();

    if (args.length === 0) {
        // Analyze all projects
        const analysisResult = await calculator.analyzeAllScenarios();
        console.log(`\n📊 Analysis complete! Check the generated reports for detailed results.`);
    } else {
        // Analyze specific project
        const projectName = args[0].toUpperCase();

        const projectData = config.projects[projectName];
        if (!projectData) {
            console.error(`❌ Project "${projectName}" not found`);
            process.exit(1);
        }

        const result = await calculator.calculateBothScenarios(projectName);

        if (result) {
            // Generate single project report
            await calculator.generateScenarioReport([result]);
        }
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('\n❌ Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = ArbitrageCalculator;