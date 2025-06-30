const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlexibleProxyContract", function() {
    let proxyContract;
    let mockTargetContract;
    let owner;
    let addr1;
    let addr2;

    beforeEach(async function() {
        // Get signers
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy the proxy contract
        const FlexibleProxyContract = await ethers.getContractFactory("FlexibleProxyContract");
        proxyContract = await FlexibleProxyContract.deploy();

        // Deploy a mock target contract for testing
        const MockTargetContract = await ethers.getContractFactory("MockTargetContract");
        mockTargetContract = await MockTargetContract.deploy();
    });

    describe("Deployment", function() {
        it("Should deploy successfully", async function() {
            expect(await proxyContract.getAddress()).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("Buy Function", function() {
        it("Should revert with zero address", async function() {
            const depositAmount = ethers.parseUnits("1.0", 18);
            const minAmountOut = ethers.parseUnits("0.95", 18);

            await expect(
                proxyContract.buy(ethers.ZeroAddress, depositAmount, minAmountOut)
            ).to.be.revertedWith("Target contract cannot be zero address");
        });

        it("Should call buy on target contract", async function() {
            const depositAmount = ethers.parseUnits("1.0", 18);
            const minAmountOut = ethers.parseUnits("0.95", 18);

            // This should succeed if the target contract has a buy function
            await expect(
                proxyContract.buy(await mockTargetContract.getAddress(), depositAmount, minAmountOut)
            ).to.not.be.reverted;
        });
    });

    describe("Sell Function", function() {
        it("Should revert with zero address", async function() {
            const depositAmount = ethers.parseUnits("1.0", 18);
            const minAmountOut = ethers.parseUnits("0.95", 18);

            await expect(
                proxyContract.sell(ethers.ZeroAddress, depositAmount, minAmountOut)
            ).to.be.revertedWith("Target contract cannot be zero address");
        });

        it("Should call sell on target contract", async function() {
            const depositAmount = ethers.parseUnits("1.0", 18);
            const minAmountOut = ethers.parseUnits("0.95", 18);

            // This should succeed if the target contract has a sell function
            await expect(
                proxyContract.sell(await mockTargetContract.getAddress(), depositAmount, minAmountOut)
            ).to.not.be.reverted;
        });
    });
});