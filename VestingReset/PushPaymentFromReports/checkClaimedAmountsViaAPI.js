import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    transactionFileName: "5.json",
    polygonScanApiKey: process.env.POLYGONSCAN_API_KEY || "YourApiKeyToken", // Get free key at etherscan.io
    apiUrl: "https://api.etherscan.io/v2/api", // V2 API endpoint
    chainId: "137", // Polygon chain ID
    requestDelay: 250 // 250ms between requests (4 requests/sec for free tier)
};

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Reads the transaction file to extract user addresses and expected amounts
 */
function readTransactionFile(filename) {
    try {
        const data = fs.readFileSync(filename, 'utf8');
        const transactionData = JSON.parse(data);
        console.log(`✅ Successfully read transaction file: ${filename}`);
        return transactionData;
    } catch (error) {
        console.error(`❌ Error reading file ${filename}:`, error.message);
        throw error;
    }
}

/**
 * Extracts user data from transactions
 */
function getUserDataFromTransactions(transactions) {
    const userData = [];
    for (const transaction of transactions) {
        for (const tx of transaction) {
            if (tx.functionSignature === "pushPayment(address,address,uint256,uint256,uint256,uint256)") {
                userData.push({
                    address: tx.inputValues[0],
                    amount: tx.inputValues[2],
                });
            }
        }
    }
    return userData;
}

/**
 * Fetch transactions TO the Payment Processor from PolygonScan API
 */
async function fetchPaymentProcessorTransactions(paymentRouterAddress, startBlock = 0) {
    const url = new URL(CONFIG.apiUrl);
    url.searchParams.append('chainid', CONFIG.chainId); // Polygon chain ID
    url.searchParams.append('module', 'account');
    url.searchParams.append('action', 'txlist');
    url.searchParams.append('address', paymentRouterAddress);
    url.searchParams.append('startblock', startBlock);
    url.searchParams.append('endblock', 'latest');
    url.searchParams.append('sort', 'asc');
    url.searchParams.append('apikey', CONFIG.polygonScanApiKey);

    try {
        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.status === '0' && data.message === 'No transactions found') {
            return [];
        }

        if (data.status !== '1') {
            throw new Error(`PolygonScan API error: ${data.message || data.result}`);
        }

        return data.result || [];
    } catch (error) {
        console.error('❌ Error fetching transactions:', error.message);
        throw error;
    }
}

/**
 * Fetch transaction receipt/logs for a specific transaction
 */
async function fetchTransactionLogs(txHash) {
    const url = new URL(CONFIG.apiUrl);
    url.searchParams.append('chainid', CONFIG.chainId); // Polygon chain ID
    url.searchParams.append('module', 'proxy');
    url.searchParams.append('action', 'eth_getTransactionReceipt');
    url.searchParams.append('txhash', txHash);
    url.searchParams.append('apikey', CONFIG.polygonScanApiKey);

    try {
        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.error) {
            throw new Error(`API error: ${data.error.message || data.error}`);
        }

        return data.result || null;
    } catch (error) {
        console.error('❌ Error fetching transaction logs:', error.message);
        throw error;
    }
}

/**
 * Check claimed amounts by looking at Payment Router transactions and their logs
 */
async function checkClaimedAmountsViaAPI(paymentRouterAddress, tokenAddress, users) {
    console.log('\n🔍 Checking claimed amounts via PolygonScan API...');
    console.log(`   Payment Router: ${paymentRouterAddress}`);
    console.log(`   Token: ${tokenAddress}\n`);

    // ERC20 Transfer event signature
    const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

    // Create a map of user addresses for quick lookup
    const userMap = new Map();
    users.forEach(user => {
        userMap.set(user.address.toLowerCase(), {
            address: user.address,
            expectedAmount: user.amount,
            claimedAmount: BigInt(0),
            transactions: []
        });
    });

    console.log('📊 Fetching all Payment Router transactions...\n');

    // Fetch ALL transactions TO the payment router (much more efficient!)
    const allTransactions = await fetchPaymentProcessorTransactions(paymentRouterAddress, 0);

    console.log(`   Found ${allTransactions.length} total transactions to Payment Router`);

    // Filter for successful transactions FROM our users
    const userClaimTxs = allTransactions.filter(tx =>
        tx.from && userMap.has(tx.from.toLowerCase()) &&
        tx.isError === '0' // Only successful transactions
    );

    console.log(`   Found ${userClaimTxs.length} claim transactions from our users\n`);

    if (userClaimTxs.length === 0) {
        console.log('⚠️  No claim transactions found from users in your list\n');
        return [];
    }

    console.log('🔎 Analyzing transaction logs...\n');

    // For each claim transaction, fetch the logs to see Transfer events
    let processedTxs = 0;
    for (const tx of userClaimTxs) {
        processedTxs++;
        console.log(`   [${processedTxs}/${userClaimTxs.length}] Analyzing tx ${tx.hash}...`);

        try {
            // Small delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 250));


            const receipt = await fetchTransactionLogs(tx.hash);

            if (!receipt || !receipt.logs) {
                console.log(`      ⚠️  No logs found\n`);
                continue;
            }

            // Look for Transfer events in the logs
            let foundClaim = false;
            for (const log of receipt.logs) {
                // Check if this is a Transfer event from our token
                if (log.topics[0] === TRANSFER_EVENT_SIGNATURE &&
                    log.address.toLowerCase() === tokenAddress.toLowerCase()) {

                    const from = '0x' + log.topics[1].slice(26); // Remove padding
                    const to = '0x' + log.topics[2].slice(26); // Remove padding
                    const value = BigInt(log.data);

                    // Check if this is a transfer TO the transaction sender
                    // (tokens may come from payment router or a vault contract)
                    if (to.toLowerCase() === tx.from.toLowerCase() && value > BigInt(0)) {

                        const userData = userMap.get(tx.from.toLowerCase());
                        if (userData) {
                            userData.claimedAmount += value;
                            userData.transactions.push({
                                hash: tx.hash,
                                blockNumber: tx.blockNumber,
                                timeStamp: tx.timeStamp,
                                value: value.toString()
                            });

                            foundClaim = true;
                            console.log(`      ✓ User ${tx.from} claimed ${ethers.formatEther(value)} tokens (from ${from})`);
                            console.log(`        Block: ${tx.blockNumber}, Time: ${new Date(Number(tx.timeStamp) * 1000).toISOString()}\n`);
                        }
                    }
                }
            }

            if (!foundClaim) {
                console.log(`      No token transfers found\n`);
            }

        } catch (error) {
            console.error(`      ❌ Error: ${error.message}\n`);
        }
    }

    console.log('='.repeat(80));

    // Build result array
    const usersWithClaims = [];
    for (const userData of userMap.values()) {
        if (userData.claimedAmount > BigInt(0)) {
            usersWithClaims.push({
                address: userData.address,
                amountToDeduct: userData.claimedAmount.toString(),
                expectedAmount: userData.expectedAmount,
                claimedAmount: userData.claimedAmount.toString(),
                claimCount: userData.transactions.length,
                transactions: userData.transactions
            });
        }
    }

    return usersWithClaims;
}

