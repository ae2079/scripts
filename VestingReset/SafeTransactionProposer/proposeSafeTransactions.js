import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import Safe from '@safe-global/protocol-kit';
import SafeApiKit from '@safe-global/api-kit';

/**
 * Configuration
 * Update these values according to your needs
 */
const CONFIG = {
    CHAIN_ID: '137', // Polygon Mainnet
    RPC_URL: 'https://polygon-rpc.com', // Or use your preferred RPC
    SAFE_ADDRESS: '0xe077bC743b10833cC938cd5700F92316d5dA11Bf', // Your Safe address
    // PRIVATE_KEY should be set via environment variable for security
};

/**
 * Reads a transaction JSON file and returns the parsed data
 */
function readTransactionFile(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const transactionData = JSON.parse(data);
        console.log(`✅ Successfully read transaction file: ${filePath}`);
        console.log(`📊 Found ${transactionData.transactions.length} transactions`);
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
        const protocolKit = await Safe.default.create({
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
        throw error;
    }
}

/**
 * Proposes a batch of transactions to the Safe
 */
async function proposeBatchTransaction(protocolKit, apiKit, signer, transactionData) {
    try {
        console.log(`\n📝 Proposing transaction batch: ${transactionData.meta.name}`);
        console.log(`📊 Number of transactions in batch: ${transactionData.transactions.length}`);
        
        // Format transactions for Safe SDK
        const safeTransactions = transactionData.transactions.map(tx => ({
            to: tx.to,
            value: tx.value || '0',
            data: tx.data,
            operation: 0 // 0 = Call, 1 = DelegateCall
        }));
        
        // Create Safe transaction
        const safeTransaction = await protocolKit.createTransaction({
            transactions: safeTransactions
        });
        
        // Get the transaction hash
        const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
        console.log(`🔐 Transaction hash: ${safeTxHash}`);
        
        // Sign the transaction
        const signature = await protocolKit.signHash(safeTxHash);
        console.log(`✍️  Transaction signed`);
        
        // Propose the transaction to the Safe service
        await apiKit.proposeTransaction({
            safeAddress: await protocolKit.getAddress(),
            safeTransactionData: safeTransaction.data,
            safeTxHash: safeTxHash,
            senderAddress: signer.address,
            senderSignature: signature.data,
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
async function proposeAllTransactions(directoryPath, privateKey, safeAddress, chainId, delayBetweenBatches = 2000) {
    try {
        // Read all transaction files
        const transactionFiles = readAllTransactionFiles(directoryPath);
        
        if (transactionFiles.length === 0) {
            console.log('⚠️  No transaction files found to propose');
            return;
        }
        
        // Initialize Safe SDK
        const { protocolKit, apiKit, signer } = await initializeSafe(privateKey, safeAddress, chainId);
        
        // Verify signer is an owner of the Safe
        const owners = await protocolKit.getOwners();
        if (!owners.includes(signer.address)) {
            throw new Error(`❌ Signer ${signer.address} is not an owner of Safe ${safeAddress}`);
        }
        console.log(`✅ Verified: Signer is an owner of the Safe`);
        
        // Propose each transaction batch
        const results = [];
        for (let i = 0; i < transactionFiles.length; i++) {
            const file = transactionFiles[i];
            console.log(`\n${'='.repeat(80)}`);
            console.log(`📄 Processing file ${i + 1}/${transactionFiles.length}: ${file.filename}`);
            console.log(`${'='.repeat(80)}`);
            
            try {
                const txHash = await proposeBatchTransaction(protocolKit, apiKit, signer, file.data);
                results.push({
                    filename: file.filename,
                    status: 'success',
                    txHash: txHash
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
                    error: error.message
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
                console.log(`     TX Hash: ${result.txHash}`);
            } else {
                console.log(`  ${index + 1}. ❌ ${result.filename}`);
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
async function proposeSingleTransaction(filePath, privateKey, safeAddress, chainId) {
    try {
        // Read the transaction file
        const transactionData = readTransactionFile(filePath);
        
        // Initialize Safe SDK
        const { protocolKit, apiKit, signer } = await initializeSafe(privateKey, safeAddress, chainId);
        
        // Verify signer is an owner of the Safe
        const owners = await protocolKit.getOwners();
        if (!owners.includes(signer.address)) {
            throw new Error(`❌ Signer ${signer.address} is not an owner of Safe ${safeAddress}`);
        }
        console.log(`✅ Verified: Signer is an owner of the Safe`);
        
        // Propose the transaction
        const txHash = await proposeBatchTransaction(protocolKit, apiKit, signer, transactionData);
        
        console.log(`\n✅ Transaction proposed successfully!`);
        console.log(`📄 File: ${filePath}`);
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
    // Get private key from environment variable
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey) {
        console.error('❌ Error: PRIVATE_KEY environment variable is not set');
        console.log('\n💡 Usage:');
        console.log('   PRIVATE_KEY=0x... node proposeSafeTransactions.js <mode> <path>');
        console.log('\nModes:');
        console.log('   single <file_path>  - Propose a single transaction file');
        console.log('   batch <directory>   - Propose all transaction files in a directory');
        console.log('\nExamples:');
        console.log('   PRIVATE_KEY=0x... node proposeSafeTransactions.js single ./X23/pushPayment/transactions_X23_batch1_20251012_0000.json');
        console.log('   PRIVATE_KEY=0x... node proposeSafeTransactions.js batch ./X23/pushPayment');
        process.exit(1);
    }
    
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.error('❌ Error: Insufficient arguments');
        console.log('\n💡 Usage:');
        console.log('   node proposeSafeTransactions.js <mode> <path>');
        console.log('\nModes:');
        console.log('   single <file_path>  - Propose a single transaction file');
        console.log('   batch <directory>   - Propose all transaction files in a directory');
        process.exit(1);
    }
    
    const mode = args[0];
    const targetPath = args[1];
    
    // Optional: Override Safe address from command line
    const safeAddress = args[2] || CONFIG.SAFE_ADDRESS;
    const chainId = args[3] || CONFIG.CHAIN_ID;
    
    console.log('\n🚀 Starting Safe Transaction Proposer');
    console.log(`${'='.repeat(80)}\n`);
    
    try {
        if (mode === 'single') {
            await proposeSingleTransaction(targetPath, privateKey, safeAddress, chainId);
        } else if (mode === 'batch') {
            await proposeAllTransactions(targetPath, privateKey, safeAddress, chainId);
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

