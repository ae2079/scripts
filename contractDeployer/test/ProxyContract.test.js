const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlexibleProxyContract", function() {
    let proxyContract;
    let mockTargetContract;
    let mockCollateralToken;
    let mockTokenToSell;
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

        // Deploy mock ERC20 tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockCollateralToken = await MockERC20.deploy("Mock Collateral", "MCOL", 18);
        mockTokenToSell = await MockERC20.deploy("Mock Token", "MTOK", 18);

        // Transfer some tokens to addr1 for testing
        await mockCollateralToken.transfer(addr1.address, ethers.parseUnits("1000", 18));
        await mockTokenToSell.transfer(addr1.address, ethers.parseUnits("1000", 18));
    });

    describe("Deployment", function() {
        it("Should deploy successfully", async function() {
            expect(await proxyContract.getAddress()).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("Buy Function", function() {
        it("Should revert with zero target address", async function() {
            const depositAmount = ethers.parseUnits("1.0", 18);
            const minAmountOut = ethers.parseUnits("0.95", 18);

            await expect(
                proxyContract.buy(ethers.ZeroAddress, await mockCollateralToken.getAddress(), depositAmount, minAmountOut)
            ).to.be.revertedWith("Target contract cannot be zero address");
        });

        it("Should revert with zero collateral token address", async function() {
            const depositAmount = ethers.parseUnits("1.0", 18);
            const minAmountOut = ethers.parseUnits("0.95", 18);

            await expect(
                proxyContract.buy(await mockTargetContract.getAddress(), ethers.ZeroAddress, depositAmount, minAmountOut)
            ).to.be.revertedWith("Collateral token cannot be zero address");
        });

        it("Should call buyFor on target contract", async function() {
            const depositAmount = ethers.parseUnits("1.0", 18);
            const minAmountOut = ethers.parseUnits("0.95", 18);

            // Approve the proxy contract to spend tokens
            await mockCollateralToken.connect(addr1).approve(await proxyContract.getAddress(), depositAmount);

            // This should succeed if the target contract has a buyFor function
            await expect(
                proxyContract.connect(addr1).buy(
                    await mockTargetContract.getAddress(),
                    await mockCollateralToken.getAddress(),
                    depositAmount,
                    minAmountOut
                )
            ).to.not.be.reverted;
        });
    });

    describe("Sell Function", function() {
        it("Should revert with zero target address", async function() {
            const depositAmount = ethers.parseUnits("1.0", 18);
            const minAmountOut = ethers.parseUnits("0.95", 18);

            await expect(
                proxyContract.sell(ethers.ZeroAddress, await mockTokenToSell.getAddress(), depositAmount, minAmountOut)
            ).to.be.revertedWith("Target contract cannot be zero address");
        });

        it("Should revert with zero token to sell address", async function() {
            const depositAmount = ethers.parseUnits("1.0", 18);
            const minAmountOut = ethers.parseUnits("0.95", 18);

            await expect(
                proxyContract.sell(await mockTargetContract.getAddress(), ethers.ZeroAddress, depositAmount, minAmountOut)
            ).to.be.revertedWith("Token to sell cannot be zero address");
        });

        it("Should call sellTo on target contract", async function() {
            const depositAmount = ethers.parseUnits("1.0", 18);
            const minAmountOut = ethers.parseUnits("0.95", 18);

            // Approve the proxy contract to spend tokens
            await mockTokenToSell.connect(addr1).approve(await proxyContract.getAddress(), depositAmount);

            // This should succeed if the target contract has a sellTo function
            await expect(
                proxyContract.connect(addr1).sell(
                    await mockTargetContract.getAddress(),
                    await mockTokenToSell.getAddress(),
                    depositAmount,
                    minAmountOut
                )
            ).to.not.be.reverted;
        });
    });

    describe("isContract Function", function() {
        it("Should return true for deployed contracts", async function() {
            expect(await proxyContract.isContract(await mockTargetContract.getAddress())).to.be.true;
            expect(await proxyContract.isContract(await mockCollateralToken.getAddress())).to.be.true;
        });

        it("Should return false for EOA addresses", async function() {
            expect(await proxyContract.isContract(addr1.address)).to.be.false;
            expect(await proxyContract.isContract(addr2.address)).to.be.false;
        });
    });
});