const { ethers } = require("ethers");

const projects = {
    // "Xade finance": "0xd36cc7044e8f737f636cef2f8a92738833f3d7d4",
    // "Prismo Technology": "0x34d8581a8f23705bbadbf8b18d99c5d296a84356",
    // "x23.ai": "0xd27fe67f60fc7c66ec24c14a4c1474d9ed38997c",
    // "The Grand Timeline": "0xac518d2e95fb45480f11801737be147a036c2547",
    // "Akarun": "0xf3ef1ddc511587bf16351af9ba9947203f014f72",
    // "Melodex by DjookyX": "0x0e784b9882668f521c6749f49bca15df08aec243",
    // "Ancient Beast": "0xd7b4689fbebc347c264750a7521794c54c70a3cf",
    // "Citizen Wallet": "0x4ee1330e0f0200f588f6b8de798b5a00710c6387"
    "Lovel project": "0xc5fd6657f888cbc643b3117d8424cffccdc5ba2e"
};

const CONTRACT_ABI = [
    // Minimal ABI with only required methods for this example
    {
        "inputs": [],
        "name": "buyFee",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "sellFee",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getReserveRatioForBuying",
        "outputs": [{ "internalType": "uint32", "name": "", "type": "uint32" }],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getReserveRatioForSelling",
        "outputs": [{ "internalType": "uint32", "name": "", "type": "uint32" }],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getStaticPriceForBuying",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getStaticPriceForSelling",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getVirtualCollateralSupply",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getVirtualIssuanceSupply",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
        }],
        "name": "mint",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
];

async function mintTokens(amount, contract) {
    try {
        const mintAmount = ethers.parseUnits(amount.toString(), 18); // Adjust decimals as needed
        const tx = await contract.mint(mintAmount);
        await tx.wait();
        console.log(`Minted ${amount} tokens.`);
    } catch (error) {
        console.error("Error minting tokens:", error);
        throw error; // Rethrow error or handle as needed
    }
}

async function main() {
    const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");

    try {
        // Connect to the contract
        //   for (const project in projects) {
        //     const CONTRACT_ADDRESS = "0xb236c6c907051d91e6231557c4563032ff758822";
        const CONTRACT_ADDRESS = "0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56";
        // console.log(`\nData for ${project} project:`);

        // const privateKey = process.env.PRIVATE_KEY;

        // const wallet = new ethers.Wallet(privateKey, provider);

        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        // Call methods and log their outputs
        const buyFee = await contract.buyFee();
        console.log("Buy Fee:", buyFee.toString());

        const sellFee = await contract.sellFee();
        console.log("Sell Fee:", sellFee.toString());

        const reserveRatioForBuying = await contract.getReserveRatioForBuying();
        console.log("Reserve Ratio for Buying:", reserveRatioForBuying.toString());

        const reserveRatioForSelling = await contract.getReserveRatioForSelling();
        console.log("Reserve Ratio for Selling:", reserveRatioForSelling.toString());

        const staticPriceForBuying = await contract.getStaticPriceForBuying();
        console.log("Static Price for Buying:", ethers.formatUnits(staticPriceForBuying, 6)); // Assuming the price is in 18 decimals

        const actualBuyPrice = ethers.formatUnits(staticPriceForBuying, 6) * 1.1;
        console.log("Actual Buy Price (adding 10% to static price):", actualBuyPrice);

        const staticPriceForSelling = await contract.getStaticPriceForSelling();
        console.log("Static Price for Selling:", ethers.formatUnits(staticPriceForSelling, 6)); // Assuming the price is in 18 decimals

        const actualSellPrice = ethers.formatUnits(staticPriceForSelling, 6) * 0.9;
        console.log("Actual Sell Price (subtracting 10% from static price):", actualSellPrice);

        const virtualCollateralSupply = await contract.getVirtualCollateralSupply();
        console.log("Virtual Collateral Supply:", ethers.formatUnits(virtualCollateralSupply, 18)); // Assuming supply is in 18 decimals

        const virtualIssuanceSupply = await contract.getVirtualIssuanceSupply();
        console.log("Virtual Issuance Supply:", ethers.formatUnits(virtualIssuanceSupply, 18)); // Assuming supply is in 18 decimals


        // const role = ethers.encodeBytes32String(configs.USER_ROLE);
        // await authorizerContract.generateRoleId(module, role);
        // await mintTokens(21590, contract);
        // console.log("minted successfully")
        // }
    } catch (error) {
        console.error("Error calling contract methods:", error);
    }
}

main();