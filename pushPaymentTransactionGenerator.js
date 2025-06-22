import fs from 'fs';
import { ethers } from 'ethers';

const FUNCTION_SELECTORS = {
    approve: "0x095ea7b3",
    buy: "0xd6febde8",
    transfer: "0xa9059cbb",
    pushPayment: "0x8028b82f"
};

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

const schema = {
    "to": "0x513E116779a0E4645d262c3d78190B4cC6bB47Dd", // payment router address
    "functionSignature": "pushPayment(address,address,uint256,uint256,uint256,uint256)",
    "inputValues": [
        "0x147b2106ef7a11d4de36423dcafbd12564a24514",
        "0xA3dd6163B5742B0D8Cb7d79CB5DFE3F81F8F8fC4",
        "2812288400000000000000",
        1734688800,
        15724800,
        1766224800
    ]
};

/**
 * Modify specific variables in the transaction data
 * @param {Object} transactionData - Original transaction data
 * @param {Object} modifications - Object containing modifications to apply
 * @returns {Object} - Modified transaction data
 */
function modifyTransactionData(transactionData, modifications) {
    const modifiedData = JSON.parse(JSON.stringify(transactionData)); // Deep copy

    console.log("🔧 Applying modifications...");

    // Update individual transactions
    if (modifications.transactions) {
        modifications.transactions.forEach((mod, index) => {
            if (index < modifiedData.transactions.length) {
                const tx = modifiedData.transactions[index];

                // Update transaction address if provided
                if (mod.to) {
                    tx.to = mod.to;
                    console.log(`📝 Updated transaction ${index} 'to' address to: ${mod.to}`);
                }

                // Update value if provided
                if (mod.value !== undefined) {
                    tx.value = mod.value;
                    console.log(`📝 Updated transaction ${index} value to: ${mod.value}`);
                }

                // Update contract inputs if provided
                if (mod.contractInputsValues) {
                    tx.contractInputsValues = mod.contractInputsValues;
                    console.log(`📝 Updated transaction ${index} contract inputs`);

                    // Re-encode the data based on the contract method
                    if (tx.contractMethod) {
                        tx.data = reEncodeTransactionData(tx.contractMethod, mod.contractInputsValues);
                        console.log(`📝 Re-encoded transaction ${index} data`);
                    }
                }
            }
        });
    }

    // Update timestamp
    modifiedData.createdAt = Date.now();
    console.log(`📝 Updated timestamp to: ${modifiedData.createdAt}`);

    return modifiedData;
}


// const incoded = {
//     to: paymentRouterAddress,
//     value: "0",
//     data: FUNCTION_SELECTORS.pushPayment + ethers.AbiCoder.defaultAbiCoder().encode(
//         ["address", "address", "uint256", "uint256", "uint256", "uint256"], [userAddress, abcTokenAddress, ABCTokenAmount, start, cliff, end]
//     ).slice(2),
//     contractMethod: "pushPayment(address,address,uint256,uint256,uint256,uint256)",
//     contractInputsValues: [
//         userAddress,
//         abcTokenAddress,
//         ABCTokenAmount,
//         start.toString(),
//         cliff.toString(),
//         end.toString()
//     ]
// };

const filesData = readTransactionFile("4.json")
console.log("filesData:", JSON.stringify(filesData, null, 2));

const testTx = {
    "to": "0x513E116779a0E4645d262c3d78190B4cC6bB47Dd",
    "functionSignature": "pushPayment(address,address,uint256,uint256,uint256,uint256)",
    "inputValues": [
        "0x313a58f11d8cf6f1667b7c8d615bd93b8c3f49cb",
        "0xA3dd6163B5742B0D8Cb7d79CB5DFE3F81F8F8fC4",
        "5875046400000000000000",
        1734688800,
        15724800,
        1766224800
    ]
};

const modifiedTestTx = {
    "to": "0x513E116779a0E4645d262c3d78190B4cC6bB47Dd",
    "functionSignature": "pushPayment(address,address,uint256,uint256,uint256,uint256)",
    "inputValues": [
        "0x313a58f11d8cf6f1667b7c8d615bd93b8c3f49cb",
        "0xA3dd6163B5742B0D8Cb7d79CB5DFE3F81F8F8fC4",
        "5875046400000000000000",
        1750413600,
        0,
        1766224800
    ]
}


function generateTransactionJson(fundingPotMSAddress, projectName, ABCTokenAmount, paymentRouterAddress, userAddress, abcTokenAddress, start, cliff, end) {
    // Current timestamp in milliseconds
    const currentTimestamp = Date.now();

    // Create the transaction structure
    const transactionData = {
        version: "1.0",
        chainId: "137", // Polygon Mainnet
        createdAt: currentTimestamp,
        meta: {
            name: `[TEST]-[${projectName}]-[MODIFY-STREAM-DATES]-[TX-0]`,
            description: `Batch 1 for ${projectName}`,
            txBuilderVersion: "",
            createdFromSafeAddress: fundingPotMSAddress,
            createdFromOwnerAddress: "",
            checksum: ""
        },
        transactions: [{
            to: paymentRouterAddress,
            value: "0",
            data: FUNCTION_SELECTORS.pushPayment + ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256", "uint256", "uint256", "uint256"], [userAddress, abcTokenAddress, ABCTokenAmount, start, cliff, end]
            ).slice(2),
            contractMethod: "pushPayment(address,address,uint256,uint256,uint256,uint256)",
            contractInputsValues: [
                userAddress,
                abcTokenAddress,
                ABCTokenAmount,
                start.toString(),
                cliff.toString(),
                end.toString()
            ]
        }]
    };

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
    const filename = `transactions_${timestamp}.json`;

    // Write to JSON file
    fs.writeFileSync(filename, JSON.stringify(transactionData, null, 2));
    console.log(`Transaction file generated: ${filename}`);
}

// const paymentRouterAddress = "0x513E116779a0E4645d262c3d78190B4cC6bB47Dd";
const paymentRouterAddress = "0x9858b8FeE34F27959e3CDFAf022a5D0844eaeA65"; // client address for AKARAN
const projectName = "AKARAN";
// const fundingPotMSAddress = "0x473c36457e2c134837937f7c20aa0abaf78210c3";
const fundingPotMSAddress = "0x9298fD550E2c02AdeBf781e08214E4131CDeC44e"; // workflow admin MS address
const abcTokenAddress = "0xA3dd6163B5742B0D8Cb7d79CB5DFE3F81F8F8fC4";
const start = 1750413600;
const cliff = 0;
const end = 1766224800;

// test data
const userAddress = "0x313a58f11d8cf6f1667b7c8d615bd93b8c3f49cb";
const tokenAmount = "2920372185390563165906";


generateTransactionJson(fundingPotMSAddress, projectName, tokenAmount, paymentRouterAddress, userAddress, abcTokenAddress, start, cliff, end);