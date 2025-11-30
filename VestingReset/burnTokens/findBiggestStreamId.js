import fs from 'fs';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Payment Processor ABI - only the methods we need
const PAYMENT_PROCESSOR_ABI = [
    "function viewAllPaymentOrders(address client, address paymentReceiver) external view returns (tuple(address token, uint256 streamId, uint256 amount, uint256 released, uint256 start, uint256 cliff, uint256 end)[])",
    "function isActivePaymentReceiver(address client, address paymentReceiver) external view returns (bool)"
];

// Configuration for blockchain interaction
const RPC_URL = process.env.RPC_URL || "https://polygon-rpc.com";

// Circuit Breaker Configuration
const CIRCUIT_BREAKER_CONFIG = {
    maxRetries: 5,
    initialDelayMs: 2000,
    maxDelayMs: 600000,
    backoffMultiplier: 2,
    rateLimitDelay: 60000,
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
        errorCode === 'BAD_DATA'
    );
}

// Sleep function
function sleep(ms) {
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
            if (circuitBreakerState.isOpen) {
                const timeSinceLastFailure = Date.now() - circuitBreakerState.lastFailureTime;
                if (timeSinceLastFailure < CIRCUIT_BREAKER_CONFIG.rateLimitDelay) {
                    const waitTime = CIRCUIT_BREAKER_CONFIG.rateLimitDelay - timeSinceLastFailure;
                    await sleep(waitTime);
                } else {
                    circuitBreakerState.isOpen = false;
                }
            }

            const result = await fn();

            if (circuitBreakerState.failureCount > 0) {
                circuitBreakerState.failureCount = 0;
            }
            circuitBreakerState.isOpen = false;

            return result;

        } catch (error) {
            lastError = error;

            if (attempt < CIRCUIT_BREAKER_CONFIG.maxRetries) {
                if (isRateLimitError(error)) {
                    circuitBreakerState.failureCount++;
                    circuitBreakerState.lastFailureTime = Date.now();
                    circuitBreakerState.isOpen = true;

                    const delay = calculateBackoffDelay(attempt);
                    await sleep(delay);
                } else {
                    const shortDelay = Math.min(1000 * Math.pow(1.5, attempt), 10000);
                    await sleep(shortDelay);
                }
            } else {
                throw error;
            }
        }
    }

    throw lastError;
}

/**
 * Read transaction file and extract user addresses
 */
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

/**
 * Read project configuration from report file
 */
function readProjectConfigFromReport(reportFile) {
    try {
        const data = fs.readFileSync(reportFile, 'utf8');
        const reportData = JSON.parse(data);

        // Extract project configuration from report file
        const projectName = reportData.projectName;
        const paymentRouter = reportData.queries ? reportData.queries.addresses ? reportData.queries.addresses.paymentRouter : null : null;
        const orchestrator = reportData.queries ? reportData.queries.addresses ? reportData.queries.addresses.orchestrator : null : null;
        const safe = reportData.inputs ? reportData.inputs.projectConfig ? reportData.inputs.projectConfig.SAFE : null : null;
        const paymentProcessor = reportData.queries ? reportData.queries.addresses ? reportData.queries.addresses.paymentProcessor : null : null;

        console.log(`✅ Successfully loaded project configuration from: ${reportFile}`);
        console.log(`📍 Project Name: ${projectName}`);
        console.log(`📍 Payment Router: ${paymentRouter}`);
        console.log(`📍 Orchestrator: ${orchestrator}`);
        console.log(`📍 Safe: ${safe}`);
        console.log(`📍 Payment Processor: ${paymentProcessor}`);

        // Validate required fields
        if (!projectName) {
            throw new Error('Project name not found in report file');
        }
        if (!paymentRouter) {
            throw new Error('Payment router address not found in report file');
        }
        if (!paymentProcessor) {
            throw new Error('Payment processor address not found in report file');
        }

        return {
            projectName,
            paymentRouter,
            orchestrator,
            safe,
            paymentProcessor
        };
    } catch (error) {
        console.error(`❌ Error reading project config from ${reportFile}:`, error.message);
        throw error;
    }
}

/**
 * Extract user addresses from transaction data
 */
function getUserAddressesFromTransactions(transactions) {
    const userAddresses = [];
    for (const transaction of transactions) {
        for (const tx of transaction) {
            if (tx.functionSignature === "pushPayment(address,address,uint256,uint256,uint256,uint256)") {
                const userAddress = tx.inputValues[0];
                userAddresses.push(userAddress);
            }
        }
    }
    return userAddresses;
}

/**
 * Fetch stream IDs for a single user
 */
async function getStreamIdsForUser(contract, client, userAddress) {
    try {
        // Check if user is active
        const isActive = await executeWithRetry(
            async() => await contract.isActivePaymentReceiver(client, userAddress),
            `isActivePaymentReceiver for ${userAddress}`
        );

        if (!isActive) {
            return [];
        }

        // Get all payment orders
        const paymentOrders = await executeWithRetry(
            async() => await contract.viewAllPaymentOrders(client, userAddress),
            `viewAllPaymentOrders for ${userAddress}`
        );

        // Extract stream IDs
        return paymentOrders.map(order => BigInt(order.streamId.toString()));

    } catch (error) {
        console.error(`   ⚠️  Error fetching streams for ${userAddress}:`, error.message);
        return [];
    }
}

