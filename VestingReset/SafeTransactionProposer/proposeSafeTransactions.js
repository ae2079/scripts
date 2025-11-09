/**
 * Safe Transaction Proposer
 * 
 * Proposes batch transactions to a Safe (Gnosis Safe) multisig wallet.
 * 
 * Key Features:
 * - Manually encodes MultiSend transactions to use MultiSendCallOnly contract
 * - Safe DELEGATE_CALLs to MultiSendCallOnly, which then makes CALLs to each target
 * - Automatic sequential nonce management for multiple batches
 * - Works with Safes that restrict DELEGATE_CALLs to external contracts
 * 
 * MultiSend Encoding:
 * Each transaction is encoded as: operation(0=CALL) + to(20) + value(32) + dataLength(32) + data
 * All transactions are concatenated and passed to MultiSendCallOnly.multiSend(bytes)
 * The Safe DELEGATE_CALLs to MultiSendCallOnly (operation 1)
 * MultiSendCallOnly then makes CALLs (operation 0) to each target address
 * 
 * Reference: https://github.com/safe-global/safe-core-sdk/issues/1168
 */

import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Configuration
 * Update these values according to your needs
 * You can also override these via environment variables in .env file:
 * - PRIVATE_KEY (required)
 * - RPC_URL (optional)
 * - CHAIN_ID (optional, can also be passed via command line)
 * - USE_QUEUE_NONCE (optional, set to 'true' to use queue nonce instead of current nonce)
 * 
 * Note: SAFE_ADDRESS is automatically extracted from transaction files (meta.createdFromSafeAddress)
 */
const CONFIG = {
    CHAIN_ID: process.env.CHAIN_ID || '137', // Polygon Mainnet
    RPC_URL: process.env.RPC_URL || 'https://polygon-rpc.com', // Or use your preferred RPC
    // MultiSendCallOnly 1.4.1 contract - Safe delegates to it, it makes CALLs to targets
    // Required for Safes that restrict delegate calls to untrusted contracts
    MULTI_SEND_CALL_ONLY_ADDRESS: '0x9641d764fc13c8B624c04430C7356C1C7C8102e2',
    // If true, uses the highest pending nonce + 1 (appends to queue)
    // If false, uses current nonce (may overwrite pending transactions)
    USE_QUEUE_NONCE: process.env.USE_QUEUE_NONCE === 'true'
};

/**
 * Encodes transactions for MultiSend contract
 * Format: operation (1 byte) + to (20 bytes) + value (32 bytes) + dataLength (32 bytes) + data
 */
function encodeMultiSendData(transactions) {
    const encodedTransactions = transactions.map(tx => {
        const operation = 0; // 0 = Call
        const to = tx.to;
        const value = BigInt(tx.value || '0');
        const data = tx.data || '0x';
        const dataBytes = ethers.getBytes(data);
        const dataLength = dataBytes.length;

        // Encode: operation(1) + to(20) + value(32) + dataLength(32) + data
        const encoded = ethers.solidityPacked(
            ['uint8', 'address', 'uint256', 'uint256', 'bytes'], [operation, to, value, dataLength, data]
        );

        return encoded;
    });

    // Concatenate all encoded transactions
    return ethers.concat(encodedTransactions);
}

/**
 * Reads a transaction JSON file and returns the parsed data
 */
function readTransactionFile(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const transactionData = JSON.parse(data);
        console.log(`✅ Successfully read transaction file: ${filePath}`);
        console.log(`📊 Found ${transactionData.transactions.length} transactions`);

        // Extract Safe address from transaction file
        const safeAddress = transactionData.meta && transactionData.meta.createdFromSafeAddress;
        if (safeAddress) {
            console.log(`🔒 Safe Address (from file): ${safeAddress}`);
        }

        return transactionData;
    } catch (error) {
        console.error(`❌ Error reading file ${filePath}:`, error.message);
        throw error;
    }
}

/**
 * Reads all transaction files from a directory
 */
