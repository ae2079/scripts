import fs from 'fs';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    transactionFileName: "1.json",
    polygonScanApiKey: process.env.POLYGONSCAN_API_KEY || "YourApiKeyToken",
    apiUrl: "https://api.etherscan.io/v2/api", // V2 API endpoint
    chainId: "137", // Polygon chain ID
    checkClaims: true, // Set to true to check on-chain claims and deduct them
    onlyFilteredUsers: false // Set to true to only process users who have claimed
};

const FUNCTION_SELECTORS = {
    approve: "0x095ea7b3",
    buy: "0xd6febde8",
    transfer: "0xa9059cbb",
    pushPayment: "0x8028b82f",
    removeAllPaymentReceiverPayments: "0xcb8e092f",
};

// ============================================================================
// FILE OPERATIONS
// ============================================================================

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

// ============================================================================
// API INTERACTION
// ============================================================================

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
            claimedAmount: BigInt(0)
        });
    });

    console.log(`📊 Checking transactions for ${users.length} users...\n`);

    let processedUsers = 0;

    // Check each user's transactions
    for (const user of users) {
        processedUsers++;
        console.log(`   [${processedUsers}/${users.length}] Checking ${user.address}...`);

        try {
            // Fetch ALL transactions TO the payment router (done once outside loop now)

            // Filter for transactions TO payment router (user calling claim)
            const claimTxs = transactions.filter(tx =>
                tx.to && tx.to.toLowerCase() === paymentRouterAddress.toLowerCase() &&
                tx.isError === '0' // Only successful transactions
            );

            if (claimTxs.length === 0) {
                console.log(`      No claim transactions\n`);
                continue;
            }

            // For each claim transaction, fetch the logs to see Transfer events
            for (const tx of claimTxs) {
                // Small delay to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 250));

                const receipt = await fetchTransactionLogs(tx.hash);

                if (!receipt || !receipt.logs) {
                    continue;
                }

                // Look for Transfer events in the logs
                for (const log of receipt.logs) {
                    // Check if this is a Transfer event from our token
                    if (log.topics[0] === TRANSFER_EVENT_SIGNATURE &&
                        log.address.toLowerCase() === tokenAddress.toLowerCase()) {

                        const from = '0x' + log.topics[1].slice(26); // Remove padding
                        const to = '0x' + log.topics[2].slice(26); // Remove padding
                        const value = BigInt(log.data);

                        // Check if this is a transfer TO this user
                        // (tokens may come from payment router or a vault contract)
                        if (to.toLowerCase() === user.address.toLowerCase() && value > BigInt(0)) {

                            const userData = userMap.get(user.address.toLowerCase());
                            userData.claimedAmount += value;

                            console.log(`      ✓ Claimed: ${ethers.formatEther(value)} tokens from ${from} (tx: ${tx.hash})`);
                        }
                    }
                }
            }

            const userData = userMap.get(user.address.toLowerCase());
            if (userData.claimedAmount > BigInt(0)) {
                console.log(`      💰 Total: ${ethers.formatEther(userData.claimedAmount)} tokens\n`);
            } else {
                console.log(`      No claims found\n`);
            }

        } catch (error) {
            console.error(`      ❌ Error: ${error.message}\n`);
        }
    }

    console.log('='.repeat(80));

    // Build result array
    const addressToFilter = [];
    for (const userData of userMap.values()) {
        if (userData.claimedAmount > BigInt(0)) {
            addressToFilter.push({
                address: userData.address,
                amountToDeduct: userData.claimedAmount.toString()
            });
        }
    }

    return addressToFilter;
}

// ============================================================================
// TRANSACTION BUILDING
// ============================================================================

