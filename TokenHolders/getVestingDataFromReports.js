const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
require('dotenv').config();

// Payment Processor ABI - only the methods we need
const PAYMENT_PROCESSOR_ABI = [
    "function viewAllPaymentOrders(address client, address paymentReceiver) external view returns (tuple(address token, uint256 streamId, uint256 amount, uint256 released, uint256 start, uint256 cliff, uint256 end)[])",
    "function releasableForSpecificStream(address client, address paymentReceiver, uint256 streamId) external view returns (uint256)",
    "function releasedForSpecificStream(address client, address paymentReceiver, uint256 streamId) external view returns (uint256)",
    "function isActivePaymentReceiver(address client, address paymentReceiver) external view returns (bool)"
];

// Configuration from environment or defaults
const CONFIG = {
    RPC_URL: process.env.RPC_URL || "https://polygon-rpc.com",
    PAYMENT_PROCESSOR_ADDRESS: process.env.PAYMENT_PROCESSOR_ADDRESS || "0xFfBCbfeBD4eee9b546097dE19b966CA0fd01D66E", // for prismo technology
    PAYMENT_ROUTER_ADDRESS: process.env.PAYMENT_ROUTER_ADDRESS || "0x96b6aA42777D0fDDE8F8e45f35129D1D11CdA981", // for prismo technology
    OUTPUT_DIR: process.env.OUTPUT_DIR || "./vestingData",
    // Circuit Breaker Configuration
    MAX_RETRIES: 5,
    INITIAL_DELAY_MS: 2000,
    MAX_DELAY_MS: 600000, // 10 minutes
    BACKOFF_MULTIPLIER: 2,
    RATE_LIMIT_DELAY: 60000, // 1 minute
    REQUEST_DELAY: 500 // Delay between requests
};

// Circuit Breaker State
let circuitBreakerState = {
    failureCount: 0,
    lastFailureTime: null,
    isOpen: false,
};

/**
 * Check if error is a rate limit error
 */
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

/**
 * Sleep function
 */
