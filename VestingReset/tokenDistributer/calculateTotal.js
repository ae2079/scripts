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
    transactionsFolder: "./transactions",
    chainId: "137", // Polygon Mainnet (for display purposes)
    nativeTokenSymbol: "MATIC", // Change if needed
};

/**
 * Reads all transaction JSON files from the transactions folder
 */
function readTransactionFiles(folderPath) {
    try {
        if (!fs.existsSync(folderPath)) {
            throw new Error(`Transactions folder not found: ${folderPath}`);
        }

        const files = fs.readdirSync(folderPath)
            .filter(file => file.endsWith('.json'))
            .map(file => path.join(folderPath, file));

        if (files.length === 0) {
            throw new Error(`No JSON files found in ${folderPath}`);
        }

        console.log(`📁 Found ${files.length} transaction file(s)`);
        return files;
    } catch (error) {
        console.error(`❌ Error reading transaction files:`, error.message);
        throw error;
    }
}

/**
 * Parses a transaction and extracts the amount
 */
function parseTransactionAmount(transaction) {
    // For native token transfers, amount is in the 'value' field
    if (transaction.value && transaction.value !== "0") {
        return {
            type: 'native',
            amount: BigInt(transaction.value),
            to: transaction.to,
        };
    }

    // For ERC20 transfers, amount is encoded in the 'data' field
    if (transaction.data && transaction.data !== "0x" && transaction.data.length > 10) {
        try {
            // ERC20 transfer function selector: 0xa9059cbb
            // Data format: 0xa9059cbb + address(32 bytes) + amount(32 bytes)
            const transferSelector = "0xa9059cbb";
            if (transaction.data.startsWith(transferSelector)) {
                const encodedData = transaction.data.slice(10); // Remove selector
                const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                    ["address", "uint256"],
                    "0x" + encodedData
                );
                return {
                    type: 'erc20',
                    amount: BigInt(decoded[1].toString()),
                    to: decoded[0], // recipient address
                    tokenAddress: transaction.to, // token contract address
                };
            }
        } catch (error) {
            // If decoding fails, it's not a standard ERC20 transfer
            console.warn(`⚠️  Could not decode transaction data for ${transaction.to}:`, error.message);
        }
    }

    return null;
}

/**
 * Calculates totals from all transaction files
 */
function calculateTotals(transactionFiles) {
    const totals = {
        native: {
            total: BigInt(0),
            count: 0,
            transactions: [],
        },
        erc20: {}, // tokenAddress -> { total, count, transactions }
    };

    let totalFiles = 0;
    let totalTransactions = 0;

    for (const filePath of transactionFiles) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const transactionData = JSON.parse(content);

            if (!transactionData.transactions || !Array.isArray(transactionData.transactions)) {
                console.warn(`⚠️  Skipping file ${path.basename(filePath)}: invalid format`);
                continue;
            }

            totalFiles++;
            const transactions = transactionData.transactions;

            for (const tx of transactions) {
                const parsed = parseTransactionAmount(tx);

                if (!parsed) {
                    continue; // Skip transactions we can't parse
                }

                totalTransactions++;

                if (parsed.type === 'native') {
                    totals.native.total += parsed.amount;
                    totals.native.count++;
                    totals.native.transactions.push({
                        to: parsed.to,
                        amount: parsed.amount,
                    });
                } else if (parsed.type === 'erc20') {
                    const tokenAddress = parsed.tokenAddress.toLowerCase();
                    if (!totals.erc20[tokenAddress]) {
                        totals.erc20[tokenAddress] = {
                            total: BigInt(0),
                            count: 0,
                            tokenAddress: parsed.tokenAddress,
                            transactions: [],
                        };
                    }
                    totals.erc20[tokenAddress].total += parsed.amount;
                    totals.erc20[tokenAddress].count++;
                    totals.erc20[tokenAddress].transactions.push({
                        to: parsed.to,
                        amount: parsed.amount,
                    });
                }
            }
        } catch (error) {
            console.error(`❌ Error processing file ${path.basename(filePath)}:`, error.message);
        }
    }

    return {
        totals,
        stats: {
            filesProcessed: totalFiles,
            transactionsProcessed: totalTransactions,
        },
    };
}

/**
 * Formats a BigInt amount for display
 */
function formatAmount(amount, decimals = 18) {
    const amountWei = amount.toString();
    const amountFormatted = ethers.formatUnits(amountWei, decimals);
    return {
        wei: amountWei,
        formatted: amountFormatted,
    };
}

/**
 * Main function
 */
function main() {
    console.log('🔢 Starting token amount calculator...\n');

    try {
        // Resolve transactions folder path
        const transactionsFolder = path.join(__dirname, CONFIG.transactionsFolder);

        // Read all transaction files
        const transactionFiles = readTransactionFiles(transactionsFolder);

        // Calculate totals
        console.log(`\n📊 Processing transaction files...`);
        const result = calculateTotals(transactionFiles);

        // Display results
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📈 SUMMARY`);
        console.log(`${'='.repeat(60)}`);
        console.log(`📁 Files Processed: ${result.stats.filesProcessed}`);
        console.log(`📝 Transactions Processed: ${result.stats.transactionsProcessed}`);
        console.log(`\n`);

        // Display native token totals
        if (result.totals.native.count > 0) {
            const nativeAmount = formatAmount(result.totals.native.total);
            console.log(`${'='.repeat(60)}`);
            console.log(`💰 NATIVE TOKEN (${CONFIG.nativeTokenSymbol})`);
            console.log(`${'='.repeat(60)}`);
            console.log(`Total Transactions: ${result.totals.native.count}`);
            console.log(`Total Amount (Wei): ${nativeAmount.wei}`);
            console.log(`Total Amount (${CONFIG.nativeTokenSymbol}): ${nativeAmount.formatted}`);
            console.log(`\n`);
        }

        // Display ERC20 token totals
        const erc20Tokens = Object.keys(result.totals.erc20);
        if (erc20Tokens.length > 0) {
            console.log(`${'='.repeat(60)}`);
            console.log(`🪙 ERC20 TOKENS`);
            console.log(`${'='.repeat(60)}`);

            for (const tokenAddress of erc20Tokens) {
                const tokenData = result.totals.erc20[tokenAddress];
                const tokenAmount = formatAmount(tokenData.total);
                console.log(`\nToken Address: ${tokenData.tokenAddress}`);
                console.log(`Total Transactions: ${tokenData.count}`);
                console.log(`Total Amount (Wei): ${tokenAmount.wei}`);
                console.log(`Total Amount (Tokens): ${tokenAmount.formatted}`);
            }
            console.log(`\n`);
        }

        // Grand total (if multiple token types)
        if (result.totals.native.count > 0 && erc20Tokens.length > 0) {
            console.log(`${'='.repeat(60)}`);
            console.log(`📊 GRAND TOTAL`);
            console.log(`${'='.repeat(60)}`);
            console.log(`Total Native Token Transactions: ${result.totals.native.count}`);
            console.log(`Total ERC20 Token Transactions: ${erc20Tokens.reduce((sum, addr) => sum + result.totals.erc20[addr].count, 0)}`);
            console.log(`Total All Transactions: ${result.stats.transactionsProcessed}`);
            console.log(`\n`);
        }

        console.log(`✅ Calculation complete!`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the script
main();