function buildTransactions(toAddress, userData, abcTokenAddress, start, cliff, end, addressToFilter, onlyFilteredUsers) {
    const transactions = [];

    // Checksum addresses to ensure proper format
    const checksummedToAddress = ethers.getAddress(toAddress);
    const checksummedTokenAddress = ethers.getAddress(abcTokenAddress);

    for (const user of userData) {
        const checksummedUserAddress = ethers.getAddress(user.address);
        let amountToPush = user.amount;
        let shouldInclude = !onlyFilteredUsers;

        const matchingFilter = addressToFilter.find(
            address => address.address.toLowerCase() === user.address.toLowerCase()
        );

        if (matchingFilter) {
            console.log(`✅ Found matching address: ${checksummedUserAddress}`);
            console.log(`   Deducting ${ethers.formatEther(matchingFilter.amountToDeduct)} from ${ethers.formatEther(user.amount)}`);

            const amountToDeduct = BigInt(matchingFilter.amountToDeduct);
            const originalAmount = BigInt(user.amount);
            amountToPush = (originalAmount - amountToDeduct).toString();

            console.log(`   💰 New amount after deduction: ${ethers.formatEther(amountToPush)}\n`);

            if (onlyFilteredUsers) {
                shouldInclude = true;
            }
        }

        if (shouldInclude && BigInt(amountToPush) > BigInt(0)) {
            transactions.push({
                to: checksummedToAddress,
                value: "0",
                data: FUNCTION_SELECTORS.pushPayment + ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "address", "uint256", "uint256", "uint256", "uint256"], [checksummedUserAddress, checksummedTokenAddress, amountToPush, start, cliff, end]
                ).slice(2),
                contractMethod: "pushPayment(address,address,uint256,uint256,uint256,uint256)",
                contractInputsValues: [
                    checksummedUserAddress,
                    checksummedTokenAddress,
                    amountToPush,
                    start.toString(),
                    cliff.toString(),
                    end.toString()
                ]
            });
        }
    }
    return transactions;
}

