import fs from 'fs';
import path from 'path';

/**
 * Find the latest CSV file in a directory
 */
function findLatestCSV(directory) {
    const files = fs.readdirSync(directory)
        .filter(file => file.endsWith('.csv'))
        .map(file => ({
            name: file,
            path: path.join(directory, file),
            time: fs.statSync(path.join(directory, file)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
        throw new Error(`No CSV files found in ${directory}`);
    }

    return files[0].path;
}

/**
 * Normalize address to lowercase
 */
function normalizeAddress(address) {
    return address.replace(/"/g, '').toLowerCase().trim();
}

/**
 * Parse balance from token holders CSV (removes commas and converts to BigInt)
 * Format: "5,484,185.27184050100213061" -> 5484185271840501002130610000000000000n (assuming 18 decimals)
 */
function parseTokenBalance(balanceStr) {
    // Remove quotes and commas
    const cleanBalance = balanceStr.replace(/"/g, '').replace(/,/g, '');

    // Check if it has decimal places
    if (cleanBalance.includes('.')) {
        // Split by decimal point
        const [whole, decimal] = cleanBalance.split('.');
        // Pad decimal to 18 places (token decimals) and truncate if longer
        const decimalPadded = decimal.padEnd(18, '0').slice(0, 18);
        return BigInt(whole + decimalPadded);
    } else {
        // No decimal, assume 18 decimals
        return BigInt(cleanBalance + '0'.repeat(18));
    }
}

/**
 * Read stream data CSV
 * Format: address,totalStreams,totalClaimed,totalRemaining
 */
function readStreamDataCSV(filePath) {
    console.log(`📖 Reading stream data from: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    const data = {};

    // Skip header
    for (let i = 1; i < lines.length; i++) {
        const [address, totalStreams, totalClaimed, totalRemaining] = lines[i].split(',');
        const normalizedAddress = normalizeAddress(address);

        data[normalizedAddress] = {
            address: normalizedAddress,
            totalStreams: parseInt(totalStreams) || 0,
            totalClaimed: BigInt(totalClaimed || '0'),
            totalRemaining: BigInt(totalRemaining || '0')
        };
    }

    console.log(`   ✅ Loaded ${Object.keys(data).length} addresses from stream data`);
    return data;
}

/**
 * Read token holders CSV
 * Format: "HolderAddress","Balance","PendingBalanceUpdate"
 */
function readTokenHoldersCSV(filePath) {
    console.log(`📖 Reading token holders from: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    const data = {};

    // Skip header
    for (let i = 1; i < lines.length; i++) {
        // Parse CSV line (handling quoted values)
        const matches = lines[i].match(/"([^"]+)","([^"]+)","([^"]+)"/);
        if (matches) {
            const [, address, balance, pendingUpdate] = matches;
            const normalizedAddress = normalizeAddress(address);

            data[normalizedAddress] = {
                address: normalizedAddress,
                balance: parseTokenBalance(balance),
                pendingBalanceUpdate: pendingUpdate
            };
        }
    }

    console.log(`   ✅ Loaded ${Object.keys(data).length} addresses from token holders`);
    return data;
}

/**
 * Combine stream data and token holders data
 */
function combineData(streamData, tokenHolders, projectName) {
    console.log(`\n🔄 Combining data...`);

    // Get all unique addresses from both datasets
    const allAddresses = new Set([
        ...Object.keys(streamData),
        ...Object.keys(tokenHolders)
    ]);

    console.log(`   📊 Total unique addresses: ${allAddresses.size}`);

    const combinedData = [];

    for (const address of allAddresses) {
        const stream = streamData[address] || {
            address,
            totalStreams: 0,
            totalClaimed: BigInt(0),
            totalRemaining: BigInt(0)
        };

        const holder = tokenHolders[address] || {
            address,
            balance: BigInt(0),
            pendingBalanceUpdate: 'No'
        };

        // Calculate total: token balance + total remaining from streams
        const totalBalance = holder.balance + stream.totalRemaining;

        combinedData.push({
            address,
            tokenBalance: holder.balance.toString(),
            streamRemaining: stream.totalRemaining.toString(),
            totalBalance: totalBalance.toString(),
            totalStreams: stream.totalStreams,
            totalClaimed: stream.totalClaimed.toString(),
            hasStreamData: !!streamData[address],
            hasTokenBalance: !!tokenHolders[address]
        });
    }

    // Sort by total balance (descending)
    combinedData.sort((a, b) => {
        const aTotal = BigInt(a.totalBalance);
        const bTotal = BigInt(b.totalBalance);
        return aTotal > bTotal ? -1 : aTotal < bTotal ? 1 : 0;
    });

    return combinedData;
}

/**
 * Save combined data to CSV
 */
function saveCombinedCSV(data, projectName, outputPath) {
    console.log(`\n💾 Saving combined data to: ${outputPath}`);

    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // CSV header
    const csvHeader = 'address,tokenBalance,streamRemaining,totalBalance,totalStreams,totalClaimed,hasStreamData,hasTokenBalance\n';

    // CSV rows
    const csvRows = data.map(row =>
        `${row.address},${row.tokenBalance},${row.streamRemaining},${row.totalBalance},${row.totalStreams},${row.totalClaimed},${row.hasStreamData},${row.hasTokenBalance}`
    );

    const csvContent = csvHeader + csvRows.join('\n');
    fs.writeFileSync(outputPath, csvContent, 'utf8');

    console.log(`   ✅ Saved ${data.length} addresses to CSV`);

    return outputPath;
}

/**
 * Main execution
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node combineStreamAndHolders.js <projectName> [streamDataDir] [tokenHoldersPath] [outputPath]');
        console.log('\nExample:');
        console.log('  node combineStreamAndHolders.js X23');
        console.log('  node combineStreamAndHolders.js X23 X23/streamData X23/tokenHolders/export-tokenholders-for-x23ai.csv');
        process.exit(1);
    }

    const projectName = args[0];
    const streamDataDir = args[1] || `${projectName}/streamData`;
    const tokenHoldersPath = args[2] || `${projectName}/tokenHolders/export-tokenholders-for-x23ai.csv`;
    const outputPath = args[3] || `${projectName}/combined_data_${projectName}_${new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15)}.csv`;

    try {
        console.log('🚀 Starting data combination...\n');
        console.log(`📍 Project: ${projectName}`);
        console.log(`📍 Stream Data Directory: ${streamDataDir}`);
        console.log(`📍 Token Holders File: ${tokenHoldersPath}\n`);

        // Find latest stream data CSV
        const latestStreamCSV = findLatestCSV(streamDataDir);
        console.log(`📅 Using latest stream data: ${path.basename(latestStreamCSV)}\n`);

        // Read both CSVs
        const streamData = readStreamDataCSV(latestStreamCSV);
        const tokenHolders = readTokenHoldersCSV(tokenHoldersPath);

        // Combine data
        const combinedData = combineData(streamData, tokenHolders, projectName);

        // Save to CSV
        saveCombinedCSV(combinedData, projectName, outputPath);

        // Print summary
        console.log('\n📊 Summary:');
        console.log(`   - Total addresses: ${combinedData.length}`);
        console.log(`   - Addresses with stream data: ${combinedData.filter(d => d.hasStreamData).length}`);
        console.log(`   - Addresses with token balance: ${combinedData.filter(d => d.hasTokenBalance).length}`);
        console.log(`   - Addresses with both: ${combinedData.filter(d => d.hasStreamData && d.hasTokenBalance).length}`);
        console.log(`   - Addresses only in stream data: ${combinedData.filter(d => d.hasStreamData && !d.hasTokenBalance).length}`);
        console.log(`   - Addresses only in token holders: ${combinedData.filter(d => !d.hasStreamData && d.hasTokenBalance).length}`);

        console.log('\n🎉 Combination complete!');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();