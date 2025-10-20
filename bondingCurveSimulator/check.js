#!/usr/bin/env node

/**
 * Bonding Curve Checker
 * 
 * Accurate analysis using actual smart contract calculations
 * 
 * Usage:
 *   node check.js <contract_address> [target_supply] [pol_price_usd]
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const config = require("./config");
const { getPOLPriceWithFallback } = require("./getPrice");

const BONDING_CURVE_ABI = [
    { "inputs": [], "name": "token", "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "buyFee", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "sellFee", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getReserveRatioForBuying", "outputs": [{ "internalType": "uint32", "name": "", "type": "uint32" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getVirtualIssuanceSupply", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getVirtualCollateralSupply", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "_depositAmount", "type": "uint256" }], "name": "calculatePurchaseReturn", "outputs": [{ "internalType": "uint256", "name": "mintAmount", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "_depositAmount", "type": "uint256" }], "name": "calculateSaleReturn", "outputs": [{ "internalType": "uint256", "name": "redeemAmount", "type": "uint256" }], "stateMutability": "view", "type": "function" },
];

const ERC20_ABI = [
    { "inputs": [], "name": "symbol", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
];

/**
 * Calculate exact cost to buy tokens using binary search
 * This uses the actual contract's calculatePurchaseReturn function
 */
async function calculateExactCostToBuy(contract, tokenAmount, tokenDecimals) {
    const targetTokens = ethers.parseUnits(tokenAmount.toFixed(18), 18);

    // Binary search for the exact collateral amount needed
    let low = BigInt(0);
    let high = ethers.parseUnits("1000000000", tokenDecimals); // 1B collateral max
    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
        const mid = (low + high) / BigInt(2);

        try {
            const tokensReceived = await contract.calculatePurchaseReturn(mid);
            const diff = tokensReceived > targetTokens ? tokensReceived - targetTokens : targetTokens - tokensReceived;

            // If we're within 0.0001% of target, we found it
            if (diff * BigInt(1000000) < targetTokens) {
                return {
                    collateralNeeded: mid,
                    tokensReceived: tokensReceived,
                    converged: true,
                };
            }

            if (tokensReceived < targetTokens) {
                low = mid;
            } else {
                high = mid;
            }
        } catch (e) {
            // If contract call fails (probably amount too high), reduce high
            high = mid;
        }

        iterations++;
    }

    // Return best approximation
    const finalMid = (low + high) / BigInt(2);
    const tokensReceived = await contract.calculatePurchaseReturn(finalMid);

    return {
        collateralNeeded: finalMid,
        tokensReceived: tokensReceived,
        converged: false,
    };
}

