import fs from 'fs';
import { ethers } from 'ethers';

// Payment Processor ABI - only what we need
const PAYMENT_PROCESSOR_ABI = [
    "function isActivePaymentReceiver(address client, address paymentReceiver) external view returns (bool)"
];

// Configuration
const RPC_URL = "https://polygon-rpc.com"; // Polygon Mainnet RPC
const paymentProcessorAddress = "0xD6F574062E948d6B7F07c693f1b4240aFeA41657";
const paymentRouterAddress = "0x6B5d37c206D56B16F44b0C1b89002fd9B138e9Be"; // client address

/**
 * Check if a single address has active streams
 */
async function checkAddress(contract, client, userAddress) {
    try {
        const isActive = await contract.isActivePaymentReceiver(client, userAddress);
        return {
            address: userAddress,
            hasActiveStreams: isActive,
            status: 'success'
        };
    } catch (error) {
        console.error(`   ❌ Error checking ${userAddress}: ${error.message}`);
        return {
            address: userAddress,
            hasActiveStreams: null,
            status: 'error',
            error: error.message
        };
    }
}

/**
 * Check multiple addresses for active streams
 */
async function checkActiveStreams(addresses) {
    console.log(`\n🚀 Checking ${addresses.length} addresses for active streams...`);
    console.log(`📍 Payment Processor: ${paymentProcessorAddress}`);
    console.log(`📍 Client: ${paymentRouterAddress}\n`);

    // Setup provider and contract
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(paymentProcessorAddress, PAYMENT_PROCESSOR_ABI, provider);

    const results = [];
    let activeCount = 0;
    let inactiveCount = 0;
    let errorCount = 0;

    // Check each address
    for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        console.log(`[${i + 1}/${addresses.length}] Checking: ${address}`);

        const result = await checkAddress(contract, paymentRouterAddress, address);
        results.push(result);

        if (result.status === 'error') {
            errorCount++;
            console.log(`   ❌ Error`);
        } else if (result.hasActiveStreams) {
            activeCount++;
            console.log(`   ✅ Has active streams`);
        } else {
            inactiveCount++;
            console.log(`   ⭕ No active streams`);
        }

        // Small delay to avoid rate limiting
        if (i < addresses.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Active: ${activeCount}`);
    console.log(`   ⭕ Inactive: ${inactiveCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📝 Total: ${addresses.length}`);

    return {
        timestamp: new Date().toISOString(),
        totalAddresses: addresses.length,
        activeCount,
        inactiveCount,
        errorCount,
        results
    };
}

/**
 * Save results to JSON file
 */
function saveResults(data, filename = null) {
    if (!filename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
        filename = `active_streams_check_${timestamp}.json`;
    }

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
}

// Main execution
async function main() {
    try {
        // ============================================
        // CONFIGURATION - UPDATE THIS ARRAY
        // ============================================
        const addressesToCheck = [
            // "0x313a58f11D8cF6f1667B7C8D615BD93B8c3F49Cb",
            // Add more addresses here
            "0xe5adabBD71225E8074E30ff6cE2a66c9319C071b",
            "0x0dC89D5CFb8b4dfE0021C5F2F457689587ddCAEC",
            "0x13e0d0A9e4024F1804FA2a0dde4F7c38abCc63F7",
            "0x4A64a336a2F16299340d1b40AEdF5994DeD1F021",
        ];

        // Validate addresses
        const validAddresses = addressesToCheck.filter(addr => {
            try {
                ethers.getAddress(addr); // This will throw if invalid
                return true;
            } catch {
                console.warn(`⚠️  Invalid address, skipping: ${addr}`);
                return false;
            }
        });

        if (validAddresses.length === 0) {
            console.error('❌ No valid addresses to check!');
            process.exit(1);
        }

        // Check all addresses
        const results = await checkActiveStreams(validAddresses);

        // Save results
        saveResults(results);

        // Display active addresses
        const activeAddresses = results.results.filter(r => r.hasActiveStreams);
        if (activeAddresses.length > 0) {
            console.log(`\n✅ Addresses with active streams (${activeAddresses.length}):`);
            activeAddresses.forEach(r => console.log(`   - ${r.address}`));
        }

        // Display inactive addresses
        const inactiveAddresses = results.results.filter(r => r.hasActiveStreams === false);
        if (inactiveAddresses.length > 0) {
            console.log(`\n⭕ Addresses without active streams (${inactiveAddresses.length}):`);
            inactiveAddresses.forEach(r => console.log(`   - ${r.address}`));
        }

        console.log("\n🎉 Done!");

    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the script
main();