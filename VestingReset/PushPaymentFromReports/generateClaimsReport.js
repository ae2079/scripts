import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    paymentRouterAddress: "", // Payment Processor address
    polygonScanApiKey: process.env.POLYGONSCAN_API_KEY || "YourApiKeyToken",
    apiUrl: "https://api.etherscan.io/v2/api", // V2 API endpoint
    chainId: "137", // Polygon chain ID
    requestDelay: 250, // 250ms between requests (4 requests/sec for free tier)
    outputFileName: "claims_report.json",
    startBlock: 0 // Set to 0 to get all transactions
};

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
    url.searchParams.append('action', 'tokentx'); // Get token transfers instead of regular transactions
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
        console.log('⚠️  WARNING: POLYGONSCAN_API_KEY not set in .env file');
        console.log('   Get your free API key at: https://polygonscan.com/apis');
        console.log('   Set it in .env file: POLYGONSCAN_API_KEY=your_actual_key\n');
    }

    console.log('📊 Step 1: Fetching all token transfers from Payment Router...\n');

    const allTransfers = await fetchPaymentProcessorTransactions(
        CONFIG.paymentRouterAddress,
        CONFIG.startBlock
    );

    console.log(`   ✓ Found ${allTransfers.length} total token transfers\n`);

    // Filter for transfers FROM the payment router (these are claims)
    const claimTransfers = allTransfers.filter(tx =>
        tx.from && tx.from.toLowerCase() === CONFIG.paymentRouterAddress.toLowerCase()
    );
    console.log(`   ✓ Found ${claimTransfers.length} claim transfers (sent from Payment Router)\n`);

    if (claimTransfers.length === 0) {
        console.log('⚠️  No claim transfers found');
        return;
    }

    console.log('🔎 Step 2: Processing token claims...\n');

    // Store claims data
    // Structure: { userAddress: { tokenAddress: { totalClaimed, claims: [...] } } }
    const claimsByUser = new Map();
    let processedCount = 0;

    for (const transfer of claimTransfers) {
        processedCount++;

        if (processedCount % 10 === 0) {
            console.log(`   Progress: ${processedCount}/${claimTransfers.length} transfers processed...`);
        }

        try {
            const tokenAddress = transfer.contractAddress;
            const recipient = transfer.to.toLowerCase();
            const value = BigInt(transfer.value);

            if (value > BigInt(0)) {
                // Initialize user data if needed
                if (!claimsByUser.has(recipient)) {
                    claimsByUser.set(recipient, new Map());
                }

                const userTokens = claimsByUser.get(recipient);

                // Initialize token data if needed
                if (!userTokens.has(tokenAddress.toLowerCase())) {
                    userTokens.set(tokenAddress.toLowerCase(), {
                        tokenAddress: tokenAddress,
                        tokenName: transfer.tokenName || 'Unknown',
                        tokenSymbol: transfer.tokenSymbol || 'Unknown',
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
                    transactionHash: transfer.hash,
                    blockNumber: transfer.blockNumber,
                    timestamp: transfer.timeStamp,
                    date: new Date(Number(transfer.timeStamp) * 1000).toISOString(),
                    amount: value.toString(),
                    amountFormatted: ethers.formatEther(value),
                    from: transfer.from
                });
            }

        } catch (error) {
            console.error(`   ⚠️  Error processing transfer ${transfer.hash}: ${error.message}`);
        }
    }

    console.log(`\n   ✓ Completed! Processed ${processedCount} transfers`);
    console.log(`   ✓ Found ${claimsByUser.size} users with claims\n`);

    // Step 3: Format output
    console.log('📝 Step 3: Formatting report...\n');

    const report = {
        generatedAt: new Date().toISOString(),
        paymentRouterAddress: CONFIG.paymentRouterAddress,
        chainId: CONFIG.chainId,
        chainName: "Polygon",
        totalTransfers: allTransfers.length,
        claimTransfers: claimTransfers.length,
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
    console.log(`Total Token Transfers: ${report.totalTransfers}`);
    console.log(`Claim Transfers (from Payment Router): ${report.claimTransfers}`);
    console.log(`Total Users with Claims: ${report.totalUsers}\n`);

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