function generateTransactionJson(safe, projectName, client, userData, abcTokenAddress, start, cliff, end, addressToFilter, onlyFilteredUsers) {
    const batchSize = 25;
    const totalUsers = userData.length;
    const totalBatches = Math.ceil(totalUsers / batchSize);
    const currentTimestamp = Date.now();

    // Checksum the Safe address to ensure proper format
    const checksummedSafeAddress = ethers.getAddress(safe);

    // Create project folder and pushPayment subfolder if they don't exist
    const projectFolder = `./${projectName}`;
    const pushPaymentFolder = `${projectFolder}/pushPayment`;

    if (!fs.existsSync(projectFolder)) {
        fs.mkdirSync(projectFolder, { recursive: true });
        console.log(`📁 Created project folder: ${projectFolder}`);
    }

    if (!fs.existsSync(pushPaymentFolder)) {
        fs.mkdirSync(pushPaymentFolder, { recursive: true });
        console.log(`📁 Created pushPayment folder: ${pushPaymentFolder}`);
    }

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min(startIndex + batchSize, totalUsers);
        const batchUsers = userData.slice(startIndex, endIndex);
        const transactions = buildTransactions(client, batchUsers, abcTokenAddress, start, cliff, end, addressToFilter, onlyFilteredUsers)

        if (transactions.length > 0) {
            const transactionData = {
                version: "1.0",
                chainId: "137", // Polygon Mainnet
                createdAt: currentTimestamp,
                meta: {
                    name: `[PUSH-PAYMENTS]-[${projectName}]-[QACC-ROUND-1]-[TX-${batchIndex}]`,
                    description: `Batch ${batchIndex + 1} for ${projectName}`,
                    txBuilderVersion: "",
                    createdFromSafeAddress: checksummedSafeAddress,
                    createdFromOwnerAddress: "",
                    checksum: ""
                },
                transactions
            };

            const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
            const filename = `transactions_${projectName}_batch${batchIndex + 1}_${timestamp}.json`;
            const filePath = `${pushPaymentFolder}/${filename}`;
            fs.writeFileSync(filePath, JSON.stringify(transactionData, null, 2));
            console.log(`Transaction file generated: ${filePath}`);
        }
    }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
    console.log('='.repeat(80));
    console.log('Push Payment Transaction Generator with Claim Checking (API Version)');
    console.log('='.repeat(80));

    // Check API key
    if (CONFIG.polygonScanApiKey === "YourApiKeyToken") {
        console.log('\n⚠️  WARNING: Using default API key (may have rate limits)');
        console.log('   Get your free API key at: https://polygonscan.com/apis');
        console.log('   Set it as: export POLYGONSCAN_API_KEY=your_key\n');
    }

    // Read transaction file
    console.log(`\n📄 Reading transaction file: ${CONFIG.transactionFileName}`);
    const filesData = readTransactionFile(CONFIG.transactionFileName);

    // Extract configuration from transaction file
    let projectName = filesData.projectName;
    const paymentRouterAddress = filesData.queries.addresses.paymentRouter;
    const fundingPotMSAddress = filesData.inputs.projectConfig.SAFE;
    const abcTokenAddress = filesData.queries.addresses.issuanceToken;

    // Clean up project name
    if (projectName) {
        const originalName = projectName;
        projectName = projectName.replace(/_S2$/i, '').replace(/_+$/, '');
        if (originalName !== projectName) {
            console.log(`📝 Cleaned project name: ${originalName} → ${projectName}`);
        }
    }

    // Validate extracted data
    if (!projectName || !paymentRouterAddress || !fundingPotMSAddress || !abcTokenAddress) {
        console.error('❌ Error: Failed to extract all required configuration from transaction file');
        console.error('Missing:', {
            projectName: !!projectName,
            paymentRouterAddress: !!paymentRouterAddress,
            fundingPotMSAddress: !!fundingPotMSAddress,
            abcTokenAddress: !!abcTokenAddress
        });
        process.exit(1);
    }

    console.log('\n✅ Project Configuration:');
    console.log(`   Project Name: ${projectName}`);
    console.log(`   Safe Address: ${fundingPotMSAddress}`);
    console.log(`   Payment Router: ${paymentRouterAddress}`);
    console.log(`   Token Address: ${abcTokenAddress}`);

    // Extract timing data
    let originalStart, originalCliff, originalEnd;
    if (filesData.transactions.readable && filesData.transactions.readable.length > 0) {
        const firstTransaction = filesData.transactions.readable[0];
        if (firstTransaction && firstTransaction.length > 0) {
            const firstTx = firstTransaction.find(tx =>
                tx.functionSignature === "pushPayment(address,address,uint256,uint256,uint256,uint256)"
            );
            if (firstTx && firstTx.inputValues && firstTx.inputValues.length >= 6) {
                originalStart = parseInt(firstTx.inputValues[3]);
                originalCliff = parseInt(firstTx.inputValues[4]);
                originalEnd = parseInt(firstTx.inputValues[5]);
            }
        }
    }

    if (!originalStart || !originalEnd) {
        console.error('❌ Error: Failed to extract timing data from transaction file');
        process.exit(1);
    }

    // Calculate new timing
    const start = originalStart + originalCliff;
    const cliff = 0;
    const end = originalEnd;

    console.log(`\n⏰ Timing Configuration:`);
    console.log(`   Original Start: ${originalStart} (${new Date(originalStart * 1000).toISOString()})`);
    console.log(`   Original Cliff: ${originalCliff} seconds (${Math.floor(originalCliff / 86400)} days)`);
    console.log(`   Original End: ${originalEnd} (${new Date(originalEnd * 1000).toISOString()})`);
    console.log(`   → New Start: ${start} (${new Date(start * 1000).toISOString()})`);
    console.log(`   → New Cliff: ${cliff}`);
    console.log(`   → New End: ${end} (${new Date(end * 1000).toISOString()})`);

    // Extract user data
    const userData = getUserDataFromTransactions(filesData.transactions.readable);
    console.log(`\n👥 Users Found: ${userData.length}`);

    // Check for claimed amounts if enabled
    let addressToFilter = [];
    if (CONFIG.checkClaims) {
        console.log('\n🔄 Claim checking is ENABLED (using PolygonScan API)');
        addressToFilter = await checkClaimedAmountsViaAPI(
            paymentRouterAddress,
            abcTokenAddress,
            userData
        );

        console.log('\n' + '='.repeat(80));
        console.log('📊 Claim Check Summary');
        console.log('='.repeat(80));
        console.log(`Users with Claims: ${addressToFilter.length}`);
        console.log(`Users without Claims: ${userData.length - addressToFilter.length}`);

        if (addressToFilter.length > 0) {
            const totalClaimed = addressToFilter.reduce((sum, user) => sum + BigInt(user.amountToDeduct), BigInt(0));
            console.log(`Total Claimed Amount: ${ethers.formatEther(totalClaimed)} tokens`);

            // Save the filter data
            const filterFile = `${projectName}/addressToFilter.json`;
            fs.writeFileSync(filterFile, JSON.stringify(addressToFilter, null, 2));
            console.log(`\n💾 Saved claim data to: ${filterFile}`);
        }
    } else {
        console.log('\n⚠️  Claim checking is DISABLED - using original amounts');
    }

    // Generate transactions
    console.log('\n' + '='.repeat(80));
    console.log('🏗️  Generating Transactions');
    console.log('='.repeat(80));
    console.log(`Mode: ${CONFIG.onlyFilteredUsers ? 'Only users with claims' : 'All users'}`);

    generateTransactionJson(
        fundingPotMSAddress,
        projectName,
        paymentRouterAddress,
        userData,
        abcTokenAddress,
        start,
        cliff,
        end,
        addressToFilter,
        CONFIG.onlyFilteredUsers
    );

    console.log('\n✅ Done!');
    console.log('='.repeat(80));
}

main().catch(error => {
    console.error('\n❌ Fatal Error:', error);
    process.exit(1);
});