#!/usr/bin/env node

/**
 * Export Bonding Curve Data
 * 
 * Export bonding curve data to various formats (CSV, JSON, Markdown)
 * 
 * Usage:
 *   node exportCurveData.js <contract_address> [--format json|csv|md] [--output filename]
 */

const { ethers } = require("ethers");
const fs = require("fs");
const config = require("./config");

const BONDING_CURVE_ABI = [
    { "inputs": [], "name": "buyFee", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "sellFee", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getReserveRatioForBuying", "outputs": [{ "internalType": "uint32", "name": "", "type": "uint32" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getVirtualIssuanceSupply", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getVirtualCollateralSupply", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "_depositAmount", "type": "uint256" }], "name": "calculatePurchaseReturn", "outputs": [{ "internalType": "uint256", "name": "mintAmount", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "_depositAmount", "type": "uint256" }], "name": "calculateSaleReturn", "outputs": [{ "internalType": "uint256", "name": "redeemAmount", "type": "uint256" }], "stateMutability": "view", "type": "function" },
];

async function exportCurveData(contractAddress, format = 'json', outputFile = null) {
    const rpcUrl = config.rpc.polygon;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, BONDING_CURVE_ABI, provider);

    console.log(`\n📊 Exporting bonding curve data for ${contractAddress}...\n`);

    try {
        // Fetch all data
        const [buyFee, sellFee, reserveRatio, virtualIssuance, virtualCollateral] = await Promise.all([
            contract.buyFee(),
            contract.sellFee(),
            contract.getReserveRatioForBuying(),
            contract.getVirtualIssuanceSupply(),
            contract.getVirtualCollateralSupply(),
        ]);

        const supply = Number(ethers.formatUnits(virtualIssuance, 18));

        // Calculate prices at various supply points
        console.log("🔄 Calculating prices at different supply levels...");
        const supplyPoints = config.defaults.targetSupplies;
        const priceData = [];

        for (const targetSupply of supplyPoints) {
            if (targetSupply <= supply) continue;

            const tokensToBuy = targetSupply - supply;

            // Binary search for cost
            let lowUSDC = tokensToBuy * 0.0001;
            let highUSDC = tokensToBuy * 1000000000000;
            let avgPrice = 0;

            for (let i = 0; i < 30; i++) {
                const midUSDC = (lowUSDC + highUSDC) / 2;
                try {
                    const usdcBN = ethers.parseUnits(midUSDC.toFixed(6), 6);
                    const received = await contract.calculatePurchaseReturn(usdcBN);
                    const receivedNum = Number(ethers.formatUnits(received, 18));

                    if (Math.abs(receivedNum - tokensToBuy) / tokensToBuy < 0.001) {
                        avgPrice = midUSDC / tokensToBuy;
                        break;
                    }

                    if (receivedNum < tokensToBuy) {
                        lowUSDC = midUSDC;
                    } else {
                        highUSDC = midUSDC;
                    }
                } catch (e) {
                    highUSDC = midUSDC;
                }
            }

            if (avgPrice > 0) {
                priceData.push({
                    supply: targetSupply,
                    tokensToBuy: tokensToBuy,
                    avgPrice: avgPrice,
                    totalCost: avgPrice * tokensToBuy,
                    marketCap: targetSupply * avgPrice,
                });
                process.stdout.write(`  ✓ ${targetSupply.toLocaleString()}\n`);
            }
        }

        const data = {
            contract: contractAddress,
            timestamp: new Date().toISOString(),
            parameters: {
                buyFee: Number(buyFee) / 100,
                sellFee: Number(sellFee) / 100,
                reserveRatio: Number(reserveRatio) / 1000000 * 100,
                currentSupply: supply,
                virtualCollateral: Number(ethers.formatUnits(virtualCollateral, 18)),
            },
            priceProgression: priceData,
        };

        // Export based on format
        if (!outputFile) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            outputFile = `bonding_curve_${contractAddress.slice(0, 8)}_${timestamp}.${format}`;
        }

        if (format === 'json') {
            fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
        } else if (format === 'csv') {
            let csv = 'Supply,Tokens to Buy,Average Price,Total Cost,Market Cap\n';
            csv += priceData.map(p =>
                `${p.supply},${p.tokensToBuy},${p.avgPrice},${p.totalCost},${p.marketCap}`
            ).join('\n');
            fs.writeFileSync(outputFile, csv);
        } else if (format === 'md' || format === 'markdown') {
            let md = `# Bonding Curve Data Export\n\n`;
            md += `**Contract**: \`${contractAddress}\`\n`;
            md += `**Exported**: ${new Date().toISOString()}\n\n`;
            md += `## Parameters\n\n`;
            md += `- Buy Fee: ${data.parameters.buyFee}%\n`;
            md += `- Sell Fee: ${data.parameters.sellFee}%\n`;
            md += `- Reserve Ratio: ${data.parameters.reserveRatio.toFixed(2)}%\n`;
            md += `- Current Supply: ${data.parameters.currentSupply.toLocaleString()} tokens\n\n`;
            md += `## Price Progression\n\n`;
            md += `| Supply | Tokens to Buy | Avg Price | Total Cost | Market Cap |\n`;
            md += `|--------|---------------|-----------|------------|------------|\n`;
            priceData.forEach(p => {
                md += `| ${p.supply.toLocaleString()} | ${p.tokensToBuy.toLocaleString()} | $${p.avgPrice.toFixed(8)} | $${p.totalCost.toLocaleString()} | $${p.marketCap.toLocaleString()} |\n`;
            });
            fs.writeFileSync(outputFile, md);
        }

        console.log(`\n✅ Data exported to: ${outputFile}\n`);
        return outputFile;

    } catch (error) {
        console.error("\n❌ Error:", error.message);
        throw error;
    }
}

// CLI handling
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
┌─────────────────────────────────────────────────────────────┐
│            Export Bonding Curve Data                        │
└─────────────────────────────────────────────────────────────┘

Usage:
  node exportCurveData.js <contract_address> [options]

Options:
  --format <type>    Export format: json, csv, md (default: json)
  --output <file>    Output filename (default: auto-generated)
  --help, -h         Show this help message

Examples:
  # Export to JSON
  node exportCurveData.js 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56

  # Export to CSV
  node exportCurveData.js 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56 --format csv

  # Export to Markdown with custom filename
  node exportCurveData.js 0x... --format md --output my_curve.md

Formats:
  json     - Structured JSON with full data
  csv      - CSV file for spreadsheet import
  md       - Markdown table for documentation
        `);
        process.exit(0);
    }

    const contractAddress = args[0];
    const formatIdx = args.indexOf('--format');
    const format = formatIdx >= 0 && args[formatIdx + 1] ? args[formatIdx + 1] : 'json';
    const outputIdx = args.indexOf('--output');
    const output = outputIdx >= 0 && args[outputIdx + 1] ? args[outputIdx + 1] : null;

    if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        console.error("\n❌ Invalid contract address\n");
        process.exit(1);
    }

    if (!['json', 'csv', 'md', 'markdown'].includes(format)) {
        console.error("\n❌ Invalid format. Use: json, csv, or md\n");
        process.exit(1);
    }

    exportCurveData(contractAddress, format, output).catch(error => {
        console.error("\n❌ Fatal error:", error.message);
        process.exit(1);
    });
}

module.exports = { exportCurveData };