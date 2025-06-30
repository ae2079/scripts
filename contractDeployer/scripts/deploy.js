const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Starting proxy contract deployment with Hardhat...");

    // Get the contract factory
    const FlexibleProxyContract = await ethers.getContractFactory("FlexibleProxyContract");

    console.log("📋 Deploying FlexibleProxyContract...");
    console.log("✨ This proxy can call any contract address!");

    // Deploy the contract
    const proxyContract = await FlexibleProxyContract.deploy();

    console.log("⏳ Waiting for deployment confirmation...");
    await proxyContract.waitForDeployment();

    const deployedAddress = await proxyContract.getAddress();

    console.log("✅ Proxy contract deployed successfully!");
    console.log("📍 Contract address:", deployedAddress);
    console.log("🔗 Transaction hash:", proxyContract.deploymentTransaction().hash);

    // Get deployment info
    const deploymentTx = proxyContract.deploymentTransaction();
    const receipt = await deploymentTx.wait();

    console.log("⛽ Gas used:", receipt.gasUsed.toString());
    console.log("💰 Gas price:", ethers.formatUnits(receipt.gasPrice, "gwei"), "gwei");
    console.log("💸 Total cost:", ethers.formatEther(receipt.gasUsed * receipt.gasPrice), "ETH");

    // Verify the deployment
    console.log("\n🔍 Verifying deployment...");

    // Get the deployed contract instance
    const deployedContract = await ethers.getContractAt("FlexibleProxyContract", deployedAddress);

    // Test the contract functions (optional)
    console.log("\n🧪 Testing contract functions...");
    console.log("📋 Buy function signature:", deployedContract.interface.getFunction("buy").format());
    console.log("📋 Sell function signature:", deployedContract.interface.getFunction("sell").format());

    console.log("\n" + "=".repeat(60));
    console.log("🎉 DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log("Proxy Contract Address:", deployedAddress);
    console.log("Deployment Transaction:", deploymentTx.hash);
    console.log("Network:", (await ethers.provider.getNetwork()).name);
    console.log("=".repeat(60));

    // Example of how to use the proxy contract
    console.log("\n📖 Usage Examples:");
    console.log("// Single contract call:");
    console.log("await proxyContract.buy(targetAddress, depositAmount, minAmountOut);");
    console.log("await proxyContract.sell(targetAddress, depositAmount, minAmountOut);");

    return {
        proxyAddress: deployedAddress,
        transactionHash: deploymentTx.hash,
        gasUsed: receipt.gasUsed.toString(),
        network: (await ethers.provider.getNetwork()).name
    };
}

// Handle errors
main()
    .then((result) => {
        console.log("\n✅ Deployment completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });