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
    for (const user of userData) {
        let amountToPush = user.amount;
        if (addressToFilter.some(address => address.address.toLowerCase() === user.address.toLowerCase())) {
            console.log(`✅ Found matching address: ${user.address}`);
            console.log(`Deducting ${addressToFilter.find(address => address.address.toLowerCase() === user.address.toLowerCase()).amountToDeduct} from ${user.amount}`);
            const amountToDeduct = addressToFilter.find(address => address.address.toLowerCase() === user.address.toLowerCase()).amountToDeduct;
            amountToPush = (BigInt(user.amount) - BigInt(amountToDeduct)).toString();
            console.log(`💰 New amount after deduction: ${amountToPush}`);
            if (onlyFilteredUsers) {
                transactions.push({
                    to: toAddress,
                    value: "0",
                    data: FUNCTION_SELECTORS.pushPayment + ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "address", "uint256", "uint256", "uint256", "uint256"], [user.address, abcTokenAddress, amountToPush, start, cliff, end]
                    ).slice(2),
                    contractMethod: "pushPayment(address,address,uint256,uint256,uint256,uint256)",
                    contractInputsValues: [
                        user.address,
                        abcTokenAddress,
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
                to: toAddress,
                value: "0",
                data: FUNCTION_SELECTORS.pushPayment + ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "address", "uint256", "uint256", "uint256", "uint256"], [user.address, abcTokenAddress, amountToPush, start, cliff, end]
                ).slice(2),
                contractMethod: "pushPayment(address,address,uint256,uint256,uint256,uint256)",
                contractInputsValues: [
                    user.address,
                    abcTokenAddress,
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
                    createdFromSafeAddress: safe,
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



const projectName = 'AKARUN';
// const paymentProcessor = "0xDE1811172756feb79a4c937246B320d36615C184"; // akarun
const paymentRouterAddress = "0x513E116779a0E4645d262c3d78190B4cC6bB47Dd"; // client
const fundingPotMSAddress = "0x473c36457e2c134837937f7c20aa0abaf78210c3";
// const workflowAdminAddress = "0x9298fD550E2c02AdeBf781e08214E4131CDeC44e";
const abcTokenAddress = "0xA3dd6163B5742B0D8Cb7d79CB5DFE3F81F8F8fC4";

const start = 1760371200;
const cliff = 0;
const end = 1773417600;


const filesData = readTransactionFile("5.json");
const userData = getUserDataFromTransactions(filesData.transactions.readable);

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