import fs from 'fs';
import { ethers } from 'ethers';

const FUNCTION_SELECTORS = {
    approve: "0x095ea7b3",
    buy: "0xd6febde8",
    transfer: "0xa9059cbb",
    pushPayment: "0x8028b82f"
};

const ORCHESTRATOR_ABI = [{
    "inputs": [],
    "name": "fundingManager",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
}];

const FUNDING_MANAGER_ABI = [{
    "inputs": [
        { "internalType": "uint256", "name": "_depositAmount", "type": "uint256" }
    ],
    "name": "calculatePurchaseReturn",
    "outputs": [{ "internalType": "uint256", "name": "mintAmount", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
}];

const ORCHESTRATOR_LIST_MODULES_ABI = [{
    "inputs": [],
    "name": "listModules",
    "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
}];

const MODULE_ABI = [{
    "inputs": [],
    "name": "title",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
}];

async function getPaymentRouterAddress(orchestratorAddress) {
    try {
        const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
        const orchestratorContract = new ethers.Contract(
            orchestratorAddress,
            ORCHESTRATOR_LIST_MODULES_ABI,
            provider
        );

        // Get list of modules
        const modules = await orchestratorContract.listModules();
        console.log("Found modules:", modules);

        // Iterate through modules to find payment router
        for (const module of modules) {
            const moduleContract = new ethers.Contract(
                module,
                MODULE_ABI,
                provider
            );

            try {
                const moduleName = await moduleContract.title();
                console.log(`Module ${module} has title: ${moduleName}`);

                if (moduleName === 'LM_PC_PaymentRouter_v1') {
                    console.log(`Found Payment Router at address: ${module}`);
                    return module;
                }
            } catch (error) {
                console.log(`Could not get title for module ${module}:`, error.message);
                continue;
            }
        }

        throw new Error("Payment Router module not found");
    } catch (error) {
        console.error("Error getting payment router address:", error);
        throw error;
    }
}

async function calculatePurchaseReturn(fundingManagerAddress, amount) {
    try {
        const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
        const fundingManagerContract = new ethers.Contract(
            fundingManagerAddress,
            FUNDING_MANAGER_ABI,
            provider
        );

        const amountInWei = ethers.parseUnits(amount.toString(), 18);
        const purchaseReturn = await fundingManagerContract.calculatePurchaseReturn(amountInWei);
        return purchaseReturn.toString();
    } catch (error) {
        console.error("Error calculating purchase return:", error);
        throw error;
    }
}

async function getFundingManagerAddress(orchestratorAddress) {
    try {
        const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
        const orchestratorContract = new ethers.Contract(
            orchestratorAddress,
            ORCHESTRATOR_ABI,
            provider
        );
        const fundingManagerAddress = await orchestratorContract.fundingManager();
        console.log(`Funding Manager Address: ${fundingManagerAddress}`);
        return fundingManagerAddress;
    } catch (error) {
        console.error("Error getting funding manager address:", error);
        throw error;
    }
}

function generateTransactionJson(fundingPotMSAddress, projectName, donationTokenAddress, fundingManagerAddress, tokenAmount, ABCTokenAmount, paymentRouterAddress) {
    // Current timestamp in milliseconds
    const currentTimestamp = Date.now();
    const tokenAmountInWei = ethers.parseUnits(tokenAmount.toString(), 18).toString();

    // Create the transaction structure
    const transactionData = {
        version: "1.0",
        chainId: "137", // Polygon Mainnet
        createdAt: currentTimestamp,
        meta: {
            name: `[FUNDING_POT]-[${projectName}]-[BATCH-1]-[TX-0]`,
            description: `Batch 1 for ${projectName}`,
            txBuilderVersion: "",
            createdFromSafeAddress: fundingPotMSAddress,
            createdFromOwnerAddress: "",
            checksum: ""
        },
        transactions: [{
                to: donationTokenAddress,
                value: "0",
                data: FUNCTION_SELECTORS.approve + ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256"], [fundingManagerAddress, tokenAmountInWei]
                ).slice(2), // Remove '0x' prefix
                contractMethod: "approve(address,uint256)",
                contractInputsValues: [
                    fundingManagerAddress,
                    tokenAmountInWei
                ]
            },
            {
                to: fundingManagerAddress,
                value: "0",
                data: FUNCTION_SELECTORS.buy + ethers.AbiCoder.defaultAbiCoder().encode(
                    ["uint256", "uint256"], [tokenAmountInWei, "1"]
                ).slice(2),
                contractMethod: "buy(uint256,uint256)",
                contractInputsValues: [
                    tokenAmountInWei,
                    "1"
                ]
            },
            {
                to: abcTokenAddress,
                value: "0",
                data: FUNCTION_SELECTORS.transfer + ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256"], [paymentRouterAddress, ABCTokenAmount]
                ).slice(2),
                contractMethod: "transfer(address,uint256)",
                contractInputsValues: [
                    paymentRouterAddress,
                    ABCTokenAmount
                ]
            },
            {
                to: paymentRouterAddress,
                value: "0",
                data: FUNCTION_SELECTORS.pushPayment + ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "address", "uint256", "uint256", "uint256", "uint256"], [userAddress, abcTokenAddress, ABCTokenAmount, start, cliff, end]
                ).slice(2),
                contractMethod: "pushPayment(address,address,uint256,uint256,uint256,uint256)",
                contractInputsValues: [
                    userAddress,
                    abcTokenAddress,
                    ABCTokenAmount,
                    start.toString(),
                    cliff.toString(),
                    end.toString()
                ]
            }
        ]
    };

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
    const filename = `transactions_${timestamp}.json`;

    // Write to JSON file
    fs.writeFileSync(filename, JSON.stringify(transactionData, null, 2));
    console.log(`Transaction file generated: ${filename}`);
}



// Run the function
const projectName = 'TEST_PROJECT';
const orchestratorAddress = "0x28c066bb3a518c41623fc1e282cb491243b6ebc5";
const fundingPotMSAddress = "0x6a15235f02d23b81dd9de9f522c63029f812b1ec"; // project address that donations goes to it
const donationTokenAddress = "0xc20CAf8deE81059ec0c8E5971b2AF7347eC131f4"; // TPOL contract address
const abcTokenAddress = "0xdf553E1c79434AdbfE2b3489b1062E3e3DE73542";
const userAddress = "0x864af8991100d5E2Df52a3c7ae64db111E983D24";
const start = Math.floor(Date.now() / 1000) + 1800; // 30 mins after now
const cliff = 1800; // 30 mins
const end = start + 2 * 60 * 60; // 2 hours after start
const tokenAmount = 10; // we should have or send this amount of donation token to the porject address before execute this script
const fundingManagerAddress = await getFundingManagerAddress(orchestratorAddress);
const ABCTokenAmount = await calculatePurchaseReturn(fundingManagerAddress, tokenAmount);
console.log("purchaseReturn amount:", ABCTokenAmount);
const paymentRouterAddress = await getPaymentRouterAddress(orchestratorAddress);

generateTransactionJson(fundingPotMSAddress, projectName, donationTokenAddress, fundingManagerAddress, tokenAmount, ABCTokenAmount, paymentRouterAddress);