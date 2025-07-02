import { ethers } from "ethers";
import authorizerABI from "./ABI/authorizerABI.js";
import fs from "fs";
import path from "path";

// Configuration - Update these values as needed
const CONFIG = {
    // Contract addresses
    ORCHESTRATOR_CONTRACT_ADDRESS: "0x28c066bb3a518c41623fc1e282cb491243b6ebc5", // Replace with orchestrator address
    BONDING_CURVE_CONTRACT_ADDRESS: "0x6ff76740bdc5a5916fcf081e022eed3243024a14", // Replace with bonding curve address
    POLYGON_RPC_URL: "https://polygon-rpc.com", // Replace with your RPC URL

    // Role configuration
    ROLE_NAME: "CURVE_USER", // The role name to grant
    TARGET_ADDRESS: "0xf8EFA36A3C6F1233a4144F5fcA614a28b1fBADEC", // The address to grant the role to

    // Safe configuration
    SAFE_ADDRESS: "0x8DDF607FcFb260798Ae450cfc15292a75B4D4850", // Workflow Admin Multisig

    // Output configuration
    OUTPUT_DIR: "./transactions", // Directory to save transaction files
    PROJECT_NAME: "ROLE-GRANT", // Project name for transaction files
    BATCH_SIZE: 25, // Number of transactions per batch
};

// Orchestrator ABI - minimal version for getting authorizer address
const ORCHESTRATOR_ABI = [{
    inputs: [],
    name: "authorizer",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
}];

async function getAuthorizerAddress() {
    try {
        const orchestratorContract = new ethers.Contract(
            CONFIG.ORCHESTRATOR_CONTRACT_ADDRESS,
            ORCHESTRATOR_ABI,
            new ethers.JsonRpcProvider(CONFIG.POLYGON_RPC_URL)
        );
        return await orchestratorContract.authorizer();
    } catch (error) {
        console.error("Error getting authorizer address:", error);
        throw error;
    }
}

async function generateRoleId(authorizerContract) {
    try {
        const module = CONFIG.BONDING_CURVE_CONTRACT_ADDRESS;
        const role = ethers.encodeBytes32String(CONFIG.ROLE_NAME);
        return await authorizerContract.generateRoleId(module, role);
    } catch (error) {
        console.error("Error generating role ID:", error);
        throw error;
    }
}

async function hasRole(authorizerContract, roleId, targetAddress) {
    try {
        return await authorizerContract.hasRole(roleId, targetAddress);
    } catch (error) {
        console.error("Error checking role:", error);
        throw error;
    }
}

function buildRoleTransactions(authorizerAddress, roleId, userAddresses) {
    const transactions = [];
    for (const userAddress of userAddresses) {
        transactions.push({
            to: authorizerAddress,
            value: "0",
            data: "0x2f2ff15d" + ethers.AbiCoder.defaultAbiCoder().encode(
                ["bytes32", "address"], [roleId, userAddress]
            ).slice(2),
            contractMethod: "grantRole(bytes32,address)",
            contractInputsValues: [
                roleId,
                userAddress,
            ]
        });
    }
    return transactions;
}

function ensureOutputDirectory() {
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
        console.log(`Created output directory: ${CONFIG.OUTPUT_DIR}`);
    }
}

async function generateRoleTransactionJson(safe, projectName, authorizerAddress, roleId, userAddresses) {
    const batchSize = CONFIG.BATCH_SIZE;
    const totalUsers = userAddresses.length;
    const totalBatches = Math.ceil(totalUsers / batchSize);
    const currentTimestamp = Date.now();

    console.log(`Generating ${totalBatches} batch(es) for ${totalUsers} addresses...`);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min(startIndex + batchSize, totalUsers);
        const batchUsers = userAddresses.slice(startIndex, endIndex);

        const transactionData = {
            version: "1.0",
            chainId: "137", // Polygon Mainnet
            createdAt: currentTimestamp,
            meta: {
                name: `[ROLE-GRANT]-[${projectName}]-[${CONFIG.ROLE_NAME}]-[TX-${batchIndex}]`,
                description: `Batch ${batchIndex + 1} for ${projectName} - Grant ${CONFIG.ROLE_NAME} role`,
                txBuilderVersion: "",
                createdFromSafeAddress: safe,
                createdFromOwnerAddress: "",
                checksum: ""
            },
            transactions: buildRoleTransactions(authorizerAddress, roleId, batchUsers)
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
        const filename = `role_grant_batch${batchIndex + 1}_${timestamp}.json`;
        const filePath = path.join(CONFIG.OUTPUT_DIR, filename);

        fs.writeFileSync(filePath, JSON.stringify(transactionData, null, 2));
        console.log(`✅ Transaction file generated: ${filename}`);
        console.log(`📊 Batch ${batchIndex + 1}: ${batchUsers.length} addresses`);
    }
}

