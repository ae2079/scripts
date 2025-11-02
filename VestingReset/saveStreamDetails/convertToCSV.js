import fs from 'fs';

/**
 * Convert stream data JSON to CSV
 * CSV columns: address, totalStreams, totalClaimed, totalRemaining
 */
function convertStreamDataToCSV(jsonFilePath, outputCsvPath) {
    console.log(`📖 Reading stream data from: ${jsonFilePath}`);

    // Read and parse JSON file
    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    console.log(`✅ Loaded data for ${jsonData.totalUsers} users`);

    // Prepare CSV rows
    const csvRows = [];

    // CSV header
    csvRows.push('address,totalStreams,totalClaimed,totalRemaining');

    // Process each user
    for (const [userAddress, userData] of Object.entries(jsonData.users)) {
        let totalClaimed = BigInt(0);
        let totalRemaining = BigInt(0);

        // Calculate totals from all streams
        if (userData.streams && Array.isArray(userData.streams)) {
            for (const stream of userData.streams) {
                // Skip streams with errors
                if (stream.releasable === "ERROR") {
                    console.warn(`   ⚠️  Skipping stream ${stream.streamId} for ${userAddress} due to error`);
                    continue;
                }

                // Sum up released (claimed) amounts
                const released = BigInt(stream.released || "0");
                totalClaimed += released;

                // Sum up releasable (remaining) amounts
                const releasable = BigInt(stream.releasable || "0");
                totalRemaining += releasable;
            }
        }

        // Convert BigInt values to string for CSV
        const totalStreams = userData.totalStreams || 0;
        const totalClaimedStr = totalClaimed.toString();
        const totalRemainingStr = totalRemaining.toString();

        // Add CSV row (address is already lowercase from JSON)
        csvRows.push(`${userData.address},${totalStreams},${totalClaimedStr},${totalRemainingStr}`);
    }

    // Write CSV file
    const csvContent = csvRows.join('\n');
    fs.writeFileSync(outputCsvPath, csvContent, 'utf8');

    console.log(`\n✅ CSV file created: ${outputCsvPath}`);
    console.log(`📊 Processed ${csvRows.length - 1} users (excluding header)`);

    return outputCsvPath;
}

// Main execution
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node convertToCSV.js <input-json-file> [output-csv-file]');
        console.log('\nExample:');
        console.log('  node convertToCSV.js X23/streamData/stream_data_X23_2025-11-02_1509.json');
        console.log('  node convertToCSV.js X23/streamData/stream_data_X23_2025-11-02_1509.json output.csv');
        process.exit(1);
    }

    const inputFile = args[0];
    let outputFile = args[1];

    // If no output file specified, generate one from input filename
    if (!outputFile) {
        const inputPath = inputFile.split('/');
        const inputFilename = inputPath[inputPath.length - 1];
        const outputDir = inputPath.slice(0, -1).join('/');
        const baseName = inputFilename.replace('.json', '');
        outputFile = outputDir ? `${outputDir}/${baseName}.csv` : `${baseName}.csv`;
    }

    try {
        convertStreamDataToCSV(inputFile, outputFile);
        console.log('\n🎉 Conversion complete!');
    } catch (error) {
        console.error('\n❌ Error converting to CSV:', error.message);
        process.exit(1);
    }
}

main();