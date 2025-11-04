import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
    batchSize: 30, // Number of transactions per batch
    chainId: "137", // Polygon Mainnet (change as needed)
    csvFileName: "Vesting data change  - Season 1 & 2 cohorts q_acc projects - dist 1.csv",
    outputFolder: "./transactions",
    // Set your Safe address here or via environment variable
    safeAddress: process.env.SAFE_ADDRESS || "0x9298fD550E2c02AdeBf781e08214E4131CDeC44e", // Will be required
};

// ERC20 transfer function selector
const TRANSFER_SELECTOR = "0xa9059cbb";

/**
 * Reads and parses the CSV file
 */
function readCSV(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n');

        if (lines.length < 2) {
            throw new Error('CSV file must have at least a header and one data row');
        }

        // Parse header
        const headers = lines[0].split(',').map(h => h.trim());

        // Validate required columns
        const requiredColumns = ['token_type', 'token_address', 'receiver', 'amount'];
        for (const col of requiredColumns) {
            if (!headers.includes(col)) {
                throw new Error(`Missing required column: ${col}`);
            }
        }

        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });

            // Skip empty rows
            if (!row.receiver || !row.amount) {
                continue;
            }

            data.push(row);
        }

        console.log(`✅ Successfully parsed CSV file: ${filePath}`);
        console.log(`📊 Found ${data.length} distribution records`);
        return data;
    } catch (error) {
        console.error(`❌ Error reading CSV file:`, error.message);
        throw error;
    }
}

/**
 * Builds a transaction object for a single distribution
 */
function buildTransaction(row) {
    const receiver = ethers.getAddress(row.receiver); // Checksum address
    const amount = parseFloat(row.amount);

    if (isNaN(amount) || amount <= 0) {
        throw new Error(`Invalid amount for receiver ${receiver}: ${row.amount}`);
    }

    // Convert amount to wei
    const amountInWei = ethers.parseEther(amount.toString());

    // Check if it's a native token transfer or ERC20 transfer
    const isNative = row.token_type.toLowerCase() === 'native' || !row.token_address || row.token_address.trim() === '';

    if (isNative) {
        // Native token transfer: send ETH/MATIC directly
        return {
            to: receiver,
            value: amountInWei.toString(),
            data: "0x", // Empty data for native transfers
        };
    } else {
        // ERC20 token transfer: call transfer function
        const tokenAddress = ethers.getAddress(row.token_address);
        const transferData = TRANSFER_SELECTOR + ethers.AbiCoder.defaultAbiCoder()
            .encode(["address", "uint256"], [receiver, amountInWei])
            .slice(2); // Remove '0x' prefix

        return {
            to: tokenAddress,
            value: "0",
            data: transferData,
            contractMethod: "transfer(address,uint256)",
            contractInputsValues: [receiver, amountInWei.toString()],
        };
    }
}

/**
 * Generates transaction JSON files from CSV data
 */
