const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Get the filename from command line argument or use default
const filename = process.argv[2] || './AKA.json';

// Read the JSON file
const transactionsData = JSON.parse(fs.readFileSync(filename, 'utf8'));

// Function to encode transaction data
function encodeTransactionData(contractMethod, contractInputsValues) {
    // Extract the method signature
    const methodSignature = contractMethod;

    // Create an interface with just this function
    const iface = new ethers.Interface([`function ${methodSignature}`]);

    // Get the function name (part before the parenthesis)
    const functionName = methodSignature.split('(')[0];

    // Encode the function call
    const encodedData = iface.encodeFunctionData(functionName, contractInputsValues);

    return encodedData;
}

console.log(`\n📄 Processing file: ${filename}\n`);

// Process each transaction
let correctedCount = 0;
transactionsData.transactions.forEach((tx, index) => {
    console.log(`Transaction ${index + 1}:`);
    console.log(`  Method: ${tx.contractMethod}`);
    console.log(`  Inputs: ${JSON.stringify(tx.contractInputsValues)}`);
    console.log(`  Old data: ${tx.data}`);

    try {
        const newData = encodeTransactionData(tx.contractMethod, tx.contractInputsValues);
        console.log(`  New data: ${newData}`);

        if (tx.data !== newData) {
            // Update the data field
            tx.data = newData;
            console.log('  ✅ Data corrected');
            correctedCount++;
        } else {
            console.log('  ✓ Data was already correct');
        }
    } catch (error) {
        console.error(`  ❌ Error encoding transaction ${index + 1}:`, error.message);
    }
    console.log('');
});

// Write the corrected data back to the file
fs.writeFileSync(filename, JSON.stringify(transactionsData, null, 4));

console.log(`✅ Processing complete!`);
console.log(`   - Total transactions: ${transactionsData.transactions.length}`);
console.log(`   - Corrected: ${correctedCount}`);
console.log(`   - File saved: ${filename}\n`);