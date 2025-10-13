import fs from 'fs';
import { ethers } from 'ethers';

const FUNCTION_SELECTORS = {
    approve: "0x095ea7b3",
    buy: "0xd6febde8",
    transfer: "0xa9059cbb",
    pushPayment: "0x8028b82f",
    removeAllPaymentReceiverPayments: "0xcb8e092f",
};

// Payment Processor ABI - for checking active receivers
const PAYMENT_PROCESSOR_ABI = [
    "function isActivePaymentReceiver(address client, address paymentReceiver) external view returns (bool)"
];

// Configuration for blockchain interaction
const RPC_URL = "https://polygon-rpc.com"; // Polygon Mainnet RPC

// Circuit Breaker Configuration
const CIRCUIT_BREAKER_CONFIG = {
    maxRetries: 5,
    initialDelayMs: 2000, // Start with 2 seconds
    maxDelayMs: 600000, // Max 10 minutes
    backoffMultiplier: 2, // Exponential backoff
    rateLimitDelay: 60000, // 1 minute delay when rate limited
};

// Circuit Breaker State
let circuitBreakerState = {
    failureCount: 0,
    lastFailureTime: null,
    isOpen: false,
};

// Check if error is a rate limit error
function isRateLimitError(error) {
    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = error.code;

    return (
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests') ||
        errorMessage.includes('call rate limit exhausted') ||
        errorCode === 'RATE_LIMIT_EXCEEDED' ||
        errorCode === -32090 ||
        errorCode === 429 ||
        errorCode === 'BAD_DATA' // ethers wraps rate limit as BAD_DATA
    );
}

// Sleep function
function sleep(ms) {
    console.log(`   ⏸️  Sleeping for ${(ms / 1000).toFixed(1)} seconds...`);
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate delay with exponential backoff
function calculateBackoffDelay(retryCount) {
    const delay = Math.min(
        CIRCUIT_BREAKER_CONFIG.initialDelayMs * Math.pow(CIRCUIT_BREAKER_CONFIG.backoffMultiplier, retryCount),
        CIRCUIT_BREAKER_CONFIG.maxDelayMs
    );
    return delay;
}

// Execute with retry and circuit breaker
async function executeWithRetry(fn, context = '') {
    let lastError;

    for (let attempt = 0; attempt <= CIRCUIT_BREAKER_CONFIG.maxRetries; attempt++) {
        try {
            // If circuit breaker is open, wait before attempting
            if (circuitBreakerState.isOpen) {
                const timeSinceLastFailure = Date.now() - circuitBreakerState.lastFailureTime;
                if (timeSinceLastFailure < CIRCUIT_BREAKER_CONFIG.rateLimitDelay) {
                    const waitTime = CIRCUIT_BREAKER_CONFIG.rateLimitDelay - timeSinceLastFailure;
                    console.log(`   🔴 Circuit breaker OPEN. Waiting ${(waitTime / 1000).toFixed(1)}s before retry...`);
                    await sleep(waitTime);
                } else {
                    console.log(`   🟡 Circuit breaker half-open. Attempting request...`);
                    circuitBreakerState.isOpen = false;
                }
            }

            const result = await fn();

            // Success - reset circuit breaker
            if (circuitBreakerState.failureCount > 0) {
                console.log(`   🟢 Circuit breaker CLOSED. Request successful after ${circuitBreakerState.failureCount} failures.`);
            }
            circuitBreakerState.failureCount = 0;
            circuitBreakerState.isOpen = false;

            return result;

        } catch (error) {
            lastError = error;

            if (attempt < CIRCUIT_BREAKER_CONFIG.maxRetries) {
                if (isRateLimitError(error)) {
                    // Rate limit error - use longer delays and open circuit breaker
                    circuitBreakerState.failureCount++;
                    circuitBreakerState.lastFailureTime = Date.now();
                    circuitBreakerState.isOpen = true;

                    const delay = calculateBackoffDelay(attempt);
                    console.log(`   ⚠️  Rate limit detected (attempt ${attempt + 1}/${CIRCUIT_BREAKER_CONFIG.maxRetries + 1})`);
                    console.log(`   🔄 Retrying ${context} after ${(delay / 1000).toFixed(1)}s delay...`);
                    await sleep(delay);
                } else {
                    // Other errors - use shorter delay and retry
                    const shortDelay = Math.min(1000 * Math.pow(1.5, attempt), 10000); // 1s, 1.5s, 2.25s, etc.
                    console.log(`   ⚠️  Request failed (attempt ${attempt + 1}/${CIRCUIT_BREAKER_CONFIG.maxRetries + 1}): ${error.message.substring(0, 100)}...`);
                    console.log(`   🔄 Retrying ${context} after ${(shortDelay / 1000).toFixed(1)}s delay...`);
                    await sleep(shortDelay);
                }
            } else {
                console.log(`   ❌ Max retries (${CIRCUIT_BREAKER_CONFIG.maxRetries}) reached for ${context}`);
                throw error;
            }
        }
    }

    throw lastError;
}

function readTransactionFile(filename) {
    try {
        const data = fs.readFileSync(filename, 'utf8');
        const transactionData = JSON.parse(data);
        console.log(`✅ Successfully read transaction file: ${filename}`);
        console.log(`📊 Found ${transactionData.transactions.length} transactions`);
        return transactionData;
    } catch (error) {
        console.error(`❌ Error reading file ${filename}:`, error.message);
        throw error;
    }
}

function getUserAddressesFromTransactions(transactions) {
    const userAddresses = [];
    for (const transaction of transactions) {
        for (const tx of transaction) {
            if (tx.functionSignature === "pushPayment(address,address,uint256,uint256,uint256,uint256)") {
                userAddresses.push(tx.inputValues[0]);
            }
        }
    }
    return userAddresses;
}

/**
 * Filter users to only include those with active payment streams
 */
async function filterActiveUsers(userAddresses, client, paymentProcessor) {
    console.log(`\n🔍 Filtering ${userAddresses.length} users for active payment streams...`);
    console.log(`📍 Payment Processor: ${paymentProcessor}`);
    console.log(`📍 Client: ${client}\n`);

    // Setup provider and contract
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(paymentProcessor, PAYMENT_PROCESSOR_ABI, provider);

    const activeUsers = [];
    let activeCount = 0;
    let inactiveCount = 0;
    let errorCount = 0;

    // Check each user
    for (let i = 0; i < userAddresses.length; i++) {
        const userAddress = userAddresses[i];

        try {
            // Use retry mechanism with circuit breaker
            const isActive = await executeWithRetry(
                async() => await contract.isActivePaymentReceiver(client, userAddress),
                `checking ${userAddress}`
            );

            if (isActive) {
                activeUsers.push(userAddress);
                activeCount++;
            } else {
                inactiveCount++;
            }

            // Show progress every 10 users
            if ((i + 1) % 10 === 0 || i === userAddresses.length - 1) {
                console.log(`   [${i + 1}/${userAddresses.length}] Active: ${activeCount}, Inactive: ${inactiveCount}, Errors: ${errorCount}`);
            }

            // Small delay to avoid rate limiting (only if circuit breaker is not open)
            if (i < userAddresses.length - 1 && !circuitBreakerState.isOpen) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }

        } catch (error) {
            // Even after retries, still failed - log and continue
            console.error(`   ❌ Failed after retries for ${userAddress}: ${error.message.substring(0, 100)}`);
            errorCount++;
        }
    }

    console.log(`\n📊 Filtering Summary:`);
    console.log(`   ✅ Active users (will remove): ${activeCount}`);
    console.log(`   ⭕ Inactive users (skipped): ${inactiveCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📝 Total checked: ${userAddresses.length}\n`);

    return activeUsers;
}

