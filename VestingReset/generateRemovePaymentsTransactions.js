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

    // Create project folder and removePayment subfolder if they don't exist
    const projectFolder = `./${projectName}`;
    const removePaymentFolder = `${projectFolder}/removePayment`;

    if (!fs.existsSync(projectFolder)) {
        fs.mkdirSync(projectFolder, { recursive: true });
        console.log(`📁 Created project folder: ${projectFolder}`);
    }

    if (!fs.existsSync(removePaymentFolder)) {
        fs.mkdirSync(removePaymentFolder, { recursive: true });
        console.log(`📁 Created removePayment folder: ${removePaymentFolder}`);
    }

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
        const filePath = `${removePaymentFolder}/${filename}`;
        fs.writeFileSync(filePath, JSON.stringify(transactionData, null, 2));
        console.log(`Transaction file generated: ${filePath}`);
    }
}



const projectName = 'X23';
const paymentProcessor = "0xD6F574062E948d6B7F07c693f1b4240aFeA41657";
const paymentRouterAddress = "0x6B5d37c206D56B16F44b0C1b89002fd9B138e9Be";
const fundingPotMSAddress = "0xe077bC743b10833cC938cd5700F92316d5dA11Bf";

// test
const userAddress = "0x313a58f11d8cf6f1667b7c8d615bd93b8c3f49cb";

// generateTransactionJson(fundingPotMSAddress, projectName, paymentProcessor, paymentRouterAddress, userAddress);

const filesData = readTransactionFile("4.json");
const qaccUsers = getUserAddressesFromTransactions(filesData.transactions.readable);

const filesDataEA1 = readTransactionFile("1.json");
const ea1Users = getUserAddressesFromTransactions(filesDataEA1.transactions.readable);

const filesDataEA2 = readTransactionFile("2.json");
const ea2Users = getUserAddressesFromTransactions(filesDataEA2.transactions.readable);

const filesDataEA3 = readTransactionFile("3.json");
const ea3Users = getUserAddressesFromTransactions(filesDataEA3.transactions.readable);

const filesDataS2 = readTransactionFile("5.json");
const S2Users = getUserAddressesFromTransactions(filesDataS2.transactions.readable);

const teamsVestings = [
    "0x0D3edA53332b9fDf4d4e9FB4C1C940A80B16eD9D",
    "0x01b9F17e97dFb2e25581690e048d4fF8d0b788f3",
    "0xcE3848cDf3304CB71ef1615700EEe09E030559F9",
    "0x346e969567224490C54B8C8DB783b8D22ADFD5d5",
    "0x1a7ba55c069331a5079DF14CC8C2351589A0aCFA",
]

// Union all EA users and remove QACC users
const allEAUsers = [...new Set([...ea1Users, ...ea2Users, ...ea3Users, ...S2Users, ...teamsVestings])];
const totalUsers = [...new Set([...allEAUsers, ...qaccUsers])];
const finalUsers = allEAUsers.filter(user => !qaccUsers.includes(user));

console.log(`Total EA users + Season 2 + teams vestings: ${allEAUsers.length}`);
console.log(`QACC users to remove: ${qaccUsers.length}`);
console.log(`Total users: ${totalUsers.length}`);
console.log(`Final users after removing QACC: ${finalUsers.length}`);

// generateTransactionJson(fundingPotMSAddress, projectName, paymentProcessor, paymentRouterAddress, qaccUsers);

const s2UsersWithoutQacc = S2Users.filter(user => !qaccUsers.includes(user));

console.log(`S2 users without QACC: ${s2UsersWithoutQacc.length}`);
generateTransactionJson(fundingPotMSAddress, projectName, paymentProcessor, paymentRouterAddress, s2UsersWithoutQacc);

console.log("Done!");