async function accurateCheck(contractAddress, targetSupply = null, polPriceUSD = null, saveReport = false, projectName = null) {
    const reportData = {
        timestamp: new Date().toISOString(),
        contract: contractAddress,
        network: "Polygon",
        projectName: projectName,
    };
    const RPC_URL = process.env.RPC_URL || config.rpc.polygon;
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(contractAddress, BONDING_CURVE_ABI, provider);

    console.log("\n🔍 Bonding Curve Analysis (Accurate)");
    console.log("═".repeat(70));
    console.log(`📍 Contract: ${contractAddress}`);
    console.log(`🌐 Network:  Polygon`);
    console.log(`🔗 View: https://polygonscan.com/address/${contractAddress}`);
    console.log("═".repeat(70));

    // Fetch POL price if not provided
    if (polPriceUSD === null) {
        console.log(`\n💰 Fetching current POL price...`);
        polPriceUSD = await getPOLPriceWithFallback(config.prices.pol);
    } else {
        console.log(`\n💰 Using provided POL price: $${polPriceUSD}`);
    }

    try {
        // Detect collateral token
        const tokenAddress = await contract.token();
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [tokenSymbol, tokenDecimals] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.decimals(),
        ]);

        console.log(`💎 Collateral Token: ${tokenSymbol} (${tokenDecimals} decimals)`);

        // Get curve parameters
        const [buyFee, sellFee, reserveRatio, virtualIssuance, virtualCollateral] = await Promise.all([
            contract.buyFee(),
            contract.sellFee(),
            contract.getReserveRatioForBuying(),
            contract.getVirtualIssuanceSupply(),
            contract.getVirtualCollateralSupply(),
        ]);

        const currentSupply = Number(ethers.formatUnits(virtualIssuance, 18));
        const collateral = Number(ethers.formatUnits(virtualCollateral, tokenDecimals));

        // Store in report data
        reportData.collateralToken = { symbol: tokenSymbol, decimals: tokenDecimals, address: tokenAddress };
        reportData.currentState = {
            supply: currentSupply,
            collateral: collateral,
            buyFee: Number(buyFee) / 100,
            sellFee: Number(sellFee) / 100,
            reserveRatio: Number(reserveRatio) / 1000000,
        };
        reportData.polPrice = polPriceUSD;

        console.log(`\n📊 Current State:`);
        console.log(`   Supply:        ${currentSupply.toLocaleString(undefined, {maximumFractionDigits: 2})} tokens`);
        console.log(`   Collateral:    ${collateral.toLocaleString(undefined, {maximumFractionDigits: 2})} ${tokenSymbol}`);
        console.log(`   Buy Fee:       ${Number(buyFee) / 100}%`);
        console.log(`   Sell Fee:      ${Number(sellFee) / 100}%`);
        console.log(`   Reserve Ratio: ${(Number(reserveRatio) / 1000000 * 100).toFixed(2)}%`);

        // Calculate ACTUAL prices from contract
        console.log(`\n💰 Current Prices (from contract):`);

        // Buy price: cost to buy 1 token
        const oneCollateral = ethers.parseUnits("1", tokenDecimals);
        const tokensFor1 = await contract.calculatePurchaseReturn(oneCollateral);
        const tokensFor1Num = Number(ethers.formatUnits(tokensFor1, 18));
        const buyPriceInToken = 1 / tokensFor1Num;
        const buyPriceInUSD = buyPriceInToken * polPriceUSD;

        console.log(`   Buy:  ${buyPriceInToken.toFixed(8)} ${tokenSymbol}/token`);
        console.log(`         ($${buyPriceInUSD.toFixed(6)} USD at ${tokenSymbol} = $${polPriceUSD})`);

        // Sell price: receive from selling 1 token
        const oneToken = ethers.parseUnits("1", 18);
        const collateralFor1Token = await contract.calculateSaleReturn(oneToken);
        const sellPriceInToken = Number(ethers.formatUnits(collateralFor1Token, tokenDecimals));
        const sellPriceInUSD = sellPriceInToken * polPriceUSD;

        console.log(`   Sell: ${sellPriceInToken.toFixed(8)} ${tokenSymbol}/token`);
        console.log(`         ($${sellPriceInUSD.toFixed(6)} USD at ${tokenSymbol} = $${polPriceUSD})`);

        const spread = ((buyPriceInToken - sellPriceInToken) / sellPriceInToken * 100);
        console.log(`   Spread: ${spread.toFixed(2)}%`);

        // Store current prices
        reportData.currentPrices = {
            buy: { wpol: buyPriceInToken, usd: buyPriceInUSD },
            sell: { wpol: sellPriceInToken, usd: sellPriceInUSD },
            spread: spread,
        };

        // Market cap
        const mcapInToken = currentSupply * buyPriceInToken;
        const mcapInUSD = mcapInToken * polPriceUSD;
        console.log(`\n📈 Market Cap:`);
        console.log(`   ${mcapInToken.toLocaleString(undefined, {maximumFractionDigits: 2})} ${tokenSymbol}`);
        console.log(`   ($${mcapInUSD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD)`);

        // If target supply provided, calculate EXACT cost using contract
        if (targetSupply && targetSupply > currentSupply) {
            console.log(`\n🎯 ACCURATE Analysis for ${targetSupply.toLocaleString()} Tokens`);
            console.log("─".repeat(70));

            const tokensToBuy = targetSupply - currentSupply;
            console.log(`   Tokens to buy: ${tokensToBuy.toLocaleString(undefined, {maximumFractionDigits: 2})}`);
            console.log(`   Increase:      ${((targetSupply / currentSupply - 1) * 100).toFixed(2)}%`);

            console.log(`\n   ⏳ Calculating exact cost using contract functions...`);

            // Use contract's calculatePurchaseReturn to find exact cost
            const result = await calculateExactCostToBuy(contract, tokensToBuy, tokenDecimals);

            const collateralNeeded = Number(ethers.formatUnits(result.collateralNeeded, tokenDecimals));
            const tokensActuallyReceived = Number(ethers.formatUnits(result.tokensReceived, 18));
            const avgPrice = collateralNeeded / tokensActuallyReceived;
            const avgPriceUSD = avgPrice * polPriceUSD;

            console.log(`\n   ✅ Exact Cost (calculated via contract):`);
            console.log(`      ${collateralNeeded.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${tokenSymbol}`);
            console.log(`      ($${(collateralNeeded * polPriceUSD).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD)`);
            console.log(``);
            console.log(`      Average Price:  ${avgPrice.toFixed(8)} ${tokenSymbol}/token`);
            console.log(`                      ($${avgPriceUSD.toFixed(6)} USD/token)`);
            console.log(``);
            console.log(`      Tokens received: ${tokensActuallyReceived.toLocaleString(undefined, {maximumFractionDigits: 2})}`);
            console.log(`      Converged:       ${result.converged ? 'Yes ✓' : 'Close approximation'}`);

            // Calculate EXACT prices at target supply
            console.log(`\n   ⏳ Calculating exact prices at ${targetSupply.toLocaleString()} supply...`);

            // To find prices at target, we'll buy up to target-100, then to target+100
            // and calculate the marginal cost per token in that range
            const tokensToTarget = targetSupply - currentSupply;
            const tokensBefore = tokensToTarget - 100; // 100 tokens before target
            const tokensAfter = tokensToTarget + 100; // 100 tokens after target

            const resultBefore = await calculateExactCostToBuy(contract, tokensBefore, tokenDecimals);
            const resultAfter = await calculateExactCostToBuy(contract, tokensAfter, tokenDecimals);

            const collateralBefore = Number(ethers.formatUnits(resultBefore.collateralNeeded, tokenDecimals));
            const collateralAfter = Number(ethers.formatUnits(resultAfter.collateralNeeded, tokenDecimals));
            const tokensBought = Number(ethers.formatUnits(resultAfter.tokensReceived, 18)) - Number(ethers.formatUnits(resultBefore.tokensReceived, 18));

            // Buy price (with fee) = marginal cost
            const spotBuyPrice = (collateralAfter - collateralBefore) / tokensBought;
            const spotBuyPriceUSD = spotBuyPrice * polPriceUSD;

            // Static price (without fee) = buy price / (1 + buy fee)
            const spotStaticPrice = spotBuyPrice / 1.08; // Remove 8% buy fee
            const spotStaticPriceUSD = spotStaticPrice * polPriceUSD;

            // Sell price (with fee) = static price * (1 - sell fee)
            const spotSellPrice = spotStaticPrice * 0.92; // Apply 8% sell fee
            const spotSellPriceUSD = spotSellPrice * polPriceUSD;

            console.log(`\n   💎 Exact Prices at ${targetSupply.toLocaleString()} Supply:`);
            console.log(`      Buy Price:    ${spotBuyPrice.toFixed(8)} ${tokenSymbol}/token ($${spotBuyPriceUSD.toFixed(6)})`);
            console.log(`      Static Price: ${spotStaticPrice.toFixed(8)} ${tokenSymbol}/token ($${spotStaticPriceUSD.toFixed(6)})`);
            console.log(`      Sell Price:   ${spotSellPrice.toFixed(8)} ${tokenSymbol}/token ($${spotSellPriceUSD.toFixed(6)})`);
            console.log(`      Spread:       ${((spotBuyPrice - spotSellPrice) / spotSellPrice * 100).toFixed(2)}%`);

            // Price comparison
            const avgPriceIncrease = ((avgPrice / buyPriceInToken - 1) * 100);
            const spotPriceIncrease = ((spotBuyPrice / buyPriceInToken - 1) * 100);
            console.log(`\n   📊 Price Comparison (Buy Price):`);
            console.log(`      Current Supply (${currentSupply.toLocaleString()}):  ${buyPriceInToken.toFixed(8)} ${tokenSymbol}/token`);
            console.log(`      Average to Target:        ${avgPrice.toFixed(8)} ${tokenSymbol}/token  (+${avgPriceIncrease.toFixed(2)}%)`);
            console.log(`      Buy Price at Target:      ${spotBuyPrice.toFixed(8)} ${tokenSymbol}/token  (+${spotPriceIncrease.toFixed(2)}%)`);
            console.log(``);
            console.log(`      💡 The buy price at target is ${((spotBuyPrice / avgPrice - 1) * 100).toFixed(1)}% higher than average`);
            console.log(`         (because of the curve's exponential nature)`);

            // Market cap at target
            const targetMcapToken = targetSupply * avgPrice;
            const targetMcapUSD = targetMcapToken * polPriceUSD;
            console.log(`\n   💎 Market Cap at Target:`);
            console.log(`      ${targetMcapToken.toLocaleString(undefined, {maximumFractionDigits: 2})} ${tokenSymbol}`);
            console.log(`      ($${targetMcapUSD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD)`);

            // Store target analysis
            reportData.targetAnalysis = {
                targetSupply: targetSupply,
                tokensNeeded: tokensToBuy,
                cost: { wpol: collateralNeeded, usd: collateralNeeded * polPriceUSD },
                averagePrice: { wpol: avgPrice, usd: avgPriceUSD },
                pricesAtTarget: {
                    buy: { wpol: spotBuyPrice, usd: spotBuyPriceUSD },
                    static: { wpol: spotStaticPrice, usd: spotStaticPriceUSD },
                    sell: { wpol: spotSellPrice, usd: spotSellPriceUSD },
                    spread: ((spotBuyPrice - spotSellPrice) / spotSellPrice * 100)
                },
                priceIncrease: { average: avgPriceIncrease, spot: spotPriceIncrease },
                marketCapAtTarget: { wpol: targetMcapToken, usd: targetMcapUSD },
            };
        }

        console.log("\n" + "═".repeat(70));
        console.log("✅ Analysis complete using actual contract calculations\n");

        // Save report if requested
        if (saveReport) {
            saveReportToFile(reportData, contractAddress, projectName);
        }

        return reportData;

    } catch (error) {
        console.error("\n❌ Error:", error.message);
        console.log("\nPossible issues:");
        console.log("  - Contract address is incorrect");
        console.log("  - Contract doesn't implement bonding curve interface");
        console.log("  - RPC connection failed\n");
        process.exit(1);
    }
}