function sleep(ms) {
    console.log(`   ⏸️  Sleeping for ${(ms / 1000).toFixed(1)} seconds...`);
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateBackoffDelay(retryCount) {
    const delay = Math.min(
        CONFIG.INITIAL_DELAY_MS * Math.pow(CONFIG.BACKOFF_MULTIPLIER, retryCount),
        CONFIG.MAX_DELAY_MS
    );
    return delay;
}

/**
 * Execute with retry and circuit breaker
 */
async function executeWithRetry(fn, context = '') {
    let lastError;

    for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            // If circuit breaker is open, wait before attempting
            if (circuitBreakerState.isOpen) {
                const timeSinceLastFailure = Date.now() - circuitBreakerState.lastFailureTime;
                if (timeSinceLastFailure < CONFIG.RATE_LIMIT_DELAY) {
                    const waitTime = CONFIG.RATE_LIMIT_DELAY - timeSinceLastFailure;
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

            if (attempt < CONFIG.MAX_RETRIES) {
                if (isRateLimitError(error)) {
                    // Rate limit error - use longer delays and open circuit breaker
                    circuitBreakerState.failureCount++;
                    circuitBreakerState.lastFailureTime = Date.now();
                    circuitBreakerState.isOpen = true;

                    const delay = calculateBackoffDelay(attempt);
                    console.log(`   ⚠️  Rate limit detected (attempt ${attempt + 1}/${CONFIG.MAX_RETRIES + 1})`);
                    console.log(`   🔄 Retrying ${context} after ${(delay / 1000).toFixed(1)}s delay...`);
                    await sleep(delay);
                } else {
                    // Other errors - use shorter delay and retry
                    const shortDelay = Math.min(1000 * Math.pow(1.5, attempt), 10000);
                    console.log(`   ⚠️  Request failed (attempt ${attempt + 1}/${CONFIG.MAX_RETRIES + 1}): ${error.message.substring(0, 100)}...`);
                    console.log(`   🔄 Retrying ${context} after ${(shortDelay / 1000).toFixed(1)}s delay...`);
                    await sleep(shortDelay);
                }
            } else {
                console.log(`   ❌ Max retries (${CONFIG.MAX_RETRIES}) reached for ${context}`);
                throw error;
            }
        }
    }

    throw lastError;
}

/**
 * Read report file and extract participant addresses
 */
function readReportFile(filename) {
    try {
        const data = fs.readFileSync(filename, 'utf8');
        const reportData = JSON.parse(data);
        console.log(`✅ Successfully read report file: ${filename}`);

        if (reportData.batch && reportData.batch.data && reportData.batch.data.participants) {
            const addresses = Object.keys(reportData.batch.data.participants);
            console.log(`📊 Found ${addresses.length} participants`);
            return {
                projectName: reportData.projectName || 'Unknown',
                addresses,
                participants: reportData.batch.data.participants
            };
        } else {
            console.error(`❌ Invalid report structure in ${filename}`);
            return null;
        }
    } catch (error) {
        console.error(`❌ Error reading file ${filename}:`, error.message);
        return null;
    }
}

/**
 * Read multiple report files
 */
function readMultipleReports(filenames) {
    const allAddresses = new Set();
    let projectName = 'Unknown';
    const reportsSummary = [];

    for (const filename of filenames) {
        const reportData = readReportFile(filename);
        if (reportData) {
            projectName = reportData.projectName;
            reportData.addresses.forEach(addr => allAddresses.add(addr.toLowerCase()));
            reportsSummary.push({
                filename,
                projectName: reportData.projectName,
                participantCount: reportData.addresses.length
            });
        }
    }

    return {
        projectName,
        addresses: Array.from(allAddresses),
        reportsSummary
    };
}

/**
 * Fetch vesting data for a single user
 */
async function fetchVestingDataForUser(contract, client, userAddress) {
    console.log(`\n🔍 Fetching vesting data for user: ${userAddress}`);

    // First, check if user is an active receiver
    let isActive = false;
    try {
        isActive = await contract.isActivePaymentReceiver(client, userAddress);
        if (!isActive) {
            console.log(`   ℹ️  User ${userAddress} is not an active payment receiver - skipping`);
            return {
                address: userAddress,
                isActiveReceiver: false,
                vestingStreams: []
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
                vestingStreams: []
            };
        }

        console.log(`   📋 Found ${paymentOrders.length} vesting stream(s)`);

        const vestingStreams = [];
        let totalLocked = BigInt(0);
        let totalClaimed = BigInt(0);
        let totalClaimable = BigInt(0);

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

                const amount = BigInt(order.amount.toString());
                const released = BigInt(order.released.toString());
                const releasableAmount = BigInt(releasable.toString());

                // Calculate locked amount (total - released)
                const locked = amount - released;

                totalLocked += locked;
                totalClaimed += released;
                totalClaimable += releasableAmount;

                const streamData = {
                    streamId: streamId,
                    token: order.token,
                    // Raw values (in wei)
                    totalAmount: order.amount.toString(),
                    claimed: order.released.toString(),
                    locked: locked.toString(),
                    claimable: releasable.toString(),
                    // Formatted values (in tokens, assuming 18 decimals)
                    totalAmountFormatted: ethers.formatUnits(order.amount, 18),
                    claimedFormatted: ethers.formatUnits(order.released, 18),
                    lockedFormatted: ethers.formatUnits(locked, 18),
                    claimableFormatted: ethers.formatUnits(releasable, 18),
                    // Timestamps
                    start: order.start.toString(),
                    cliff: order.cliff.toString(),
                    end: order.end.toString(),
                    startDate: new Date(Number(order.start) * 1000).toISOString(),
                    cliffDate: new Date(Number(order.cliff) * 1000).toISOString(),
                    endDate: new Date(Number(order.end) * 1000).toISOString()
                };

                vestingStreams.push(streamData);

                console.log(`      ✅ Stream ${streamId}:`);
                console.log(`         Total: ${streamData.totalAmountFormatted} tokens`);
                console.log(`         Claimed: ${streamData.claimedFormatted} tokens`);
                console.log(`         Locked: ${streamData.lockedFormatted} tokens`);
                console.log(`         Claimable: ${streamData.claimableFormatted} tokens`);
            } catch (error) {
                console.error(`      ❌ Error fetching data for stream ${streamId}:`, error.message);
                // Continue with other streams even if one fails
                vestingStreams.push({
                    streamId: streamId,
                    token: order.token,
                    totalAmount: order.amount.toString(),
                    claimed: order.released.toString(),
                    error: error.message
                });
            }
        }

        return {
            address: userAddress,
            isActiveReceiver: isActive,
            totalStreams: vestingStreams.length,
            // Aggregated totals
            summary: {
                totalLocked: totalLocked.toString(),
                totalClaimed: totalClaimed.toString(),
                totalClaimable: totalClaimable.toString(),
                totalLockedFormatted: ethers.formatUnits(totalLocked, 18),
                totalClaimedFormatted: ethers.formatUnits(totalClaimed, 18),
                totalClaimableFormatted: ethers.formatUnits(totalClaimable, 18)
            },
            vestingStreams: vestingStreams
        };

    } catch (error) {
        console.error(`   ❌ Error fetching payment orders for ${userAddress}:`, error.message);
        return {
            address: userAddress,
            error: error.message,
            isActiveReceiver: isActive,
            vestingStreams: []
        };
    }
}

/**
 * Fetch vesting data for all users
 */
