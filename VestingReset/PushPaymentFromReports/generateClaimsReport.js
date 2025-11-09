import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    paymentRouterAddress: "0x2559C4e77131313BBBeCfA99AF51cDb4B7e9cb8A", // Payment Router address
    polygonScanApiKey: process.env.POLYGONSCAN_API_KEY || "YourApiKeyToken",
    apiUrl: "https://api.etherscan.io/v2/api", // V2 API endpoint
    chainId: "137", // Polygon chain ID
    requestDelay: 250, // 250ms between requests (4 requests/sec for free tier)
    outputFileName: "claims_report.json",
    startBlock: 0 // Set to 0 to get all transactions
};

// ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch transactions TO the Payment Processor from Etherscan API
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
            throw new Error(`API error: ${data.message || data.result}`);
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
 * Generate claims report
 */
async function generateClaimsReport() {
    console.log('='.repeat(80));
    console.log('🔍 Generating Claims Report');
    console.log('='.repeat(80));
    console.log(`\nPayment Router: ${CONFIG.paymentRouterAddress}`);
    console.log(`Start Block: ${CONFIG.startBlock === 0 ? 'Genesis (all history)' : CONFIG.startBlock}`);
    console.log(`Output File: ${CONFIG.outputFileName}\n`);

    // Validate API key
    if (!CONFIG.polygonScanApiKey || CONFIG.polygonScanApiKey === "YourApiKeyToken") {
        console.error('❌ Error: POLYGONSCAN_API_KEY not set in .env file');
        console.error('Please create a .env file with: POLYGONSCAN_API_KEY=your_actual_key');
        process.exit(1);
    }

    console.log('📊 Step 1: Fetching all Payment Router transactions...\n');

    const allTransactions = await fetchPaymentProcessorTransactions(
        CONFIG.paymentRouterAddress,
        CONFIG.startBlock
    );

    console.log(`   ✓ Found ${allTransactions.length} total transactions\n`);

    const successfulTxs = allTransactions.filter(tx => tx.isError === '0');
    console.log(`   ✓ Found ${successfulTxs.length} successful transactions\n`);

    if (successfulTxs.length === 0) {
        console.log('⚠️  No successful transactions found');
        return;
    }

    console.log('🔎 Step 2: Analyzing transaction logs for token claims...\n');

    // Store claims data
    // Structure: { userAddress: { tokenAddress: { totalClaimed, claims: [...] } } }
    const claimsByUser = new Map();
    let processedCount = 0;
    let claimsFoundCount = 0;

    for (const tx of successfulTxs) {
        processedCount++;

        if (processedCount % 10 === 0) {
            console.log(`   Progress: ${processedCount}/${successfulTxs.length} transactions analyzed...`);
        }

        try {
            // Rate limiting
            await sleep(CONFIG.requestDelay);

            const receipt = await fetchTransactionLogs(tx.hash);

            if (!receipt || !receipt.logs) {
                continue;
            }

            // Look for Transfer events
            for (const log of receipt.logs) {
                // Check if this is a Transfer event
                if (log.topics[0] === TRANSFER_EVENT_SIGNATURE && log.topics.length >= 3) {
                    const tokenAddress = log.address;
                    const from = '0x' + log.topics[1].slice(26); // Remove padding
                    const to = '0x' + log.topics[2].slice(26); // Remove padding
                    const value = BigInt(log.data);

                    // Check if this is a transfer TO the transaction sender (a claim)
                    if (to.toLowerCase() === tx.from.toLowerCase() && value > BigInt(0)) {
                        claimsFoundCount++;

                        // Initialize user data if needed
                        if (!claimsByUser.has(to.toLowerCase())) {
                            claimsByUser.set(to.toLowerCase(), new Map());
                        }

                        const userTokens = claimsByUser.get(to.toLowerCase());

                        // Initialize token data if needed
                        if (!userTokens.has(tokenAddress.toLowerCase())) {
                            userTokens.set(tokenAddress.toLowerCase(), {
                                tokenAddress: tokenAddress,
                                totalClaimed: BigInt(0),
                                totalClaimedFormatted: "0",
                                claimCount: 0,
                                claims: []
                            });
                        }

                        const tokenData = userTokens.get(tokenAddress.toLowerCase());

                        // Add claim
                        tokenData.totalClaimed += value;
                        tokenData.claimCount++;
                        tokenData.claims.push({
                            transactionHash: tx.hash,
                            blockNumber: tx.blockNumber,
                            timestamp: tx.timeStamp,
                            date: new Date(Number(tx.timeStamp) * 1000).toISOString(),
                            amount: value.toString(),
                            amountFormatted: ethers.formatEther(value),
                            from: from
                        });
                    }
                }
            }

        } catch (error) {
            console.error(`   ⚠️  Error processing tx ${tx.hash}: ${error.message}`);
        }
    }

    console.log(`\n   ✓ Completed! Analyzed ${processedCount} transactions`);
    console.log(`   ✓ Found ${claimsFoundCount} token claims\n`);

    // Step 3: Format output
    console.log('📝 Step 3: Formatting report...\n');

    const report = {
        generatedAt: new Date().toISOString(),
        paymentRouterAddress: CONFIG.paymentRouterAddress,
        chainId: CONFIG.chainId,
        chainName: "Polygon",
        totalTransactions: allTransactions.length,
        successfulTransactions: successfulTxs.length,
        totalClaims: claimsFoundCount,
        totalUsers: claimsByUser.size,
        users: []
    };

    // Convert Map to array and format BigInt values
    for (const [userAddress, tokens] of claimsByUser.entries()) {
        const userTokens = [];

        for (const [tokenAddress, tokenData] of tokens.entries()) {
            userTokens.push({
                tokenAddress: tokenData.tokenAddress,
                totalClaimed: tokenData.totalClaimed.toString(),
                totalClaimedFormatted: ethers.formatEther(tokenData.totalClaimed),
                claimCount: tokenData.claimCount,
                claims: tokenData.claims
            });
        }

        report.users.push({
            userAddress: userAddress,
            tokens: userTokens,
            totalClaimTransactions: userTokens.reduce((sum, t) => sum + t.claimCount, 0)
        });
    }

    // Sort users by address
    report.users.sort((a, b) => a.userAddress.localeCompare(b.userAddress));

    // Step 4: Save to file
    console.log('💾 Step 4: Saving report to file...\n');

    fs.writeFileSync(
        CONFIG.outputFileName,
        JSON.stringify(report, null, 2),
        'utf-8'
    );

    console.log(`   ✓ Report saved to: ${CONFIG.outputFileName}\n`);

    // Step 5: Display summary
    console.log('='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Users: ${report.totalUsers}`);
    console.log(`Total Claims: ${report.totalClaims}`);
    console.log(`Total Transactions Analyzed: ${report.totalTransactions}\n`);

    // Show top 10 claimers
    const sortedByClaimCount = [...report.users].sort((a, b) =>
        b.totalClaimTransactions - a.totalClaimTransactions
    );

    console.log('👥 Top 10 Users by Claim Count:');
    sortedByClaimCount.slice(0, 10).forEach((user, idx) => {
        console.log(`   ${idx + 1}. ${user.userAddress}`);
        console.log(`      Claim Transactions: ${user.totalClaimTransactions}`);
        user.tokens.forEach(token => {
            console.log(`      Token: ${token.tokenAddress}`);
            console.log(`      Amount: ${token.totalClaimedFormatted} tokens`);
        });
        console.log('');
    });

    console.log('='.repeat(80));
    console.log(`✅ Report generation complete!`);
    console.log(`📁 Output: ${CONFIG.outputFileName}`);
    console.log('='.repeat(80));
}

// Run the script
generateClaimsReport().catch(error => {
    console.error('\n❌ Fatal Error:', error);
    process.exit(1);
});