/**
 * Find the biggest stream ID across all users
 */
async function findBiggestStreamId() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 Find Biggest Stream ID');
    console.log('═══════════════════════════════════════════════════════\n');

    // Step 1: Read project configuration from report file
    const reportFile = '5.json'; // Primary report file to extract project config from

    console.log('📖 Reading project configuration from report file...\n');
    const projectConfig = readProjectConfigFromReport(reportFile);

    const projectName = projectConfig.projectName;
    const paymentProcessorAddress = projectConfig.paymentProcessor;
    const paymentRouterAddress = projectConfig.paymentRouter;

    console.log('\n📖 Reading transaction files...\n');

    // Read all transaction files
    const file1 = readTransactionFile("1.json");
    const file2 = readTransactionFile("2.json");
    const file3 = readTransactionFile("3.json");
    const file4 = readTransactionFile("4.json");
    const file5 = readTransactionFile("5.json");

    // Extract user addresses
    const ea1Users = getUserAddressesFromTransactions(file1.transactions.readable);
    const ea2Users = getUserAddressesFromTransactions(file2.transactions.readable);
    const ea3Users = getUserAddressesFromTransactions(file3.transactions.readable);
    const qaccUsers = getUserAddressesFromTransactions(file4.transactions.readable);
    const s2Users = getUserAddressesFromTransactions(file5.transactions.readable);

    // Union all EA users and remove duplicates
    const allEAUsers = [...new Set([...ea1Users, ...ea2Users, ...ea3Users])];
    const allUsers = [...new Set([...allEAUsers, ...qaccUsers, ...s2Users])];

    console.log(`\n📊 User Statistics:`);
    console.log(`   Total EA users: ${allEAUsers.length}`);
    console.log(`   QACC S1 users: ${qaccUsers.length}`);
    console.log(`   S2 users: ${s2Users.length}`);
    console.log(`   Total users: ${allUsers.length}`);

    // Step 2: Setup blockchain connection
    console.log(`\n🔗 Connecting to blockchain...`);
    console.log(`   RPC URL: ${RPC_URL.substring(0, 50)}...`);

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(paymentProcessorAddress, PAYMENT_PROCESSOR_ABI, provider);

    console.log('   ✅ Connected successfully\n');

    // Step 3: Fetch stream IDs for all users
    console.log(`🔍 Fetching stream IDs for ${allUsers.length} users...\n`);

    let maxStreamId = BigInt(0);
    let maxStreamIdUser = null;
    let allStreamIds = [];
    let activeUsersCount = 0;
    let processedCount = 0;

    for (let i = 0; i < allUsers.length; i++) {
        const userAddress = allUsers[i];
        processedCount++;

        // Show progress every 10 users
        if (processedCount % 10 === 0 || processedCount === 1) {
            console.log(`   [${processedCount}/${allUsers.length}] Processing...`);
        }

        const streamIds = await getStreamIdsForUser(contract, paymentRouterAddress, userAddress);

        if (streamIds.length > 0) {
            activeUsersCount++;
            allStreamIds.push(...streamIds);

            // Find max stream ID for this user
            const userMaxStreamId = streamIds.reduce((max, id) => id > max ? id : max, BigInt(0));

            // Update global max if needed
            if (userMaxStreamId > maxStreamId) {
                maxStreamId = userMaxStreamId;
                maxStreamIdUser = userAddress;
            }
        }

        // Add delay to avoid rate limiting
        if (i < allUsers.length - 1) {
            await sleep(300);
        }
    }

    // Step 4: Display results
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`✅ Total users checked: ${allUsers.length}`);
    console.log(`✅ Active users (with streams): ${activeUsersCount}`);
    console.log(`✅ Inactive users (no streams): ${allUsers.length - activeUsersCount}`);
    console.log(`✅ Total stream IDs found: ${allStreamIds.length}\n`);

    if (maxStreamId > BigInt(0)) {
        console.log('🎯 BIGGEST STREAM ID:');
        console.log(`   Stream ID: ${maxStreamId.toString()}`);
        console.log(`   User Address: ${maxStreamIdUser}`);

        // Show some statistics about stream IDs
        const uniqueStreamIds = [...new Set(allStreamIds.map(id => id.toString()))];
        console.log(`\n📈 Stream ID Statistics:`);
        console.log(`   Unique stream IDs: ${uniqueStreamIds.length}`);
        console.log(`   Total stream instances: ${allStreamIds.length}`);

        // Show top 10 biggest stream IDs
        const sortedUniqueIds = uniqueStreamIds.map(id => BigInt(id)).sort((a, b) => {
            if (a > b) return -1;
            if (a < b) return 1;
            return 0;
        });

        console.log(`\n🔝 Top 10 Biggest Stream IDs:`);
        for (let i = 0; i < Math.min(10, sortedUniqueIds.length); i++) {
            console.log(`   ${i + 1}. ${sortedUniqueIds[i].toString()}`);
        }
    } else {
        console.log('⚠️  No active streams found for any users');
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Done!');
    console.log('═══════════════════════════════════════════════════════\n');
}

// Main execution
async function main() {
    try {
        await findBiggestStreamId();
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
main();