function generateTransactionFiles(csvData, safeAddress) {
    // Validate Safe address
    if (!safeAddress) {
        throw new Error('Safe address is required. Set SAFE_ADDRESS environment variable or update CONFIG.safeAddress');
    }

    const checksummedSafeAddress = ethers.getAddress(safeAddress);
    const totalRecords = csvData.length;
    const totalBatches = Math.ceil(totalRecords / CONFIG.batchSize);
    const currentTimestamp = Date.now();

    // Create output folder if it doesn't exist
    if (!fs.existsSync(CONFIG.outputFolder)) {
        fs.mkdirSync(CONFIG.outputFolder, { recursive: true });
        console.log(`📁 Created output folder: ${CONFIG.outputFolder}`);
    }

    // Group by token type to separate batches
    const nativeTransfers = [];
    const erc20Transfers = {};

    for (const row of csvData) {
        const isNative = row.token_type.toLowerCase() === 'native' || !row.token_address || row.token_address.trim() === '';

        if (isNative) {
            nativeTransfers.push(row);
        } else {
            const tokenAddress = row.token_address.toLowerCase();
            if (!erc20Transfers[tokenAddress]) {
                erc20Transfers[tokenAddress] = [];
            }
            erc20Transfers[tokenAddress].push(row);
        }
    }

    let fileCount = 0;

    // Process native transfers
    if (nativeTransfers.length > 0) {
        console.log(`\n💰 Processing ${nativeTransfers.length} native token transfers...`);

        for (let batchIndex = 0; batchIndex < Math.ceil(nativeTransfers.length / CONFIG.batchSize); batchIndex++) {
            const startIndex = batchIndex * CONFIG.batchSize;
            const endIndex = Math.min(startIndex + CONFIG.batchSize, nativeTransfers.length);
            const batchRows = nativeTransfers.slice(startIndex, endIndex);

            const transactions = batchRows.map(row => {
                try {
                    return buildTransaction(row);
                } catch (error) {
                    console.error(`⚠️  Error building transaction for ${row.receiver}:`, error.message);
                    return null;
                }
            }).filter(tx => tx !== null);

            if (transactions.length > 0) {
                const transactionData = {
                    version: "1.0",
                    chainId: CONFIG.chainId,
                    createdAt: currentTimestamp,
                    meta: {
                        name: `[TOKEN-DISTRIBUTION]-[NATIVE]-[BATCH-${batchIndex + 1}]`,
                        description: `Native token distribution batch ${batchIndex + 1} of ${Math.ceil(nativeTransfers.length / CONFIG.batchSize)}`,
                        txBuilderVersion: "",
                        createdFromSafeAddress: checksummedSafeAddress,
                        createdFromOwnerAddress: "",
                        checksum: ""
                    },
                    transactions
                };

                const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
                const filename = `transactions_native_batch${batchIndex + 1}_${timestamp}.json`;
                const filePath = path.join(CONFIG.outputFolder, filename);

                fs.writeFileSync(filePath, JSON.stringify(transactionData, null, 2));
                console.log(`✅ Generated: ${filename} (${transactions.length} transactions)`);
                fileCount++;
            }
        }
    }

    // Process ERC20 transfers (grouped by token address)
    for (const [tokenAddress, rows] of Object.entries(erc20Transfers)) {
        console.log(`\n🪙 Processing ${rows.length} ERC20 transfers for token ${tokenAddress}...`);

        for (let batchIndex = 0; batchIndex < Math.ceil(rows.length / CONFIG.batchSize); batchIndex++) {
            const startIndex = batchIndex * CONFIG.batchSize;
            const endIndex = Math.min(startIndex + CONFIG.batchSize, rows.length);
            const batchRows = rows.slice(startIndex, endIndex);

            const transactions = batchRows.map(row => {
                try {
                    return buildTransaction(row);
                } catch (error) {
                    console.error(`⚠️  Error building transaction for ${row.receiver}:`, error.message);
                    return null;
                }
            }).filter(tx => tx !== null);

            if (transactions.length > 0) {
                const checksummedTokenAddress = ethers.getAddress(tokenAddress);
                const transactionData = {
                    version: "1.0",
                    chainId: CONFIG.chainId,
                    createdAt: currentTimestamp,
                    meta: {
                        name: `[TOKEN-DISTRIBUTION]-[ERC20-${checksummedTokenAddress.slice(0, 10)}]-[BATCH-${batchIndex + 1}]`,
                        description: `ERC20 token distribution batch ${batchIndex + 1} for token ${checksummedTokenAddress}`,
                        txBuilderVersion: "",
                        createdFromSafeAddress: checksummedSafeAddress,
                        createdFromOwnerAddress: "",
                        checksum: ""
                    },
                    transactions
                };

                const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
                const tokenShort = checksummedTokenAddress.slice(2, 8);
                const filename = `transactions_erc20_${tokenShort}_batch${batchIndex + 1}_${timestamp}.json`;
                const filePath = path.join(CONFIG.outputFolder, filename);

                fs.writeFileSync(filePath, JSON.stringify(transactionData, null, 2));
                console.log(`✅ Generated: ${filename} (${transactions.length} transactions)`);
                fileCount++;
            }
        }
    }

    console.log(`\n✨ Total files generated: ${fileCount}`);
    return fileCount;
}

/**
 * Main function
 */
function main() {
    console.log('🚀 Starting token distribution transaction generator...\n');

    try {
        // Get Safe address from config or environment
        const safeAddress = CONFIG.safeAddress || process.env.SAFE_ADDRESS;

        if (!safeAddress) {
            console.error('❌ Error: Safe address is required');
            console.error('   Set it via environment variable: SAFE_ADDRESS=0x... node generateDistributions.js');
            console.error('   Or update CONFIG.safeAddress in the script');
            process.exit(1);
        }

        // Resolve CSV file path
        const csvFilePath = path.join(__dirname, CONFIG.csvFileName);

        if (!fs.existsSync(csvFilePath)) {
            console.error(`❌ Error: CSV file not found: ${csvFilePath}`);
            process.exit(1);
        }

        // Read and parse CSV
        const csvData = readCSV(csvFilePath);

        // Generate transaction files
        console.log(`\n📝 Safe Address: ${ethers.getAddress(safeAddress)}`);
        console.log(`📝 Chain ID: ${CONFIG.chainId}`);
        console.log(`📝 Batch Size: ${CONFIG.batchSize}\n`);

        const fileCount = generateTransactionFiles(csvData, safeAddress);

        console.log(`\n✅ Successfully generated ${fileCount} transaction file(s)!`);
        console.log(`📁 Output folder: ${path.resolve(CONFIG.outputFolder)}`);
        console.log('\n💡 Next steps:');
        console.log('   1. Review the generated transaction files');
        console.log('   2. Use SafeTransactionProposer to propose them to your Safe');
        console.log('   3. Or import them directly into Safe Transaction Builder UI');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the script
main();