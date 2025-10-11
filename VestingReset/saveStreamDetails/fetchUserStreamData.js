import fs from 'fs';
import { ethers } from 'ethers';

// Payment Processor ABI - only the methods we need
const PAYMENT_PROCESSOR_ABI = [
    "function viewAllPaymentOrders(address client, address paymentReceiver) external view returns (tuple(address token, uint256 streamId, uint256 amount, uint256 start, uint256 cliff, uint256 end)[])",
    "function releasableForSpecificStream(address client, address paymentReceiver, uint256 streamId) external view returns (uint256)",
    "function releasedForSpecificStream(address client, address paymentReceiver, uint256 streamId) external view returns (uint256)",
    "function isActivePaymentReceiver(address client, address paymentReceiver) external view returns (bool)"
];

// Configuration
const RPC_URL = "https://polygon-rpc.com"; // Polygon Mainnet RPC
const paymentProcessorAddress = "0xD6F574062E948d6B7F07c693f1b4240aFeA41657";
const paymentRouterAddress = "0x6B5d37c206D56B16F44b0C1b89002fd9B138e9Be"; // client address

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
        errorCode === 'RATE_LIMIT_EXCEEDED' ||
        errorCode === -32090 ||
        errorCode === 429
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

            if (isRateLimitError(error)) {
                circuitBreakerState.failureCount++;
                circuitBreakerState.lastFailureTime = Date.now();
                circuitBreakerState.isOpen = true;

                if (attempt < CIRCUIT_BREAKER_CONFIG.maxRetries) {
                    const delay = calculateBackoffDelay(attempt);
                    console.log(`   ⚠️  Rate limit detected (attempt ${attempt + 1}/${CIRCUIT_BREAKER_CONFIG.maxRetries + 1})`);
                    console.log(`   🔄 Retrying ${context} after ${(delay / 1000).toFixed(1)}s delay...`);
                    await sleep(delay);
                } else {
                    console.log(`   ❌ Max retries (${CIRCUIT_BREAKER_CONFIG.maxRetries}) reached for ${context}`);
                    throw error;
                }
            } else {
                // Non-rate-limit error, throw immediately
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

async function fetchStreamDataForUser(contract, client, userAddress) {
    try {
        console.log(`\n🔍 Fetching stream data for user: ${userAddress}`);

        // Get all payment orders for this user with retry
        const paymentOrders = await executeWithRetry(
            async() => await contract.viewAllPaymentOrders(client, userAddress),
            `viewAllPaymentOrders for ${userAddress}`
        );

        if (paymentOrders.length === 0) {
            console.log(`   ⚠️  No payment orders found for ${userAddress}`);
            return null;
        }

        console.log(`   📋 Found ${paymentOrders.length} payment order(s)`);

        const streams = [];

        // For each payment order, get the releasable and released amounts
        for (let i = 0; i < paymentOrders.length; i++) {
            const order = paymentOrders[i];
            const streamId = order.streamId.toString();

            console.log(`   📊 Processing stream ${i + 1}/${paymentOrders.length} (ID: ${streamId})`);

            try {
                const releasable = await executeWithRetry(
                    async() => await contract.releasableForSpecificStream(client, userAddress, order.streamId),
                    `releasableForSpecificStream for stream ${streamId}`
                );

                const released = await executeWithRetry(
                    async() => await contract.releasedForSpecificStream(client, userAddress, order.streamId),
                    `releasedForSpecificStream for stream ${streamId}`
                );

                streams.push({
                    token: order.token,
                    streamId: streamId,
                    amount: order.amount.toString(),
                    start: order.start.toString(),
                    cliff: order.cliff.toString(),
                    end: order.end.toString(),
                    releasable: releasable.toString(),
                    released: released.toString()
                });

                console.log(`      ✅ Stream ${streamId}: Amount=${order.amount.toString()}, Releasable=${releasable.toString()}, Released=${released.toString()}`);
            } catch (error) {
                console.error(`      ❌ Error fetching data for stream ${streamId}:`, error.message);
                // Continue with other streams even if one fails
                streams.push({
                    token: order.token,
                    streamId: streamId,
                    amount: order.amount.toString(),
                    start: order.start.toString(),
                    cliff: order.cliff.toString(),
                    end: order.end.toString(),
                    releasable: "ERROR",
                    released: "ERROR",
                    error: error.message
                });
            }
        }

        return {
            address: userAddress,
            totalStreams: streams.length,
            streams: streams
        };

    } catch (error) {
        // Check if user is an active receiver before showing error
        try {
            const isActive = await executeWithRetry(
                async() => await contract.isActivePaymentReceiver(client, userAddress),
                `isActivePaymentReceiver for ${userAddress}`
            );

            if (isActive) {
                console.error(`   ❌ Error fetching payment orders for ACTIVE receiver ${userAddress}:`, error.message);
                return {
                    address: userAddress,
                    error: error.message,
                    isActiveReceiver: true,
                    streams: []
                };
            } else {
                // User is not an active receiver, silently skip
                console.log(`   ℹ️  User ${userAddress} is not an active payment receiver - skipping`);
                return {
                    address: userAddress,
                    isActiveReceiver: false,
                    streams: []
                };
            }
        } catch (activeCheckError) {
            // If we can't check active status, log the original error
            console.error(`   ❌ Error fetching payment orders for ${userAddress}:`, error.message);
            return {
                address: userAddress,
                error: error.message,
                streams: []
            };
        }
    }
}

async function fetchAllUserStreamData(projectName, userAddresses, client, paymentProcessor) {
    console.log(`\n🚀 Starting to fetch stream data for ${userAddresses.length} users...`);
    console.log(`📍 Payment Processor: ${paymentProcessor}`);
    console.log(`📍 Client: ${client}\n`);

    // Setup provider and contract
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(paymentProcessorAddress, PAYMENT_PROCESSOR_ABI, provider);

    const allUserData = {};
    let successCount = 0;
    let errorCount = 0;

    // Process users one by one (to avoid rate limiting)
    for (let i = 0; i < userAddresses.length; i++) {
        const userAddress = userAddresses[i];
        console.log(`\n[${i + 1}/${userAddresses.length}] Processing user: ${userAddress}`);

        const userData = await fetchStreamDataForUser(contract, client, userAddress);

        if (userData) {
            allUserData[userAddress.toLowerCase()] = userData;
            if (userData.error) {
                errorCount++;
            } else {
                successCount++;
            }
        } else {
            allUserData[userAddress.toLowerCase()] = {
                address: userAddress,
                totalStreams: 0,
                streams: []
            };
        }

        // Add a small delay to avoid rate limiting (500ms between requests)
        if (i < userAddresses.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Save to JSON file
    const outputData = {
        projectName: projectName,
        client: client,
        paymentProcessor: paymentProcessor,
        totalUsers: userAddresses.length,
        successfulFetches: successCount,
        failedFetches: errorCount,
        timestamp: new Date().toISOString(),
        users: allUserData
    };

    // Create project folder structure
    const projectFolder = `./${projectName}`;
    const dataFolder = `${projectFolder}/streamData`;

    if (!fs.existsSync(projectFolder)) {
        fs.mkdirSync(projectFolder, { recursive: true });
        console.log(`\n📁 Created project folder: ${projectFolder}`);
    }

    if (!fs.existsSync(dataFolder)) {
        fs.mkdirSync(dataFolder, { recursive: true });
        console.log(`📁 Created streamData folder: ${dataFolder}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
    const filename = `stream_data_${projectName}_${timestamp}.json`;
    const filePath = `${dataFolder}/${filename}`;

    fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2));

    console.log(`\n✅ Stream data saved to: ${filePath}`);
    console.log(`📊 Summary: ${successCount} successful, ${errorCount} failed out of ${userAddresses.length} total users`);

    return outputData;
}

// Main execution
async function main() {
    try {
        const projectName = 'X23';

        console.log('📖 Reading transaction files...\n');

        // Read all transaction files
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

        // const teamsVestings = [
        //     "0x0D3edA53332b9fDf4d4e9FB4C1C940A80B16eD9D",
        //     "0x01b9F17e97dFb2e25581690e048d4fF8d0b788f3",
        //     "0xcE3848cDf3304CB71ef1615700EEe09E030559F9",
        //     "0x346e969567224490C54B8C8DB783b8D22ADFD5d5",
        //     "0x1a7ba55c069331a5079DF14CC8C2351589A0aCFA",
        // ];

        // Get all unique users
        const allUsers = [...new Set([...ea1Users, ...ea2Users, ...ea3Users, ...S2Users, ...qaccUsers])];

        console.log(`\n📊 Total unique users found: ${allUsers.length}`);
        console.log(`   - QACC users: ${qaccUsers.length}`);
        console.log(`   - EA1 users: ${ea1Users.length}`);
        console.log(`   - EA2 users: ${ea2Users.length}`);
        console.log(`   - EA3 users: ${ea3Users.length}`);
        console.log(`   - S2 users: ${S2Users.length}`);
        // console.log(`   - Team vestings: ${teamsVestings.length}`);

        // Fetch stream data for all users
        await fetchAllUserStreamData(
            projectName,
            allUsers,
            paymentRouterAddress,
            paymentProcessorAddress
        );

        console.log("\n🎉 Done!");

    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
main();