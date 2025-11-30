import fs from 'fs';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Payment Processor ABI - only the methods we need
// Note: viewAllPaymentOrders actually returns (token, streamId, amount, released, start, cliff, end)
const PAYMENT_PROCESSOR_ABI = [
    "function viewAllPaymentOrders(address client, address paymentReceiver) external view returns (tuple(address token, uint256 streamId, uint256 amount, uint256 released, uint256 start, uint256 cliff, uint256 end)[])",
    "function releasableForSpecificStream(address client, address paymentReceiver, uint256 streamId) external view returns (uint256)",
    "function releasedForSpecificStream(address client, address paymentReceiver, uint256 streamId) external view returns (uint256)",
    "function isActivePaymentReceiver(address client, address paymentReceiver) external view returns (bool)"
];

// Configuration
const RPC_URL = process.env.RPC_URL || "https://polygon-rpc.com"; // Polygon Mainnet RPC (fallback to public RPC if not set)

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
                    const shortDelay = Math.min(1000 * Math.pow(1.5, attempt), 10000); // 1s, 1.5s, 2.25s, 3.37s, 5s, 7.5s, 10s max
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

function readTransactionFileIfExists(filename) {
    try {
        if (!fs.existsSync(filename)) {
            console.log(`⚠️  File ${filename} does not exist, skipping...`);
            return null;
        }
        return readTransactionFile(filename);
    } catch (error) {
        console.error(`❌ Error reading file ${filename}:`, error.message);
        return null;
    }
}

function extractMetadataFromTransactionFile(transactionData) {
    try {
        const projectName = transactionData.projectName;
        const paymentRouterAddress = transactionData.queries ? transactionData.queries.addresses ? transactionData.queries.addresses.paymentRouter : null : null;
        const paymentProcessorAddress = transactionData.queries ? transactionData.queries.addresses ? transactionData.queries.addresses.paymentProcessor : null : null;

        if (!projectName || !paymentRouterAddress || !paymentProcessorAddress) {
            throw new Error('Missing required metadata in transaction file');
        }

        console.log(`📋 Extracted metadata:`);
        console.log(`   - Project Name: ${projectName}`);
        console.log(`   - Payment Router: ${paymentRouterAddress}`);
        console.log(`   - Payment Processor: ${paymentProcessorAddress}`);

        return {
            projectName,
            paymentRouterAddress,
            paymentProcessorAddress
        };
    } catch (error) {
        console.error(`❌ Error extracting metadata:`, error.message);
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
    console.log(`\n🔍 Fetching stream data for user: ${userAddress}`);

    // First, check if user is an active receiver - this is a quick check
    let isActive = false;
    try {
        isActive = await contract.isActivePaymentReceiver(client, userAddress);
        if (!isActive) {
            console.log(`   ℹ️  User ${userAddress} is not an active payment receiver - skipping`);
            return {
                address: userAddress,
                isActiveReceiver: false,
                streams: []
            };
        }
    } catch (activeCheckError) {
        console.log(`   ⚠️  Could not verify active status for ${userAddress}, will attempt to fetch data anyway`);
    }

    try {
        // Get all payment orders for this user with retry
        const paymentOrders = await executeWithRetry(
            async() => await contract.viewAllPaymentOrders(client, userAddress),
            `viewAllPaymentOrders for ${userAddress}`
        );

        if (paymentOrders.length === 0) {
            console.log(`   ⚠️  No payment orders found for ${userAddress}`);
            return {
                address: userAddress,
                isActiveReceiver: isActive,
                totalStreams: 0,
                streams: []
            };
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

                streams.push({
                    token: order.token,
                    streamId: streamId,
                    amount: order.amount.toString(),
                    released: order.released.toString(),
                    start: order.start.toString(),
                    cliff: order.cliff.toString(),
                    end: order.end.toString(),
                    releasable: releasable.toString()
                });

                console.log(`      ✅ Stream ${streamId}: Amount=${order.amount.toString()}, Start=${order.start.toString()}, Cliff=${order.cliff.toString()}, End=${order.end.toString()}, Released=${order.released.toString()}`);
            } catch (error) {
                console.error(`      ❌ Error fetching data for stream ${streamId}:`, error.message);
                // Continue with other streams even if one fails
                streams.push({
                    token: order.token,
                    streamId: streamId,
                    amount: order.amount.toString(),
                    released: order.released.toString(),
                    start: order.start.toString(),
                    cliff: order.cliff.toString(),
                    end: order.end.toString(),
                    releasable: "ERROR",
                    error: error.message
                });
            }
        }

        return {
            address: userAddress,
            isActiveReceiver: isActive,
            totalStreams: streams.length,
            streams: streams
        };

    } catch (error) {
        // Error fetching payment orders
        console.error(`   ❌ Error fetching payment orders for ${isActive ? 'ACTIVE' : ''} receiver ${userAddress}:`, error.message);
        return {
            address: userAddress,
            error: error.message,
            isActiveReceiver: isActive,
            streams: []
        };
    }
}

async function fetchAllUserStreamData(projectName, userAddresses, client, paymentProcessor) {
    console.log(`\n🚀 Starting to fetch stream data for ${userAddresses.length} users...`);
    console.log(`📍 Payment Processor: ${paymentProcessor}`);
    console.log(`📍 Client: ${client}\n`);

    // Setup provider and contract
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(paymentProcessor, PAYMENT_PROCESSOR_ABI, provider);

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
        console.log('📖 Reading transaction files dynamically...\n');

        // Define possible transaction files to read
        const transactionFiles = [
            { filename: "1.json", label: "File 1" },
            { filename: "2.json", label: "File 2" },
            { filename: "3.json", label: "File 3" },
            { filename: "4.json", label: "File 4" },
            { filename: "5.json", label: "File 5" },
        ];

        const filesData = [];
        const allUsersFromFiles = [];
        let lastValidFile = null;

        // Read all available transaction files
        for (const fileConfig of transactionFiles) {
            const data = readTransactionFileIfExists(fileConfig.filename);
            if (data) {
                filesData.push({...fileConfig, data });
                lastValidFile = data;

                // Extract users from this file
                const users = getUserAddressesFromTransactions(data.transactions.readable);
                allUsersFromFiles.push(...users);
                console.log(`   - ${fileConfig.label} (${fileConfig.filename}): ${users.length} users`);
            }
        }

        if (filesData.length === 0) {
            throw new Error('No transaction files found! Please ensure at least one transaction file exists.');
        }

        if (!lastValidFile) {
            throw new Error('No valid transaction file found to extract metadata from!');
        }

        // Extract metadata from the last available transaction file
        const lastFileName = filesData[filesData.length - 1].filename;
        console.log(`\n📋 Extracting metadata from last transaction file (${lastFileName})...\n`);
        const { projectName, paymentRouterAddress, paymentProcessorAddress } = extractMetadataFromTransactionFile(lastValidFile);

        // Get all unique users
        const allUsers = [...new Set(allUsersFromFiles)];

        console.log(`\n📊 Summary:`);
        console.log(`   - Total files read: ${filesData.length}`);
        console.log(`   - Total unique users found: ${allUsers.length}`);

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