async function fetchAllVestingData(projectName, userAddresses) {
    console.log(`\n🚀 Starting to fetch vesting data for ${userAddresses.length} users...`);
    console.log(`📍 Payment Processor: ${CONFIG.PAYMENT_PROCESSOR_ADDRESS}`);
    console.log(`📍 Client: ${CONFIG.PAYMENT_ROUTER_ADDRESS}\n`);

    // Setup provider and contract
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const contract = new ethers.Contract(
        CONFIG.PAYMENT_PROCESSOR_ADDRESS,
        PAYMENT_PROCESSOR_ABI,
        provider
    );

    const allUserData = {};
    let successCount = 0;
    let errorCount = 0;
    let activeCount = 0;
    let inactiveCount = 0;

    // Process users one by one (to avoid rate limiting)
    for (let i = 0; i < userAddresses.length; i++) {
        const userAddress = userAddresses[i];
        console.log(`\n[${ i + 1}/${userAddresses.length}] Processing user: ${userAddress}`);

        const userData = await fetchVestingDataForUser(contract, CONFIG.PAYMENT_ROUTER_ADDRESS, userAddress);

        if (userData) {
            allUserData[userAddress.toLowerCase()] = userData;

            if (userData.error) {
                errorCount++;
            } else {
                successCount++;
                if (userData.isActiveReceiver) {
                    activeCount++;
                } else {
                    inactiveCount++;
                }
            }
        }

        // Add a delay to avoid rate limiting
        if (i < userAddresses.length - 1) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
        }
    }

    // Calculate global statistics
    const statistics = {
        totalUsers: userAddresses.length,
        successfulFetches: successCount,
        failedFetches: errorCount,
        activeReceivers: activeCount,
        inactiveReceivers: inactiveCount,
        usersWithVesting: Object.values(allUserData).filter(u => u.totalStreams > 0).length
    };

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log(`   🟢 Active receivers: ${activeCount}`);
    console.log(`   ⭕ Inactive receivers: ${inactiveCount}`);
    console.log(`   💰 Users with vesting: ${statistics.usersWithVesting}`);

    return {
        projectName,
        configuration: {
            paymentProcessor: CONFIG.PAYMENT_PROCESSOR_ADDRESS,
            paymentRouter: CONFIG.PAYMENT_ROUTER_ADDRESS,
            rpcUrl: CONFIG.RPC_URL
        },
        statistics,
        timestamp: new Date().toISOString(),
        users: allUserData
    };
}

/**
 * Save results to file
 */
function saveResults(data, projectName) {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
        console.log(`\n📁 Created output folder: ${CONFIG.OUTPUT_DIR}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `vesting_data_${projectName}_${timestamp}.json`;
    const filePath = path.join(CONFIG.OUTPUT_DIR, filename);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Vesting data saved to: ${filePath}`);

    // Also save a CSV summary
    const csvFilename = `vesting_summary_${projectName}_${timestamp}.csv`;
    const csvFilePath = path.join(CONFIG.OUTPUT_DIR, csvFilename);

    const csvHeader = "Address,Is Active,Total Streams,Total Locked,Total Claimed,Total Claimable\n";
    const csvRows = Object.values(data.users).map(user => {
        if (user.error) {
            return `"${user.address}",Error,0,0,0,0`;
        }
        const summary = user.summary || { totalLockedFormatted: '0', totalClaimedFormatted: '0', totalClaimableFormatted: '0' };
        return `"${user.address}",${user.isActiveReceiver ? 'Yes' : 'No'},${user.totalStreams || 0},${summary.totalLockedFormatted},${summary.totalClaimedFormatted},${summary.totalClaimableFormatted}`;
    }).join("\n");

    fs.writeFileSync(csvFilePath, csvHeader + csvRows);
    console.log(`💾 CSV summary saved to: ${csvFilePath}`);

    return { jsonPath: filePath, csvPath: csvFilePath };
}

/**
 * Main function
 */
async function main() {
    try {
        console.log('\n🎯 Token Holders Vesting Data Fetcher\n');
        console.log('='.repeat(60));

        // ============================================
        // CONFIGURATION - UPDATE THESE PATHS
        // ============================================
        const reportFiles = [
            './report/PRISMO_TECHNOLOGY/4.json',
            './report/PRISMO_TECHNOLOGY/5.json'
        ];

        // Check if files are specified
        if (reportFiles.length === 0) {
            console.error('\n❌ No report files specified!');
            console.log('\n💡 Edit the script and add report file paths to the reportFiles array:');
            console.log('   const reportFiles = [');
            console.log('       "../VestingReset/PushPaymentFromReports/reports/YourProject/1.json",');
            console.log('       "../VestingReset/PushPaymentFromReports/reports/YourProject/2.json"');
            console.log('   ];');
            process.exit(1);
        }

        // Read all report files and extract addresses
        const { projectName, addresses, reportsSummary } = readMultipleReports(reportFiles);

        console.log('\n📋 Reports Summary:');
        reportsSummary.forEach(report => {
            console.log(`   - ${report.filename}: ${report.participantCount} participants`);
        });
        console.log(`\n📊 Total unique addresses: ${addresses.length}`);
        console.log('='.repeat(60));

        // Fetch vesting data for all addresses
        const vestingData = await fetchAllVestingData(projectName, addresses);

        // Save results
        const files = saveResults(vestingData, projectName);

        console.log('\n='.repeat(60));
        console.log('✅ Process completed successfully!');
        console.log(`📄 JSON: ${files.jsonPath}`);
        console.log(`📄 CSV: ${files.csvPath}`);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = {
    readReportFile,
    readMultipleReports,
    fetchVestingDataForUser,
    fetchAllVestingData,
    CONFIG
};