const { ethers } = require("hardhat");

async function main() {
    // Configuration
    const PROXY_CONTRACT_ADDRESS = "0x..."; // Replace with your deployed proxy contract address
    const TARGET_CONTRACT_ADDRESS = "0x1234567890123456789012345678901234567890"; // Replace with target contract

    console.log("🔄 Interacting with deployed proxy contract...");
    console.log("📍 Proxy contract:", PROXY_CONTRACT_ADDRESS);
    console.log("🎯 Target contract:", TARGET_CONTRACT_ADDRESS);

    // Get the deployed contract instance
    const proxyContract = await ethers.getContractAt("FlexibleProxyContract", PROXY_CONTRACT_ADDRESS);

    // Example parameters
    const depositAmount = ethers.parseUnits("1.0", 18); // 1 ETH
    const minAmountOut = ethers.parseUnits("0.95", 18); // 0.95 ETH minimum

    console.log("\n📋 Example 1: Calling buy function");
    console.log(`💰 Deposit amount: ${ethers.formatEther(depositAmount)} ETH`);
    console.log(`📉 Min amount out: ${ethers.formatEther(minAmountOut)} ETH`);

    try {
        const buyTx = await proxyContract.buy(
            TARGET_CONTRACT_ADDRESS,
            depositAmount,
            minAmountOut
        );

        console.log("⏳ Waiting for buy transaction...");
        const buyReceipt = await buyTx.wait();

        console.log("✅ Buy transaction successful!");
        console.log("🔗 Transaction hash:", buyReceipt.hash);
        console.log("⛽ Gas used:", buyReceipt.gasUsed.toString());

    } catch (error) {
        console.log("⚠️ Buy transaction failed (expected if target contract doesn't exist):", error.message);
    }

    console.log("\n📋 Example 2: Calling sell function");

    try {
        const sellTx = await proxyContract.sell(
            TARGET_CONTRACT_ADDRESS,
            depositAmount,
            minAmountOut
        );

        console.log("⏳ Waiting for sell transaction...");
        const sellReceipt = await sellTx.wait();

        console.log("✅ Sell transaction successful!");
        console.log("🔗 Transaction hash:", sellReceipt.hash);
        console.log("⛽ Gas used:", sellReceipt.gasUsed.toString());

    } catch (error) {
        console.log("⚠️ Sell transaction failed (expected if target contract doesn't exist):", error.message);
    }

    console.log("\n" + "=".repeat(60));
    console.log("📖 INTERACTION SUMMARY");
    console.log("=".repeat(60));
    console.log("Proxy Contract:", PROXY_CONTRACT_ADDRESS);
    console.log("Target Contract:", TARGET_CONTRACT_ADDRESS);
    console.log("Network:", (await ethers.provider.getNetwork()).name);
    console.log("=".repeat(60));
}

// Handle errors
main()
    .then(() => {
        console.log("\n✅ Interaction completed!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Interaction failed:", error);
        process.exit(1);
    });