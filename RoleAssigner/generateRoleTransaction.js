import { ethers } from "ethers";
import authorizerABI from "./ABI/authorizerABI.js";
import bondingCurveABI from "./ABI/bondingCurveABI.js";
import fs from "fs";
import path from "path";
import { QACC_PROJECTS } from "./configs.js";

// Configuration - Update these values as needed
const CONFIG = {
    // Contract addresses
    BONDING_CURVE_CONTRACT_ADDRESS: "0x6ff76740bdc5a5916fcf081e022eed3243024a14", // Replace with bonding curve address
    POLYGON_RPC_URL: "https://polygon-rpc.com", // Replace with your RPC URL

    // Role configuration
    ROLE_NAME: "CURVE_USER", // The role name to grant
    TARGET_ADDRESS: "0x84Ed70229D6Fc49d3624a81C8334cC0748ff0f5B", // The address to grant the role to
    // proxy contract address: 0x84Ed70229D6Fc49d3624a81C8334cC0748ff0f5B

    // Safe configuration
    SAFE_ADDRESS: "0x9298fD550E2c02AdeBf781e08214E4131CDeC44e", // Workflow Admin Multisig
    // for staging: 0x8DDF607FcFb260798Ae450cfc15292a75B4D4850
    // for production: 0x9298fD550E2c02AdeBf781e08214E4131CDeC44e

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

async function getOrchestratorAddress(bondingCurveAddress) {
    const bondignCurveContract = new ethers.Contract(
        bondingCurveAddress,
        bondingCurveABI,
        new ethers.JsonRpcProvider(CONFIG.POLYGON_RPC_URL)
    );
    return await bondignCurveContract.orchestrator();
}

async function getAuthorizerAddress() {
    try {
        const orchestratorAddress = await getOrchestratorAddress(CONFIG.BONDING_CURVE_CONTRACT_ADDRESS);
        const orchestratorContract = new ethers.Contract(
            orchestratorAddress,
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

// Function to execute role generation for all projects
async function executeForAllProjects() {
    console.log("🚀 Starting role transaction generation for all projects...");
    console.log(`📋 Found ${Object.keys(QACC_PROJECTS).length} projects to process`);

    const allTransactions = [];
    const results = [];

    for (const [projectSymbol, projectConfig] of Object.entries(QACC_PROJECTS)) {
        console.log(`\n🔄 Processing project: ${projectSymbol}`);
        console.log(`   - Bonding Curve: ${projectConfig.bondingCurve}`);
        console.log(`   - Token: ${projectConfig.token}`);

        try {
            CONFIG.BONDING_CURVE_CONTRACT_ADDRESS = projectConfig.bondingCurve;
            CONFIG.PROJECT_NAME = projectSymbol;

            // Get authorizer address for this project
            const authorizerAddress = await getAuthorizerAddress();
            const authorizerContract = new ethers.Contract(
                authorizerAddress,
                authorizerABI,
                new ethers.JsonRpcProvider(CONFIG.POLYGON_RPC_URL)
            );

            // Generate role ID for this project
            const roleId = await generateRoleId(authorizerContract);

            // Check if target address already has role
            const hasRoleAlready = await hasRole(authorizerContract, roleId, CONFIG.TARGET_ADDRESS);

            if (hasRoleAlready) {
                console.log(`⚠️  Skipped ${projectSymbol} - address already has role`);
                results.push({
                    project: projectSymbol,
                    success: false,
                    reason: "Address already has role"
                });
                continue;
            }

            // Build transaction for this project
            const transaction = {
                to: authorizerAddress,
                value: "0",
                data: "0x2f2ff15d" + ethers.AbiCoder.defaultAbiCoder().encode(
                    ["bytes32", "address"], [roleId, CONFIG.TARGET_ADDRESS]
                ).slice(2),
                contractMethod: "grantRole(bytes32,address)",
                contractInputsValues: [
                    roleId,
                    CONFIG.TARGET_ADDRESS,
                ]
            };

            allTransactions.push(transaction);

            results.push({
                project: projectSymbol,
                success: true,
                data: {
                    authorizerAddress,
                    roleId,
                    userAddress: CONFIG.TARGET_ADDRESS
                }
            });
            console.log(`✅ Successfully processed ${projectSymbol}`);

        } catch (error) {
            console.error(`❌ Error processing ${projectSymbol}:`, error.message);
            results.push({
                project: projectSymbol,
                success: false,
                error: error.message
            });
        }
    }

    // Generate single batched transaction file if we have transactions
    if (allTransactions.length > 0) {
        console.log(`\n📦 Creating batched transaction file with ${allTransactions.length} transactions...`);

        ensureOutputDirectory();

        const transactionData = {
            version: "1.0",
            chainId: "137", // Polygon Mainnet
            createdAt: Date.now(),
            meta: {
                name: `[ROLE-GRANT]-[ALL-PROJECTS]-[${CONFIG.ROLE_NAME}]-[BATCHED]`,
                description: `Batched role grant transactions for all projects - Grant ${CONFIG.ROLE_NAME} role to ${CONFIG.TARGET_ADDRESS}`,
                txBuilderVersion: "",
                createdFromSafeAddress: CONFIG.SAFE_ADDRESS,
                createdFromOwnerAddress: "",
                checksum: ""
            },
            transactions: allTransactions
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
        const filename = `role_grant_all_projects_batched_${timestamp}.json`;
        const filePath = path.join(CONFIG.OUTPUT_DIR, filename);

        fs.writeFileSync(filePath, JSON.stringify(transactionData, null, 2));
        console.log(`✅ Batched transaction file generated: ${filename}`);
        console.log(`📊 Total transactions: ${allTransactions.length}`);
    }

    // Print summary
    console.log("\n📊 Processing Summary:");
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`   ✅ Successful: ${successful}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📦 Batched transactions: ${allTransactions.length}`);

    if (failed > 0) {
        console.log("\n❌ Failed projects:");
        results.filter(r => !r.success).forEach(r => {
            console.log(`   - ${r.project}: ${r.reason || r.error}`);
        });
    }

    return results;
}

// Main execution function
async function main() {
    console.log("🚀 Starting role transaction generation...");
    console.log("📋 Configuration:");
    // console.log(`   - Bonding Curve: ${CONFIG.BONDING_CURVE_CONTRACT_ADDRESS}`);
    console.log(`   - Target Address: ${CONFIG.TARGET_ADDRESS}`);
    console.log(`   - Role Name: ${CONFIG.ROLE_NAME}`);
    console.log(`   - Safe Address: ${CONFIG.SAFE_ADDRESS}`);

    try {
        // Example usage:

        // 1. Generate transaction for a single address (uses CONFIG.TARGET_ADDRESS)
        // await generateRoleTransaction();

        // 2. Generate transaction for a specific address
        // await generateRoleTransaction("0x1234567890123456789012345678901234567890");

        // 3. Generate transactions for multiple addresses
        // const addresses = [
        //     "0x1234567890123456789012345678901234567890",
        //     "0x0987654321098765432109876543210987654321"
        // ];
        // await generateRoleTransactionsForMultipleAddresses(addresses);

        // 4. Execute for all projects
        await executeForAllProjects();

        console.log("✅ Done!");
    } catch (error) {
        console.error("❌ Error in main function:", error);
        process.exit(1);
    }
}

// Run the script if called directly
console.log("🔍 Script loaded, checking execution...");
main().catch(console.error);