/**
 * Save report to file in JSON and Markdown formats
 */
function saveReportToFile(data, contractAddress, projectName = null) {
    const reportsDir = path.join(__dirname, 'reports');

    // Create reports directory if it doesn't exist
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    // Use project name if provided, otherwise use short contract address
    const filePrefix = projectName || contractAddress.slice(0, 10);
    const basename = `${filePrefix}_${timestamp}`;

    // Save JSON (with BigInt handling)
    const jsonPath = path.join(reportsDir, `${basename}.json`);
    const jsonData = JSON.stringify(data, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2);
    fs.writeFileSync(jsonPath, jsonData);

    // Save Markdown
    const mdPath = path.join(reportsDir, `${basename}.md`);
    const markdown = generateMarkdownReport(data);
    fs.writeFileSync(mdPath, markdown);

    console.log(`📄 Reports saved:`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   MD:   ${mdPath}\n`);
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(data) {
    const d = data;
    let md = `# Bonding Curve Analysis Report\n\n`;
    if (d.projectName) {
        md += `**Project:** ${d.projectName}\n\n`;
    }
    md += `**Generated:** ${new Date(d.timestamp).toLocaleString()}\n\n`;
    md += `**Contract:** \`${d.contract}\`  \n`;
    md += `**Network:** ${d.network}  \n`;
    md += `**POL Price:** $${d.polPrice?.toFixed(4) || 'N/A'}\n\n`;

    md += `## Current State\n\n`;
    if (d.currentState) {
        md += `- **Supply:** ${d.currentState.supply.toLocaleString(undefined, {maximumFractionDigits: 2})} tokens\n`;
        md += `- **Collateral:** ${d.currentState.collateral.toLocaleString(undefined, {maximumFractionDigits: 2})} ${d.collateralToken?.symbol}\n`;
        md += `- **Buy Fee:** ${d.currentState.buyFee}%\n`;
        md += `- **Sell Fee:** ${d.currentState.sellFee}%\n`;
        md += `- **Reserve Ratio:** ${(d.currentState.reserveRatio * 100).toFixed(2)}%\n\n`;
    }

    md += `## Current Prices\n\n`;
    if (d.currentPrices) {
        md += `| Type | WPOL/token | USD/token |\n`;
        md += `|------|------------|----------|\n`;
        md += `| Buy  | ${d.currentPrices.buy.wpol.toFixed(8)} | $${d.currentPrices.buy.usd.toFixed(6)} |\n`;
        md += `| Sell | ${d.currentPrices.sell.wpol.toFixed(8)} | $${d.currentPrices.sell.usd.toFixed(6)} |\n`;
        md += `| **Spread** | | **${d.currentPrices.spread.toFixed(2)}%** |\n\n`;
    }

    if (d.targetAnalysis) {
        md += `## Target Analysis: ${d.targetAnalysis.targetSupply.toLocaleString()} Tokens\n\n`;
        md += `### Cost to Reach Target\n\n`;
        md += `- **Collateral Needed:** ${d.targetAnalysis.cost.wpol.toLocaleString(undefined, {maximumFractionDigits: 2})} WPOL\n`;
        md += `- **USD Cost:** $${d.targetAnalysis.cost.usd.toLocaleString(undefined, {maximumFractionDigits: 2})}\n`;
        md += `- **Tokens to Buy:** ${d.targetAnalysis.tokensNeeded.toLocaleString(undefined, {maximumFractionDigits: 2})}\n\n`;

        md += `### Price Progression\n\n`;
        md += `| Metric | WPOL/token | USD/token | Change |\n`;
        md += `|--------|------------|-----------|--------|\n`;
        md += `| Current Buy Price | ${d.currentPrices.buy.wpol.toFixed(8)} | $${d.currentPrices.buy.usd.toFixed(6)} | - |\n`;
        md += `| Average Buy Price | ${d.targetAnalysis.averagePrice.wpol.toFixed(8)} | $${d.targetAnalysis.averagePrice.usd.toFixed(6)} | +${d.targetAnalysis.priceIncrease.average.toFixed(2)}% |\n`;

        if (d.targetAnalysis.pricesAtTarget) {
            md += `| Buy Price at Target | ${d.targetAnalysis.pricesAtTarget.buy.wpol.toFixed(8)} | $${d.targetAnalysis.pricesAtTarget.buy.usd.toFixed(6)} | +${d.targetAnalysis.priceIncrease.spot.toFixed(2)}% |\n\n`;

            md += `### Prices at Target Supply\n\n`;
            md += `| Type | WPOL/token | USD/token |\n`;
            md += `|------|------------|----------|\n`;
            md += `| Buy Price | ${d.targetAnalysis.pricesAtTarget.buy.wpol.toFixed(8)} | $${d.targetAnalysis.pricesAtTarget.buy.usd.toFixed(6)} |\n`;
            md += `| Static Price | ${d.targetAnalysis.pricesAtTarget.static.wpol.toFixed(8)} | $${d.targetAnalysis.pricesAtTarget.static.usd.toFixed(6)} |\n`;
            md += `| Sell Price | ${d.targetAnalysis.pricesAtTarget.sell.wpol.toFixed(8)} | $${d.targetAnalysis.pricesAtTarget.sell.usd.toFixed(6)} |\n`;
            md += `| **Spread** | | **${d.targetAnalysis.pricesAtTarget.spread.toFixed(2)}%** |\n\n`;
        } else {
            md += `| Buy Price at Target | ${d.targetAnalysis.spotPriceAtTarget.wpol.toFixed(8)} | $${d.targetAnalysis.spotPriceAtTarget.usd.toFixed(6)} | +${d.targetAnalysis.priceIncrease.spot.toFixed(2)}% |\n\n`;
        }

        md += `### Market Cap at Target\n\n`;
        md += `- **WPOL:** ${d.targetAnalysis.marketCapAtTarget.wpol.toLocaleString(undefined, {maximumFractionDigits: 2})}\n`;
        md += `- **USD:** $${d.targetAnalysis.marketCapAtTarget.usd.toLocaleString(undefined, {maximumFractionDigits: 2})}\n\n`;
    }

    md += `---\n*Generated by Bonding Curve Simulator*\n`;
    return md;
}

// CLI handling
if (require.main === module) {
    const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
    const saveReport = process.argv.includes('--report') || process.argv.includes('--save');

    if (args.length === 0 || process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log(`
┌─────────────────────────────────────────────────────────────┐
│         Bonding Curve Checker (Accurate)                    │
└─────────────────────────────────────────────────────────────┘

Usage:
  node check.js <contract_address> [target_supply] [pol_price] [--report]

Arguments:
  contract_address    Bonding curve contract address (required)
  target_supply       Target supply to analyze (optional, e.g., 7500000)
  pol_price          POL price in USD (optional, auto-fetches by default)

Flags:
  --report, --save   Save analysis report to reports/ directory

Examples:
  # Check current state (auto-fetch POL price)
  node check.js 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56

  # Accurate cost to reach 7.5M supply
  node check.js 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56 7500000

  # Generate report files (JSON + Markdown)
  node check.js 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56 7500000 --report

Features:
  ✓ Uses contract's calculatePurchaseReturn() for accuracy
  ✓ Binary search to find exact collateral needed
  ✓ Auto-fetches POL price from CoinGecko
  ✓ Generates JSON and Markdown reports
  ✓ No approximations - all values from contract
        `);
        process.exit(0);
    }

    const contractAddress = args[0];
    const targetSupply = args[1] ? parseFloat(args[1]) : null;
    const polPrice = args[2] ? parseFloat(args[2]) : null;

    if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        console.error("\n❌ Invalid contract address format\n");
        process.exit(1);
    }

    accurateCheck(contractAddress, targetSupply, polPrice, saveReport).catch(error => {
        console.error("\n❌ Fatal error:", error.message);
        process.exit(1);
    });
}

module.exports = { accurateCheck };