/**
 * Main function
 */
async function main() {
    console.log('='.repeat(80));
    console.log('Check Claimed Amounts via PolygonScan API');
    console.log('='.repeat(80));

    // Check API key
    if (CONFIG.polygonScanApiKey === "YourApiKeyToken") {
        console.log('\n⚠️  WARNING: Using default API key');
        console.log('   Get your free API key at: https://polygonscan.com/apis');
        console.log('   Set it as environment variable: export POLYGONSCAN_API_KEY=your_key');
        console.log('   Or edit the script to add your key\n');
    }

    // Read transaction file
    console.log(`\n📄 Reading transaction file: ${CONFIG.transactionFileName}`);
    const filesData = readTransactionFile(CONFIG.transactionFileName);

    // Extract configuration
    let projectName = filesData.projectName ? filesData.projectName.replace(/_S2$/i, '').replace(/_+$/, '') : '';
    const paymentRouterAddress = filesData.queries.addresses.paymentRouter;
    const tokenAddress = filesData.queries.addresses.issuanceToken;

    console.log('\n✅ Project Configuration:');
    console.log(`   Project Name: ${projectName}`);
    console.log(`   Payment Router: ${paymentRouterAddress}`);
    console.log(`   Token Address: ${tokenAddress}`);

    // Extract user data
    const userData = getUserDataFromTransactions(filesData.transactions.readable);
    console.log(`   Users Found: ${userData.length}`);

    // Check claimed amounts via API
    const usersWithClaims = await checkClaimedAmountsViaAPI(
        paymentRouterAddress,
        tokenAddress,
        userData
    );

    // Generate summary
    console.log('\n' + '='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Users: ${userData.length}`);
    console.log(`Users with Claims: ${usersWithClaims.length}`);
    console.log(`Users without Claims: ${userData.length - usersWithClaims.length}`);

    if (usersWithClaims.length > 0) {
        const totalClaimed = usersWithClaims.reduce((sum, user) => sum + BigInt(user.claimedAmount), BigInt(0));
        const totalClaims = usersWithClaims.reduce((sum, user) => sum + user.claimCount, 0);
        console.log(`Total Claimed Amount: ${ethers.formatEther(totalClaimed)} tokens`);
        console.log(`Total Claim Transactions: ${totalClaims}`);

        console.log('\n📊 Users with claims:');
        usersWithClaims.forEach((user, index) => {
            console.log(`   ${index + 1}. ${user.address}`);
            console.log(`      Claimed: ${ethers.formatEther(user.claimedAmount)} tokens (${user.claimCount} transaction${user.claimCount > 1 ? 's' : ''})`);
        });

        // Save the addressToFilter array to a file
        const projectFolder = `./${projectName}`;
        if (!fs.existsSync(projectFolder)) {
            fs.mkdirSync(projectFolder, { recursive: true });
        }

        const outputFile = `${projectFolder}/addressToFilter.json`;
        const detailedOutputFile = `${projectFolder}/addressToFilter_detailed.json`;

        // Save simplified version for the transaction generator
        const simplifiedData = usersWithClaims.map(user => ({
            address: user.address,
            amountToDeduct: user.amountToDeduct
        }));
        fs.writeFileSync(outputFile, JSON.stringify(simplifiedData, null, 2));

        // Save detailed version with transaction hashes for reference
        fs.writeFileSync(detailedOutputFile, JSON.stringify(usersWithClaims, null, 2));

        console.log(`\n✅ Address filter data saved to: ${outputFile}`);
        console.log(`✅ Detailed data (with tx hashes) saved to: ${detailedOutputFile}`);

        // Show how to use it
        console.log('\n' + '='.repeat(80));
        console.log('📝 HOW TO USE THIS DATA');
        console.log('='.repeat(80));
        console.log('\nOption 1: Update pushPaymentTransactionGenerator.js');
        console.log('Replace line 245 with:');
        console.log(`\nconst addressToFilter = JSON.parse(fs.readFileSync('${outputFile}', 'utf8'));`);
        console.log('\nOption 2: Use the integrated script');
        console.log('Run: npm run generate-with-claims-api');
    } else {
        console.log('\n✅ No users have claimed tokens yet. You can proceed with the original amounts.');
    }
}

main().catch(error => {
    console.error('\n❌ Fatal Error:', error);
    process.exit(1);
});