function buildTransactions(toAddress, client, userAddresses) {
    const transactions = [];
    for (const user of userAddresses) {
        transactions.push({
            to: toAddress,
            value: "0",
            data: FUNCTION_SELECTORS.removeAllPaymentReceiverPayments + ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address"], [client, user]
            ).slice(2),
            contractMethod: "removeAllPaymentReceiverPayments(address,address)",
            contractInputsValues: [
                client,
                user,
            ]
        })
    }
    return transactions;
}


function generateTransactionJson(safe, projectName, paymentProcessor, client, userAddresses) {
    const batchSize = 25;
    const totalUsers = userAddresses.length;
    const totalBatches = Math.ceil(totalUsers / batchSize);
    const currentTimestamp = Date.now();

    // Create project folder and removePayment subfolder if they don't exist
    const projectFolder = `./${projectName}`;
    const removePaymentFolder = `${projectFolder}/removePayment`;

    if (!fs.existsSync(projectFolder)) {
        fs.mkdirSync(projectFolder, { recursive: true });
        console.log(`📁 Created project folder: ${projectFolder}`);
    }

    if (!fs.existsSync(removePaymentFolder)) {
        fs.mkdirSync(removePaymentFolder, { recursive: true });
        console.log(`📁 Created removePayment folder: ${removePaymentFolder}`);
    }

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min(startIndex + batchSize, totalUsers);
        const batchUsers = userAddresses.slice(startIndex, endIndex);

        const transactionData = {
            version: "1.0",
            chainId: "137", // Polygon Mainnet
            createdAt: currentTimestamp,
            meta: {
                name: `[REMOVE-PAYMENTS]-[${projectName}]-[QACC-ROUND-1]-[TX-${batchIndex}]`,
                description: `Batch ${batchIndex + 1} for ${projectName}`,
                txBuilderVersion: "",
                createdFromSafeAddress: safe,
                createdFromOwnerAddress: "",
                checksum: ""
            },
            transactions: buildTransactions(paymentProcessor, client, batchUsers, batchSize)
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
        const filename = `transactions_batch${batchIndex + 1}_${timestamp}.json`;
        const filePath = `${removePaymentFolder}/${filename}`;
        fs.writeFileSync(filePath, JSON.stringify(transactionData, null, 2));
        console.log(`Transaction file generated: ${filePath}`);
    }
}