async function generateRoleTransaction(targetAddress = null) {
    try {
        const userAddress = targetAddress || CONFIG.TARGET_ADDRESS;

        if (!userAddress || userAddress === "0x...") {
            console.error("Please provide a valid target address in CONFIG.TARGET_ADDRESS or pass it as parameter");
            return null;
        }

        console.log("Getting authorizer address...");
        const authorizerAddress = await getAuthorizerAddress();
        console.log("Authorizer address:", authorizerAddress);

        const authorizerContract = new ethers.Contract(
            authorizerAddress,
            authorizerABI,
            new ethers.JsonRpcProvider(CONFIG.POLYGON_RPC_URL)
        );

        console.log("Generating role ID...");
        const roleId = await generateRoleId(authorizerContract);
        console.log("Role ID:", roleId);

        console.log(`Checking if ${userAddress} already has ${CONFIG.ROLE_NAME} role...`);
        const hasRoleAlready = await hasRole(authorizerContract, roleId, userAddress);
        console.log("Has role already:", hasRoleAlready);

        if (hasRoleAlready) {
            console.log(`Address ${userAddress} already has ${CONFIG.ROLE_NAME} role. Skipping...`);
            return null;
        }

        console.log(`Generating transaction to grant ${CONFIG.ROLE_NAME} role to ${userAddress}...`);

        // Ensure output directory exists
        ensureOutputDirectory();

        // Generate transaction JSON in the same format as generateRemovePaymentsTransactions.js
        await generateRoleTransactionJson(
            CONFIG.SAFE_ADDRESS,
            CONFIG.PROJECT_NAME,
            authorizerAddress,
            roleId, [userAddress]
        );

        console.log(`✅ Role ${CONFIG.ROLE_NAME} transaction generated for address ${userAddress}`);

        return {
            authorizerAddress,
            roleId,
            userAddress
        };

    } catch (error) {
        console.error("Error generating transaction:", error);
        throw error;
    }
}

// Function to generate transactions for multiple addresses
async function generateRoleTransactionsForMultipleAddresses(addresses) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
        console.error("Please provide a valid array of addresses");
        return [];
    }

    console.log(`Generating role transactions for ${addresses.length} addresses...`);

    try {
        console.log("Getting authorizer address...");
        const authorizerAddress = await getAuthorizerAddress();
        console.log("Authorizer address:", authorizerAddress);

        const authorizerContract = new ethers.Contract(
            authorizerAddress,
            authorizerABI,
            new ethers.JsonRpcProvider(CONFIG.POLYGON_RPC_URL)
        );

        console.log("Generating role ID...");
        const roleId = await generateRoleId(authorizerContract);
        console.log("Role ID:", roleId);

        // Check which addresses don't already have the role
        const validAddresses = [];
        for (const address of addresses) {
            console.log(`Checking if ${address} already has ${CONFIG.ROLE_NAME} role...`);
            const hasRoleAlready = await hasRole(authorizerContract, roleId, address);
            if (!hasRoleAlready) {
                validAddresses.push(address);
            } else {
                console.log(`Address ${address} already has ${CONFIG.ROLE_NAME} role. Skipping...`);
            }
        }

        if (validAddresses.length === 0) {
            console.log("No addresses need the role. Exiting...");
            return [];
        }

        console.log(`Generating transactions for ${validAddresses.length} addresses...`);

        // Ensure output directory exists
        ensureOutputDirectory();

        // Generate transaction JSON in the same format as generateRemovePaymentsTransactions.js
        await generateRoleTransactionJson(
            CONFIG.SAFE_ADDRESS,
            CONFIG.PROJECT_NAME,
            authorizerAddress,
            roleId,
            validAddresses
        );

        console.log(`✅ Generated transactions for ${validAddresses.length} addresses`);

        return {
            authorizerAddress,
            roleId,
            validAddresses
        };

    } catch (error) {
        console.error("Error generating transactions:", error);
        throw error;
    }
}

// Main execution function
async function main() {
    console.log("🚀 Starting role transaction generation...");
    console.log("📋 Configuration:");
    console.log(`   - Orchestrator: ${CONFIG.ORCHESTRATOR_CONTRACT_ADDRESS}`);
    console.log(`   - Bonding Curve: ${CONFIG.BONDING_CURVE_CONTRACT_ADDRESS}`);
    console.log(`   - Target Address: ${CONFIG.TARGET_ADDRESS}`);
    console.log(`   - Role Name: ${CONFIG.ROLE_NAME}`);
    console.log(`   - Safe Address: ${CONFIG.SAFE_ADDRESS}`);

    try {
        // Example usage:

        // 1. Generate transaction for a single address (uses CONFIG.TARGET_ADDRESS)
        await generateRoleTransaction();

        // 2. Generate transaction for a specific address
        // await generateRoleTransaction("0x1234567890123456789012345678901234567890");

        // 3. Generate transactions for multiple addresses
        // const addresses = [
        //     "0x1234567890123456789012345678901234567890",
        //     "0x0987654321098765432109876543210987654321"
        // ];
        // await generateRoleTransactionsForMultipleAddresses(addresses);

        console.log("✅ Done!");
    } catch (error) {
        console.error("❌ Error in main function:", error);
        process.exit(1);
    }
}

// Run the script if called directly
console.log("🔍 Script loaded, checking execution...");
main().catch(console.error);