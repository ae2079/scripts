import fs from 'fs';
import { ethers } from 'ethers';
import { on } from 'events';

const FUNCTION_SELECTORS = {
    approve: "0x095ea7b3",
    buy: "0xd6febde8",
    transfer: "0xa9059cbb",
    pushPayment: "0x8028b82f",
    removeAllPaymentReceiverPayments: "0xcb8e092f",
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

function buildTransactions(toAddress, userData, abcTokenAddress, start, cliff, end, addressToFilter, onlyFilteredUsers) {
    const transactions = [];

    // Checksum addresses to ensure proper format
    const checksummedToAddress = ethers.getAddress(toAddress);
    const checksummedTokenAddress = ethers.getAddress(abcTokenAddress);

    for (const user of userData) {
        const checksummedUserAddress = ethers.getAddress(user.address);
        let amountToPush = user.amount;

        if (addressToFilter.some(address => address.address.toLowerCase() === user.address.toLowerCase())) {
            console.log(`✅ Found matching address: ${checksummedUserAddress}`);
            console.log(`Deducting ${addressToFilter.find(address => address.address.toLowerCase() === user.address.toLowerCase()).amountToDeduct} from ${user.amount}`);
            const amountToDeduct = addressToFilter.find(address => address.address.toLowerCase() === user.address.toLowerCase()).amountToDeduct;
            amountToPush = (BigInt(user.amount) - BigInt(amountToDeduct)).toString();
            console.log(`💰 New amount after deduction: ${amountToPush}`);
            if (onlyFilteredUsers) {
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
                })
            }
        }
        if (!onlyFilteredUsers) {
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
            })
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
// CONFIGURATION - Update this file name as needed
// ============================================================================
const transactionFileName = "1.json"; // Transaction file to extract config and user data from

// The transaction file contains both configuration and user data:
// - projectName: root level
// - fundingPotMSAddress: inputs.projectConfig.SAFE
// - paymentRouterAddress: queries.addresses.paymentRouter
// - abcTokenAddress: queries.addresses.issuanceToken
// - userData: transactions.readable

// Read transaction file
console.log(`📄 Reading transaction file: ${transactionFileName}`);
const filesData = readTransactionFile(transactionFileName);

// Extract configuration from transaction file
let projectName = filesData.projectName;
const paymentRouterAddress = filesData.queries.addresses.paymentRouter;
const fundingPotMSAddress = filesData.inputs.projectConfig.SAFE;
const abcTokenAddress = filesData.queries.addresses.issuanceToken;

// Clean up project name - remove trailing '_S2' or '_'
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

console.log('\n✅ Project Configuration (extracted from transaction file):');
console.log(`   Project Name: ${projectName}`);
console.log(`   Safe Address: ${fundingPotMSAddress}`);
console.log(`   Payment Router: ${paymentRouterAddress}`);
console.log(`   Token Address: ${abcTokenAddress}`);

// Extract timing data from the first transaction
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

// Calculate new timing: start = originalStart + originalCliff, cliff = 0, end = originalEnd
const start = originalStart + originalCliff;
const cliff = 0;
const end = originalEnd;

console.log(`   Original Start: ${originalStart} (${new Date(originalStart * 1000).toISOString()})`);
console.log(`   Original Cliff: ${originalCliff} seconds (${Math.floor(originalCliff / 86400)} days)`);
console.log(`   Original End: ${originalEnd} (${new Date(originalEnd * 1000).toISOString()})`);
console.log(`   → New Start: ${start} (${new Date(start * 1000).toISOString()})`);
console.log(`   → New Cliff: ${cliff}`);
console.log(`   → New End: ${end} (${new Date(end * 1000).toISOString()})`);

// Extract user data from transaction file
const userData = getUserDataFromTransactions(filesData.transactions.readable);
console.log(`   Users Found: ${userData.length}\n`);

const addressToFilter = []
const onlyFilteredUsers = false;

generateTransactionJson(fundingPotMSAddress, projectName, paymentRouterAddress, userData, abcTokenAddress, start, cliff, end, addressToFilter, onlyFilteredUsers);
console.log("Done!");

// const testTx = {
//     "to": "0x513E116779a0E4645d262c3d78190B4cC6bB47Dd",
//     "functionSignature": "pushPayment(address,address,uint256,uint256,uint256,uint256)",
//     "inputValues": [
//         "0x313a58f11d8cf6f1667b7c8d615bd93b8c3f49cb",
//         "0xA3dd6163B5742B0D8Cb7d79CB5DFE3F81F8F8fC4",
//         "5875046400000000000000",
//         1734688800,
//         15724800,
//         1766224800
//     ]
// };

// const modifiedTestTx = {
//     "to": "0x513E116779a0E4645d262c3d78190B4cC6bB47Dd",
//     "functionSignature": "pushPayment(address,address,uint256,uint256,uint256,uint256)",
//     "inputValues": [
//         "0x313a58f11d8cf6f1667b7c8d615bd93b8c3f49cb",
//         "0xA3dd6163B5742B0D8Cb7d79CB5DFE3F81F8F8fC4",
//         "5875046400000000000000",
//         1750413600,
//         0,
//         1766224800
//     ]
// }