function readAllTransactionFiles(directoryPath) {
    try {
        const files = fs.readdirSync(directoryPath);
        const jsonFiles = files.filter(file => file.endsWith('.json'));

        console.log(`\n📂 Found ${jsonFiles.length} transaction files in ${directoryPath}`);

        return jsonFiles.map(file => ({
            filename: file,
            fullPath: path.join(directoryPath, file),
            data: readTransactionFile(path.join(directoryPath, file))
        }));
    } catch (error) {
        console.error(`❌ Error reading directory ${directoryPath}:`, error.message);
        throw error;
    }
}

/**
 * Initializes the Safe SDK
 */
async function initializeSafe(privateKey, safeAddress, chainId) {
    try {
        console.log('\n🔧 Initializing Safe SDK...');

        // Create provider and signer
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const signer = new ethers.Wallet(privateKey, provider);

        console.log(`👤 Signer address: ${signer.address}`);

        // Initialize Safe Protocol Kit
        const protocolKit = await Safe.default.init({
            provider: CONFIG.RPC_URL,
            signer: privateKey,
            safeAddress: safeAddress
        });

        // Initialize Safe API Kit
        const apiKit = new SafeApiKit.default({
            chainId: BigInt(chainId)
        });

        console.log(`✅ Safe SDK initialized for Safe: ${safeAddress}`);
        console.log(`🔗 Chain ID: ${chainId}`);

        return { protocolKit, apiKit, signer };
    } catch (error) {
        console.error('❌ Error initializing Safe SDK:', error.message);
        console.error('Full error:', error);
        throw error;
    }
}

/**
 * Gets the next available nonce for the Safe
 * If USE_QUEUE_NONCE is true, returns the highest pending nonce + 1
 * Otherwise, returns the current nonce (next nonce to be executed)
 */
async function getStartingNonce(protocolKit, apiKit, safeAddress, useQueueNonce) {
    try {
        // Get current nonce (next nonce to be executed)
        const currentNonce = await protocolKit.getNonce();

        if (!useQueueNonce) {
            console.log(`📍 Using current nonce (may overwrite pending transactions)`);
            return currentNonce;
        }

        // Get pending transactions from the queue
        console.log(`🔍 Checking for pending transactions in queue...`);
        const pendingTxs = await apiKit.getPendingTransactions(safeAddress);

        if (!pendingTxs.results || pendingTxs.results.length === 0) {
            console.log(`✅ No pending transactions found. Using current nonce: ${currentNonce}`);
            return currentNonce;
        }

        // Find the highest nonce in the pending transactions
        const highestPendingNonce = Math.max(
            ...pendingTxs.results.map(tx => tx.nonce)
        );

        const nextQueueNonce = highestPendingNonce + 1;

        console.log(`📋 Found ${pendingTxs.results.length} pending transaction(s)`);
        console.log(`🔢 Current nonce: ${currentNonce}`);
        console.log(`🔢 Highest pending nonce: ${highestPendingNonce}`);
        console.log(`🔢 Next queue nonce: ${nextQueueNonce}`);
        console.log(`✅ Using queue nonce to append to existing queue`);

        return nextQueueNonce;
    } catch (error) {
        console.error('⚠️  Error getting queue nonce, falling back to current nonce:', error.message);
        const currentNonce = await protocolKit.getNonce();
        return currentNonce;
    }
}

/**
 * Proposes a batch of transactions to the Safe
 */
