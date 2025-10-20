#!/usr/bin/env node

/**
 * Detect Collateral Token
 * 
 * Detects what token is used as collateral in the bonding curve
 */

const { ethers } = require("ethers");
const config = require("./config");

const BONDING_CURVE_ABI = [
    { "inputs": [], "name": "token", "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getVirtualCollateralSupply", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
];

const ERC20_ABI = [
    { "inputs": [], "name": "symbol", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "name", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
];

async function detectCollateralToken(bondingCurveAddress) {
    const rpcUrl = config.rpc.polygon;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(bondingCurveAddress, BONDING_CURVE_ABI, provider);

    try {
        console.log("\n🔍 Detecting collateral token...\n");

        // Get the collateral token address
        const tokenAddress = await contract.token();
        console.log(`Token Address: ${tokenAddress}`);

        // Get token details
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [symbol, decimals, name] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.decimals(),
            tokenContract.name(),
        ]);

        // Get virtual collateral to verify decimals
        const virtualCollateral = await contract.getVirtualCollateralSupply();

        console.log("\n📊 Collateral Token Details:");
        console.log("═".repeat(60));
        console.log(`Name:              ${name}`);
        console.log(`Symbol:            ${symbol}`);
        console.log(`Decimals:          ${decimals}`);
        console.log(`Address:           ${tokenAddress}`);
        console.log(`\nVirtual Collateral (raw): ${virtualCollateral.toString()}`);
        console.log(`Virtual Collateral (formatted): ${ethers.formatUnits(virtualCollateral, decimals)}`);
        console.log("═".repeat(60) + "\n");

        return {
            address: tokenAddress,
            symbol,
            decimals: Number(decimals),
            name,
            virtualCollateral,
        };

    } catch (error) {
        console.error("❌ Error detecting collateral token:", error.message);
        return null;
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const address = args[0] || "0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56";

    detectCollateralToken(address).catch(console.error);
}

module.exports = { detectCollateralToken };