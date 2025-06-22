import fs from 'fs';
import { ethers } from 'ethers';

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

function getUserAddressesFromTransactions(transactions) {
    const userAddresses = [];
    for (const transaction of transactions) {
        for (const tx of transaction) {
            if (tx.functionSignature === "pushPayment(address,address,uint256,uint256,uint256,uint256)") {
                userAddresses.push(tx.inputValues[0]);
            }
        }
    }
    return userAddresses;
}

function buildTransactions(toAddress, client, userAddresses) {
    const transactions = [];
    for (const user of userAddresses) {
        transactions.push({
            to: toAddress,
            value: "0",
            data: FUNCTION_SELECTORS.removeAllPaymentReceiverPayments + ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address"], [client, user]
            ).slice(2),
            contractMethod: "removeAllPaymentReceiverPayments(address,address)",
            contractInputsValues: [
                client,
                user,
            ]
        })
    }
    return transactions;
}


function generateTransactionJson(safe, projectName, paymentProcessor, client, userAddresses) {
    const batchSize = 25;
    const totalUsers = userAddresses.length;
    const totalBatches = Math.ceil(totalUsers / batchSize);
    const currentTimestamp = Date.now();

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min(startIndex + batchSize, totalUsers);
        const batchUsers = userAddresses.slice(startIndex, endIndex);

        const transactionData = {
            version: "1.0",
            chainId: "137", // Polygon Mainnet
            createdAt: currentTimestamp,
            meta: {
                name: `[REMOVE-PAYMENTS]-[${projectName}]-[QACC-ROUND-1]-[TX-${batchIndex}]`,
                description: `Batch ${batchIndex + 1} for ${projectName}`,
                txBuilderVersion: "",
                createdFromSafeAddress: safe,
                createdFromOwnerAddress: "",
                checksum: ""
            },
            transactions: buildTransactions(paymentProcessor, client, batchUsers, batchSize)
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
        const filename = `transactions_batch${batchIndex + 1}_${timestamp}.json`;
        fs.writeFileSync(filename, JSON.stringify(transactionData, null, 2));
        console.log(`Transaction file generated: ${filename}`);
    }
}



const projectName = 'AKARAN';
const paymentProcessor = "0xDE1811172756feb79a4c937246B320d36615C184";
const paymentRouterAddress = "0x9858b8FeE34F27959e3CDFAf022a5D0844eaeA65";
const fundingPotMSAddress = "0x473C36457e2c134837937F7C20aA0aBaf78210c3";

// test
const userAddress = "0x313a58f11d8cf6f1667b7c8d615bd93b8c3f49cb";

// generateTransactionJson(fundingPotMSAddress, projectName, paymentProcessor, paymentRouterAddress, userAddress);

const filesData = readTransactionFile("4.json");
const userAddresses = getUserAddressesFromTransactions(filesData.transactions.readable);

generateTransactionJson(fundingPotMSAddress, projectName, paymentProcessor, paymentRouterAddress, userAddresses);
console.log("Done!");