async function proposeBatchTransaction(protocolKit, apiKit, signer, transactionData, nonce) {
    try {
        console.log(`\n📝 Proposing transaction batch: ${transactionData.meta.name}`);
        console.log(`📊 Number of transactions in batch: ${transactionData.transactions.length}`);
        console.log(`🔢 Using nonce: ${nonce}`);

        // Manually encode MultiSend transaction to use MultiSendCallOnly contract
        // Safe DELEGATE_CALLs to MultiSendCallOnly, which then makes CALLs to each target
        console.log(`📦 Using MultiSendCallOnly contract: ${CONFIG.MULTI_SEND_CALL_ONLY_ADDRESS}`);

        // Encode the batch of transactions for MultiSend
        const encodedData = encodeMultiSendData(transactionData.transactions);

        // Create the multiSend function call
        const multiSendInterface = new ethers.Interface([
            'function multiSend(bytes memory transactions)'
        ]);
        const multiSendData = multiSendInterface.encodeFunctionData('multiSend', [encodedData]);

        // Create a single Safe transaction that DELEGATE_CALLs to MultiSendCallOnly
        // The Safe uses DELEGATE_CALL (1) to MultiSendCallOnly, which then makes CALLs to each target
        const safeTransaction = await protocolKit.createTransaction({
            transactions: [{
                to: CONFIG.MULTI_SEND_CALL_ONLY_ADDRESS,
                value: '0',
                data: multiSendData,
                operation: 1 // 1 = DELEGATE_CALL (Safe delegates to MultiSendCallOnly)
            }],
            options: {
                nonce: nonce
            }
        });

        // Get the transaction hash
        const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
        console.log(`🔐 Transaction hash: ${safeTxHash}`);

        // Sign the transaction
        const signedSafeTransaction = await protocolKit.signTransaction(safeTransaction);
        console.log(`✍️  Transaction signed`);

        // Get the Safe address
        const safeAddress = await protocolKit.getAddress();

        // Construct the safe transaction data object explicitly
        const safeTransactionData = {
            to: safeTransaction.data.to,
            value: safeTransaction.data.value,
            data: safeTransaction.data.data,
            operation: safeTransaction.data.operation,
            safeTxGas: safeTransaction.data.safeTxGas,
            baseGas: safeTransaction.data.baseGas,
            gasPrice: safeTransaction.data.gasPrice,
            gasToken: safeTransaction.data.gasToken,
            refundReceiver: safeTransaction.data.refundReceiver,
            nonce: safeTransaction.data.nonce
        };

        // Propose the transaction to the Safe service
        await apiKit.proposeTransaction({
            safeAddress: safeAddress,
            safeTransactionData: safeTransactionData,
            safeTxHash: safeTxHash,
            senderAddress: signer.address,
            senderSignature: signedSafeTransaction.encodedSignatures(),
            origin: transactionData.meta.description || 'Automated Transaction Proposal'
        });

        console.log(`✅ Transaction proposed successfully!`);
        console.log(`🔗 View in Safe UI: https://app.safe.global/transactions/queue?safe=matic:${await protocolKit.getAddress()}`);

        return safeTxHash;
    } catch (error) {
        console.error(`❌ Error proposing transaction:`, error.message);
        throw error;
    }
}

/**
 * Proposes all transactions from files in a directory
 */
