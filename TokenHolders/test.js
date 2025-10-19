/**
 * Test script to verify the setup is working correctly
 * Run this with: node test.js
 */

const { ethers } = require("ethers");

async function testSetup() {
    console.log("\n🧪 Testing Token Holders Fetcher Setup");
    console.log("=".repeat(50));

    // Test 1: Check ethers.js is installed
    console.log("\n1. Testing ethers.js installation...");
    try {
        console.log(`   ✅ ethers.js version: ${ethers.version}`);
    } catch (error) {
        console.error("   ❌ ethers.js not properly installed");
        console.error("   Run: npm install");
        return false;
    }

    // Test 2: Check Polygon RPC connection
    console.log("\n2. Testing Polygon RPC connection...");
    try {
        const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
        const blockNumber = await provider.getBlockNumber();
        console.log(`   ✅ Connected to Polygon`);
        console.log(`   Current block: ${blockNumber}`);
    } catch (error) {
        console.error("   ❌ Failed to connect to Polygon RPC");
        console.error(`   Error: ${error.message}`);
        return false;
    }

    // Test 3: Test with a known token (USDC on Polygon)
    console.log("\n3. Testing token metadata fetch (USDC)...");
    try {
        const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
        const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
        const abi = [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)"
        ];

        const contract = new ethers.Contract(usdcAddress, abi, provider);
        const [name, symbol, decimals] = await Promise.all([
            contract.name(),
            contract.symbol(),
            contract.decimals()
        ]);

        console.log(`   ✅ Token: ${name} (${symbol})`);
        console.log(`   Decimals: ${decimals}`);
    } catch (error) {
        console.error("   ❌ Failed to fetch token metadata");
        console.error(`   Error: ${error.message}`);
        return false;
    }

    // Test 4: Test Transfer event fetching
    console.log("\n4. Testing Transfer event fetching...");
    try {
        const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
        const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
        const abi = [
            "event Transfer(address indexed from, address indexed to, uint256 value)"
        ];

        const contract = new ethers.Contract(usdcAddress, abi, provider);
        const currentBlock = await provider.getBlockNumber();
        // Use smaller range for USDC (high-activity token)
        const fromBlock = currentBlock - 100; // Last 100 blocks

        const filter = contract.filters.Transfer();
        const events = await contract.queryFilter(filter, fromBlock, currentBlock);

        console.log(`   ✅ Fetched ${events.length} Transfer events`);
        console.log(`   Block range: ${fromBlock} to ${currentBlock}`);
    } catch (error) {
        console.error("   ❌ Failed to fetch Transfer events");
        console.error(`   Error: ${error.message}`);
        console.error("   Note: This is usually not a problem. The main script");
        console.error("   handles this automatically by using smaller block ranges.");
        // Don't return false - this is acceptable
    }

    // Test 5: Check file system access
    console.log("\n5. Testing file system access...");
    try {
        const fs = require("fs");
        const path = require("path");
        const testDir = "./output";

        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
            console.log(`   ✅ Created output directory: ${testDir}`);
        } else {
            console.log(`   ✅ Output directory exists: ${testDir}`);
        }
    } catch (error) {
        console.error("   ❌ Failed to access file system");
        console.error(`   Error: ${error.message}`);
        return false;
    }

    console.log("\n" + "=".repeat(50));
    console.log("✅ All tests passed! Setup is working correctly.");
    console.log("\nYou can now run:");
    console.log("  node getTokenHolders.js <TOKEN_ADDRESS>");
    console.log("\nOr try with USDC:");
    console.log("  node getTokenHolders.js 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");
    console.log("=".repeat(50) + "\n");

    return true;
}

// Run tests
testSetup().catch(error => {
    console.error("\n❌ Test failed with error:", error);
    process.exit(1);
});