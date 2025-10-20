#!/usr/bin/env node

/**
 * Compare Multiple Bonding Curves
 * 
 * Compare prices and parameters across multiple bonding curve contracts
 * 
 * Usage:
 *   node compareBondingCurves.js <address1> <address2> [address3...]
 *   node compareBondingCurves.js --config  (uses contracts from config.js)
 */

const { ethers } = require("ethers");
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

class BondingCurveComparator {
    constructor(rpcUrl) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.curves = [];
    }

    async fetchCurveData(address, name = null) {
        const contract = new ethers.Contract(address, BONDING_CURVE_ABI, this.provider);

        try {
            const [buyFee, sellFee, reserveRatio, virtualIssuance, virtualCollateral] = await Promise.all([
                contract.buyFee(),
                contract.sellFee(),
                contract.getReserveRatioForBuying(),
                contract.getVirtualIssuanceSupply(),
                contract.getVirtualCollateralSupply(),
            ]);

            // Get current prices
            const oneUSDC = ethers.parseUnits("1", 6);
            const tokensFor1USDC = await contract.calculatePurchaseReturn(oneUSDC);
            const buyPrice = 1 / Number(ethers.formatUnits(tokensFor1USDC, 18));

            const oneToken = ethers.parseUnits("1", 18);
            const usdcFor1Token = await contract.calculateSaleReturn(oneToken);
            const sellPrice = Number(ethers.formatUnits(usdcFor1Token, 6));

            const supply = Number(ethers.formatUnits(virtualIssuance, 18));
            const collateral = Number(ethers.formatUnits(virtualCollateral, 18));

            return {
                address,
                name: name || address.slice(0, 10) + "...",
                buyFee: Number(buyFee) / 100,
                sellFee: Number(sellFee) / 100,
                reserveRatio: Number(reserveRatio) / 1000000 * 100,
                supply,
                collateral,
                buyPrice,
                sellPrice,
                spread: ((buyPrice - sellPrice) / sellPrice * 100),
                marketCap: supply * buyPrice,
            };
        } catch (error) {
            console.error(`❌ Error fetching data for ${address}:`, error.message);
            return null;
        }
    }

    printComparison() {
        if (this.curves.length === 0) {
            console.log("\n❌ No curves to compare\n");
            return;
        }

        console.log("\n" + "═".repeat(100));
        console.log(" ".repeat(35) + "BONDING CURVE COMPARISON");
        console.log("═".repeat(100));

        // Parameters comparison
        console.log("\n📊 PARAMETERS");
        console.log("-".repeat(100));
        console.log("Name".padEnd(20) + " | Supply".padEnd(15) + " | Reserve R.".padEnd(12) + " | Buy Fee".padEnd(10) + " | Sell Fee");
        console.log("-".repeat(100));

        for (const curve of this.curves) {
            const nameStr = curve.name.padEnd(20);
            const supplyStr = curve.supply.toLocaleString(undefined, { maximumFractionDigits: 0 }).padEnd(15);
            const rrStr = `${curve.reserveRatio.toFixed(2)}%`.padEnd(12);
            const buyFeeStr = `${curve.buyFee.toFixed(2)}%`.padEnd(10);
            const sellFeeStr = `${curve.sellFee.toFixed(2)}%`;

            console.log(`${nameStr} | ${supplyStr} | ${rrStr} | ${buyFeeStr} | ${sellFeeStr}`);
        }

        // Price comparison
        console.log("\n💰 PRICES (per token)");
        console.log("-".repeat(100));
        console.log("Name".padEnd(20) + " | Buy Price".padEnd(20) + " | Sell Price".padEnd(20) + " | Spread");
        console.log("-".repeat(100));

        for (const curve of this.curves) {
            const nameStr = curve.name.padEnd(20);
            const buyStr = `$${this.formatPrice(curve.buyPrice)}`.padEnd(20);
            const sellStr = `$${this.formatPrice(curve.sellPrice)}`.padEnd(20);
            const spreadStr = `${curve.spread.toFixed(2)}%`;

            console.log(`${nameStr} | ${buyStr} | ${sellStr} | ${spreadStr}`);
        }

        // Market cap comparison
        console.log("\n💎 MARKET METRICS");
        console.log("-".repeat(100));
        console.log("Name".padEnd(20) + " | Market Cap".padEnd(25) + " | Collateral".padEnd(25));
        console.log("-".repeat(100));

        for (const curve of this.curves) {
            const nameStr = curve.name.padEnd(20);
            const mcapStr = `$${this.formatLargeNumber(curve.marketCap)}`.padEnd(25);
            const collStr = `$${this.formatLargeNumber(curve.collateral)}`;

            console.log(`${nameStr} | ${mcapStr} | ${collStr}`);
        }

        // Rankings
        console.log("\n🏆 RANKINGS");
        console.log("-".repeat(100));

        const sortedByPrice = [...this.curves].sort((a, b) => a.buyPrice - b.buyPrice);
        console.log("\n  Cheapest to Most Expensive:");
        sortedByPrice.forEach((curve, idx) => {
            console.log(`    ${idx + 1}. ${curve.name.padEnd(20)} - $${this.formatPrice(curve.buyPrice)}`);
        });

        const sortedBySupply = [...this.curves].sort((a, b) => b.supply - a.supply);
        console.log("\n  Largest Supply:");
        sortedBySupply.forEach((curve, idx) => {
            console.log(`    ${idx + 1}. ${curve.name.padEnd(20)} - ${curve.supply.toLocaleString()} tokens`);
        });

        const sortedBySpread = [...this.curves].sort((a, b) => a.spread - b.spread);
        console.log("\n  Best Spreads (lowest):");
        sortedBySpread.forEach((curve, idx) => {
            console.log(`    ${idx + 1}. ${curve.name.padEnd(20)} - ${curve.spread.toFixed(2)}%`);
        });

        console.log("\n" + "═".repeat(100) + "\n");
    }

    formatPrice(price) {
        if (price > 1000000000000) {
            return `${(price / 1_000_000_000_000).toFixed(2)}T`;
        } else if (price > 1000000000) {
            return `${(price / 1_000_000_000).toFixed(2)}B`;
        } else if (price > 1000000) {
            return `${(price / 1_000_000).toFixed(2)}M`;
        } else if (price > 1000) {
            return `${(price / 1_000).toFixed(2)}K`;
        } else if (price > 1) {
            return price.toFixed(4);
        } else {
            return price.toFixed(8);
        }
    }

    formatLargeNumber(num) {
        if (num > 1000000000000000) {
            return `${(num / 1_000_000_000_000_000).toFixed(2)}Q`;
        } else if (num > 1000000000000) {
            return `${(num / 1_000_000_000_000).toFixed(2)}T`;
        } else if (num > 1000000000) {
            return `${(num / 1_000_000_000).toFixed(2)}B`;
        } else if (num > 1000000) {
            return `${(num / 1_000_000).toFixed(2)}M`;
        } else if (num > 1000) {
            return `${(num / 1_000).toFixed(2)}K`;
        } else {
            return num.toFixed(2);
        }
    }

    exportToCSV(filename = 'bonding_curves_comparison.csv') {
        const fs = require('fs');

        const headers = 'Name,Address,Supply,Reserve Ratio,Buy Fee,Sell Fee,Buy Price,Sell Price,Spread,Market Cap,Collateral\n';
        const rows = this.curves.map(c =>
            `${c.name},${c.address},${c.supply},${c.reserveRatio},${c.buyFee},${c.sellFee},${c.buyPrice},${c.sellPrice},${c.spread},${c.marketCap},${c.collateral}`
        ).join('\n');

        fs.writeFileSync(filename, headers + rows);
        console.log(`\n📊 Comparison exported to ${filename}\n`);
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
┌─────────────────────────────────────────────────────────────┐
│         Compare Multiple Bonding Curves                     │
└─────────────────────────────────────────────────────────────┘

Usage:
  node compareBondingCurves.js <address1> <address2> [address3...]
  node compareBondingCurves.js --config

Options:
  --config        Use contracts from config.js
  --export        Export results to CSV
  --help, -h      Show this help message

Examples:
  # Compare two contracts
  node compareBondingCurves.js 0xAddr1 0xAddr2

  # Compare all contracts from config
  node compareBondingCurves.js --config

  # Compare and export to CSV
  node compareBondingCurves.js --config --export

Features:
  ✓ Side-by-side parameter comparison
  ✓ Price comparison
  ✓ Market metrics
  ✓ Rankings (cheapest, largest, best spread)
  ✓ CSV export
        `);
        process.exit(0);
    }

    const rpcUrl = config.rpc.polygon;
    const comparator = new BondingCurveComparator(rpcUrl);

    console.log("\n🔄 Fetching bonding curve data...\n");

    let addresses = [];
    let shouldExport = args.includes('--export');

    if (args.includes('--config')) {
        // Use contracts from config
        const contracts = Object.values(config.contracts);
        if (contracts.length === 0) {
            console.error("❌ No contracts found in config.js");
            process.exit(1);
        }

        for (const contract of contracts) {
            console.log(`  Fetching ${contract.name}...`);
            const data = await comparator.fetchCurveData(contract.address, contract.name);
            if (data) {
                comparator.curves.push(data);
            }
        }
    } else {
        // Use addresses from command line
        addresses = args.filter(arg => arg.startsWith('0x'));

        if (addresses.length < 2) {
            console.error("❌ Please provide at least 2 contract addresses");
            process.exit(1);
        }

        for (let i = 0; i < addresses.length; i++) {
            const addr = addresses[i];
            console.log(`  Fetching ${i + 1}/${addresses.length}: ${addr}...`);
            const data = await comparator.fetchCurveData(addr, `Curve ${i + 1}`);
            if (data) {
                comparator.curves.push(data);
            }
        }
    }

    if (comparator.curves.length === 0) {
        console.error("\n❌ No valid bonding curves found\n");
        process.exit(1);
    }

    comparator.printComparison();

    if (shouldExport) {
        comparator.exportToCSV();
    }

    console.log("✅ Comparison complete!\n");
}

if (require.main === module) {
    main().catch(error => {
        console.error("\n❌ Error:", error.message);
        process.exit(1);
    });
}

module.exports = { BondingCurveComparator };