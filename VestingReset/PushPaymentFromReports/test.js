import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// TEST CONFIGURATION
// ============================================================================
const CONFIG = {
    paymentRouterAddress: "0x2559C4e77131313BBBeCfA99AF51cDb4B7e9cb8A", // From your PolygonScan link
    tokenAddress: "", // Will be detected from logs
    polygonScanApiKey: process.env.POLYGONSCAN_API_KEY || "YourApiKeyToken",
    apiUrl: "https://api.etherscan.io/v2/api", // V2 API endpoint
    chainId: "137", // Polygon chain ID
    useApiKey: process.env.POLYGONSCAN_API_KEY && process.env.POLYGONSCAN_API_KEY !== "YourApiKeyToken" // Only use API key if it's set
};

// ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Fetch transactions TO the Payment Processor
 */
async function fetchPaymentProcessorTransactions(paymentRouterAddress, startBlock = 0) {
    const url = new URL(CONFIG.apiUrl);
    url.searchParams.append('chainid', CONFIG.chainId); // Polygon chain ID
    url.searchParams.append('module', 'account');
    url.searchParams.append('action', 'txlist');
    url.searchParams.append('address', paymentRouterAddress);
    url.searchParams.append('startblock', startBlock);
    url.searchParams.append('endblock', 'latest');
    url.searchParams.append('sort', 'desc'); // Most recent first
    url.searchParams.append('apikey', CONFIG.polygonScanApiKey);

    try {
        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.status === '0' && data.message === 'No transactions found') {
            return [];
        }

        if (data.status !== '1') {
            console.error('\n❌ API Response Details:');
            console.error('   Status:', data.status);
            console.error('   Message:', data.message);
            console.error('   Result:', data.result);
            console.error('   Full Response:', JSON.stringify(data, null, 2));
            throw new Error(`PolygonScan API error: ${data.message || data.result}`);
        }

        return data.result || [];
    } catch (error) {
        console.error('❌ Error fetching transactions:', error.message);
        throw error;
    }
}

/**
 * Fetch transaction logs
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
 * Main test function
 */
async function main() {
    console.log('='.repeat(80));
    console.log('Testing Claim Detection from Payment Processor');
    console.log('='.repeat(80));
    console.log(`\nPayment Router: ${CONFIG.paymentRouterAddress}`);
    const apiKeyStatus = CONFIG.polygonScanApiKey !== "YourApiKeyToken" ?
        `Yes ✓ (${CONFIG.polygonScanApiKey.substring(0, 6)}...${CONFIG.polygonScanApiKey.substring(CONFIG.polygonScanApiKey.length - 4)})` :
        "No (using default)";
    console.log(`API Key configured: ${apiKeyStatus}\n`);

    // Step 1: Fetch all transactions to the payment router
    console.log('📊 Step 1: Fetching Payment Router transactions...\n');
    const allTransactions = await fetchPaymentProcessorTransactions(CONFIG.paymentRouterAddress, 0);

    console.log(`   Found ${allTransactions.length} total transactions\n`);

    if (allTransactions.length === 0) {
        console.log('⚠️  No transactions found for this Payment Router');
        return;
    }

    // Step 2: Filter for successful transactions (potential claims)
    const successfulTxs = allTransactions.filter(tx => tx.isError === '0');
    console.log(`   ${successfulTxs.length} successful transactions\n`);

    // Step 3: Analyze recent claim transactions
    console.log('🔎 Step 2: Analyzing recent claim transactions...\n');

    const claimsData = [];
    const maxToAnalyze = Math.min(10, successfulTxs.length); // Analyze up to 10 recent transactions

    for (let i = 0; i < maxToAnalyze; i++) {
        const tx = successfulTxs[i];
        console.log(`   [${i + 1}/${maxToAnalyze}] Analyzing tx ${tx.hash}...`);
        console.log(`      From: ${tx.from}`);
        console.log(`      Block: ${tx.blockNumber}, Time: ${new Date(Number(tx.timeStamp) * 1000).toISOString()}`);

        try {
            // Small delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 300));

            const receipt = await fetchTransactionLogs(tx.hash);

            if (!receipt || !receipt.logs) {
                console.log(`      ⚠️  No logs found\n`);
                continue;
            }

            // Look for Transfer events in the logs
            let foundClaims = [];
            for (const log of receipt.logs) {
                // Check if this is a Transfer event
                if (log.topics[0] === TRANSFER_EVENT_SIGNATURE) {
                    const tokenAddr = log.address;
                    const from = '0x' + log.topics[1].slice(26); // Remove padding
                    const to = '0x' + log.topics[2].slice(26); // Remove padding
                    const value = BigInt(log.data);

                    // Check if this is a transfer TO the transaction sender
                    // (tokens may come from payment router or a vault contract)
                    if (to.toLowerCase() === tx.from.toLowerCase() && value > BigInt(0)) {

                        foundClaims.push({
                            token: tokenAddr,
                            from: from,
                            to: to,
                            amount: value
                        });
                    }
                }
            }

            if (foundClaims.length > 0) {
                console.log(`      ✅ Found ${foundClaims.length} claim(s):`);
                foundClaims.forEach((claim, idx) => {
                    console.log(`         ${idx + 1}. Token: ${claim.token}`);
                    console.log(`            From: ${claim.from}`);
                    console.log(`            Amount: ${ethers.formatEther(claim.amount)} tokens`);
                    console.log(`            To: ${claim.to}`);
                });
                claimsData.push({
                    txHash: tx.hash,
                    from: tx.from,
                    blockNumber: tx.blockNumber,
                    timeStamp: tx.timeStamp,
                    claims: foundClaims
                });
            } else {
                console.log(`      No claim transfers found`);
            }
            console.log('');

        } catch (error) {
            console.error(`      ❌ Error: ${error.message}\n`);
        }
    }

    // Step 4: Summary
    console.log('='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Transactions Analyzed: ${maxToAnalyze}`);
    console.log(`Transactions with Claims: ${claimsData.length}\n`);

    if (claimsData.length > 0) {
        // Group by user
        const userClaims = new Map();
        claimsData.forEach(claim => {
            claim.claims.forEach(c => {
                const key = `${c.to.toLowerCase()}_${c.token.toLowerCase()}`;
                if (!userClaims.has(key)) {
                    userClaims.set(key, {
                        user: c.to,
                        token: c.token,
                        totalAmount: BigInt(0),
                        claimCount: 0
                    });
                }
                const userData = userClaims.get(key);
                userData.totalAmount += c.amount;
                userData.claimCount++;
            });
        });

        console.log('👥 Unique Users with Claims:');
        let userIndex = 1;
        for (const [key, data] of userClaims.entries()) {
            console.log(`\n   ${userIndex}. User: ${data.user}`);
            console.log(`      Token: ${data.token}`);
            console.log(`      Total Claimed: ${ethers.formatEther(data.totalAmount)} tokens`);
            console.log(`      Number of Claims: ${data.claimCount}`);
            userIndex++;
        }

        console.log('\n✅ Test successful! The script can detect claims from transaction logs.');
        console.log('\n💡 Tip: Copy one of the token addresses above to use in your actual script.');
    } else {
        console.log('⚠️  No claims found in the analyzed transactions.');
        console.log('   This could mean:');
        console.log('   - Recent transactions are not claim transactions');
        console.log('   - Try increasing maxToAnalyze or checking older transactions');
    }

    console.log('\n' + '='.repeat(80));
}

main().catch(error => {
    console.error('\n❌ Fatal Error:', error);
    process.exit(1);
});