// Main execution
async function main() {
    try {
        const projectName = 'X23';
        const paymentProcessor = "0xD6F574062E948d6B7F07c693f1b4240aFeA41657";
        const paymentRouterAddress = "0x6B5d37c206D56B16F44b0C1b89002fd9B138e9Be";
        const workflowAdminMultisig = "0x9298fD550E2c02AdeBf781e08214E4131CDeC44e";

        console.log('📖 Reading transaction files...\n');

        const filesData = readTransactionFile("4.json");
        const qaccUsers = getUserAddressesFromTransactions(filesData.transactions.readable);

        const filesDataEA1 = readTransactionFile("1.json");
        const ea1Users = getUserAddressesFromTransactions(filesDataEA1.transactions.readable);

        const filesDataEA2 = readTransactionFile("2.json");
        const ea2Users = getUserAddressesFromTransactions(filesDataEA2.transactions.readable);

        const filesDataEA3 = readTransactionFile("3.json");
        const ea3Users = getUserAddressesFromTransactions(filesDataEA3.transactions.readable);

        const filesDataS2 = readTransactionFile("5.json");
        const S2Users = getUserAddressesFromTransactions(filesDataS2.transactions.readable);

        // Union all EA users and remove duplicates
        const allEAUsers = [...new Set([...ea1Users, ...ea2Users, ...ea3Users])];
        const totalUsers = [...new Set([...allEAUsers, ...qaccUsers, ...S2Users])];

        console.log(`\n📊 User Statistics:`);
        console.log(`   Total EA users: ${allEAUsers.length}`);
        console.log(`   QACC S1 users: ${qaccUsers.length}`);
        console.log(`   S2 users: ${S2Users.length}`);
        console.log(`   Total users: ${totalUsers.length}`);

        const manualUsers = [
            "0xA82BcD1BA56b4BB0f46Bc29dA53413c73Be27509",
            "0xB53b0255895c4F9E3a185E484e5B674bCCfbc076",
            "0xb749A586080436e616f097f193Ba9CB6A25E7Ea6",
            "0xBD19a3F0A9CaCE18513A1e2863d648D13975CB30",
            "0x7EA74516e7d801Cd5267E2B6B4F456B5BB75b267",
            "0xf904C82a9528611BB7C9D296E238BFca45b9eab1",
            "0x00d7cE31887a509ef93FD846D6b7cAebF81783D7",
            "0x7e461d582a6286Ec922B5863453D8C19c2aAFE8e",
            "0xdff92A1D3c7832CBCc762eE5F326679dd801648E",
            "0x839395e20bbB182fa440d08F850E6c7A8f6F0780",
            "0x3701bBFc577F1CBd579Fe15Da23B687968030fBE",
            "0xEab804590011d0650FcB6c4Da1870C6e9ca062D1",
            "0x52D06279A2c4cdfDB9735163968b99e58F976bBb",
            "0x3e67E9c147Fa18dF710199D329F46bDaab128087",
            "0x8E5Dd554117dd930C8dE99ddA5F0B41D318cD312",
            "0x235987B53ED16a5F331c3648F78cBc148A877D27",
            "0xc4a395A81957BfdC8500a141A9Bb60cD237c1255",
            "0x4159f5DF51faB9b89335990FFFaf1Eb66008A4b1",
            "0x5119b10c1D81465dCcD4E66BDb316d802eD33E06",
            "0xf6958A622Ee89f77a9BfEe71fC839D3Aa32E1250",
            "0xd0319771F95375b161006fB2481fde74EB80cCf4",
            "0xB97018836689128D353fB55CC128c7cb6d8A569e",
            "0xcd98aa3437F953259e6983EBb8fE47B5f50317B4",
            "0x76E059C6FF6bf9FFFD5f33AFdf4AB2FD511C9DF4",
            "0x5592a99E64C24ef08c09c40AeDE9f8503dB7a1A6",
        ];

        // Filter to only include users with active payment streams
        const activeUsers = await filterActiveUsers(manualUsers, paymentRouterAddress, paymentProcessor);

        if (activeUsers.length === 0) {
            console.log('⚠️  No active users found. No removal transactions needed!');
            return;
        }

        console.log(`🔨 Generating removal transactions for ${activeUsers.length} active users...\n`);

        // Generate removal transactions for active users only
        generateTransactionJson(workflowAdminMultisig, projectName, paymentProcessor, paymentRouterAddress, activeUsers);

        console.log("\n✅ Done!");
        console.log(`📄 Generated removal transactions for ${activeUsers.length} users with active streams`);

    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
main();