async function proposeAllTransactions(directoryPath, privateKey, chainId, delayBetweenBatches = 2000) {
    try {
        // Read all transaction files
        const transactionFiles = readAllTransactionFiles(directoryPath);

        if (transactionFiles.length === 0) {
            console.log('⚠️  No transaction files found to propose');
            return;
        }

        // Extract Safe address from the first transaction file
        const safeAddress = transactionFiles[0].data.meta && transactionFiles[0].data.meta.createdFromSafeAddress;
        if (!safeAddress) {
            throw new Error('❌ Safe address not found in transaction file. Please ensure the transaction file has meta.createdFromSafeAddress');
        }

        // Verify all transaction files use the same Safe address
        const inconsistentFiles = transactionFiles.filter(f => {
            const fSafeAddress = f.data.meta && f.data.meta.createdFromSafeAddress;
            return fSafeAddress && fSafeAddress.toLowerCase() !== safeAddress.toLowerCase();
        });
        if (inconsistentFiles.length > 0) {
            console.warn(`⚠️  Warning: ${inconsistentFiles.length} file(s) have different Safe addresses`);
            inconsistentFiles.forEach(f => {
                const addr = f.data.meta && f.data.meta.createdFromSafeAddress;
                console.warn(`   - ${f.filename}: ${addr}`);
            });
        }

        console.log(`\n🔐 Using Safe Address: ${safeAddress}`);

        // Initialize Safe SDK
        const { protocolKit, apiKit, signer } = await initializeSafe(privateKey, safeAddress, chainId);

        // Verify signer is an owner of the Safe
        const owners = await protocolKit.getOwners();
        if (!owners.includes(signer.address)) {
            throw new Error(`❌ Signer ${signer.address} is not an owner of Safe ${safeAddress}`);
        }
        console.log(`✅ Verified: Signer is an owner of the Safe`);

        // Get the starting nonce (current or queue nonce based on config)
        let currentNonce = await getStartingNonce(protocolKit, apiKit, safeAddress, CONFIG.USE_QUEUE_NONCE);
        console.log(`\n🔢 Starting nonce: ${currentNonce}`);
        console.log(`📦 Total batches to propose: ${transactionFiles.length}`);
        console.log(`🔢 Nonces will be assigned: ${currentNonce} to ${currentNonce + transactionFiles.length - 1}`);

        // Propose each transaction batch with sequential nonces
        const results = [];
        for (let i = 0; i < transactionFiles.length; i++) {
            const file = transactionFiles[i];
            const batchNonce = currentNonce + i;

            console.log(`\n${'='.repeat(80)}`);
            console.log(`📄 Processing file ${i + 1}/${transactionFiles.length}: ${file.filename}`);
            console.log(`${'='.repeat(80)}`);

            try {
                const txHash = await proposeBatchTransaction(protocolKit, apiKit, signer, file.data, batchNonce);
                results.push({
                    filename: file.filename,
                    status: 'success',
                    txHash: txHash,
                    nonce: batchNonce
                });

                // Add delay between batches to avoid rate limiting
                if (i < transactionFiles.length - 1) {
                    console.log(`⏳ Waiting ${delayBetweenBatches}ms before next batch...`);
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
                }
            } catch (error) {
                console.error(`❌ Failed to propose ${file.filename}:`, error.message);
                results.push({
                    filename: file.filename,
                    status: 'failed',
                    error: error.message,
                    nonce: batchNonce
                });
            }
        }

        // Print summary
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📊 SUMMARY`);
        console.log(`${'='.repeat(80)}`);
        console.log(`Total files processed: ${results.length}`);
        console.log(`Successful: ${results.filter(r => r.status === 'success').length}`);
        console.log(`Failed: ${results.filter(r => r.status === 'failed').length}`);

        console.log(`\n📋 Detailed Results:`);
        results.forEach((result, index) => {
            if (result.status === 'success') {
                console.log(`  ${index + 1}. ✅ ${result.filename}`);
                console.log(`     Nonce: ${result.nonce}`);
                console.log(`     TX Hash: ${result.txHash}`);
            } else {
                console.log(`  ${index + 1}. ❌ ${result.filename}`);
                console.log(`     Nonce: ${result.nonce}`);
                console.log(`     Error: ${result.error}`);
            }
        });

        return results;
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        throw error;
    }
}

/**
 * Proposes a single transaction file
 */
async function proposeSingleTransaction(filePath, privateKey, chainId) {
    try {
        // Read the transaction file
        const transactionData = readTransactionFile(filePath);

        // Extract Safe address from transaction file
        const safeAddress = transactionData.meta && transactionData.meta.createdFromSafeAddress;
        if (!safeAddress) {
            throw new Error('❌ Safe address not found in transaction file. Please ensure the transaction file has meta.createdFromSafeAddress');
        }

        console.log(`\n🔐 Using Safe Address: ${safeAddress}`);

        // Initialize Safe SDK
        const { protocolKit, apiKit, signer } = await initializeSafe(privateKey, safeAddress, chainId);

        // Verify signer is an owner of the Safe
        const owners = await protocolKit.getOwners();
        if (!owners.includes(signer.address)) {
            throw new Error(`❌ Signer ${signer.address} is not an owner of Safe ${safeAddress}`);
        }
        console.log(`✅ Verified: Signer is an owner of the Safe`);

        // Get the starting nonce (current or queue nonce based on config)
        const currentNonce = await getStartingNonce(protocolKit, apiKit, safeAddress, CONFIG.USE_QUEUE_NONCE);
        console.log(`\n🔢 Using nonce: ${currentNonce}`);

        // Propose the transaction
        const txHash = await proposeBatchTransaction(protocolKit, apiKit, signer, transactionData, currentNonce);

        console.log(`\n✅ Transaction proposed successfully!`);
        console.log(`📄 File: ${filePath}`);
        console.log(`🔢 Nonce: ${currentNonce}`);
        console.log(`🔐 TX Hash: ${txHash}`);

        return txHash;
    } catch (error) {
        console.error('❌ Error proposing transaction:', error.message);
        throw error;
    }
}

/**
 * Main execution function
 */
async function main() {
    // Get private key from environment variable (from .env file or shell environment)
    const privateKey = process.env.PRIVATE_KEY;

    if (!privateKey) {
        console.error('❌ Error: PRIVATE_KEY is not set');
        console.log('\n💡 Two ways to provide your private key:');
        console.log('\n1. Using .env file (Recommended):');
        console.log('   - Copy .env.example to .env');
        console.log('   - Add your private key: PRIVATE_KEY=0x...');
        console.log('   - Run: node proposeSafeTransactions.js <mode> <path>');
        console.log('\n2. Using environment variable:');
        console.log('   - Run: PRIVATE_KEY=0x... node proposeSafeTransactions.js <mode> <path>');
        console.log('\n📖 Modes:');
        console.log('   single <file_path>  - Propose a single transaction file');
        console.log('   batch <directory>   - Propose all transaction files in a directory');
        console.log('\n🔢 Nonce Options (.env file):');
        console.log('   USE_QUEUE_NONCE=false  - Use current nonce (default, may overwrite pending txs)');
        console.log('   USE_QUEUE_NONCE=true   - Use queue nonce (appends to existing queue)');
        console.log('\n📝 Examples:');
        console.log('   node proposeSafeTransactions.js single ../X23/pushPayment/transactions_batch1.json');
        console.log('   node proposeSafeTransactions.js batch ../X23/pushPayment');
        console.log('   node proposeSafeTransactions.js batch ../X23/pushPayment 137');
        console.log('   USE_QUEUE_NONCE=true node proposeSafeTransactions.js batch ../X23/pushPayment');
        console.log('\n📌 Note: Safe address is automatically read from transaction files');
        process.exit(1);
    }

    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('❌ Error: Insufficient arguments');
        console.log('\n💡 Usage:');
        console.log('   node proposeSafeTransactions.js <mode> <path> [chainId]');
        console.log('\nModes:');
        console.log('   single <file_path>  - Propose a single transaction file');
        console.log('   batch <directory>   - Propose all transaction files in a directory');
        console.log('\nOptional:');
        console.log('   chainId - Override chain ID (default: 137 for Polygon)');
        console.log('\n🔢 Nonce Options (.env file):');
        console.log('   USE_QUEUE_NONCE=false  - Use current nonce (default, may overwrite pending txs)');
        console.log('   USE_QUEUE_NONCE=true   - Use queue nonce (appends to existing queue)');
        console.log('\n📌 Note: Safe address is automatically read from transaction files');
        process.exit(1);
    }

    const mode = args[0];
    const targetPath = args[1];

    // Optional: Override chain ID from command line
    const chainId = args[2] || CONFIG.CHAIN_ID;

    console.log('\n🚀 Starting Safe Transaction Proposer');
    console.log(`${'='.repeat(80)}\n`);

    try {
        if (mode === 'single') {
            await proposeSingleTransaction(targetPath, privateKey, chainId);
        } else if (mode === 'batch') {
            await proposeAllTransactions(targetPath, privateKey, chainId);
        } else {
            console.error(`❌ Error: Invalid mode "${mode}". Use "single" or "batch"`);
            process.exit(1);
        }

        console.log('\n✅ All operations completed successfully!');
    } catch (error) {
        console.error('\n❌ Operation failed:', error);
        process.exit(1);
    }
}

// Run the script
main();