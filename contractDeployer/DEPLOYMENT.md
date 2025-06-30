# Deployment Guide

This guide will help you deploy the FlexibleProxyContract to Polygon network.

## Prerequisites

1. **Node.js**: Version 16 or higher (Hardhat recommends LTS versions)
2. **npm**: Package manager
3. **Polygon MATIC**: For gas fees (at least 0.1 MATIC recommended)

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Compile contracts:**
```bash
npm run compile
```

3. **Run tests (recommended):**
```bash
npm run test
```

## Configuration

### Option 1: Environment Variables (Recommended)

Create a `.env` file in the project root:

```env
PRIVATE_KEY=your_private_key_here
POLYGON_RPC_URL=your_polygon_rpc_url_here
```

### Option 2: Direct Configuration

Edit `hardhat.config.js` and replace the placeholder values:

```javascript
networks: {
  polygon: {
    url: "YOUR_POLYGON_RPC_URL",
    accounts: ["YOUR_PRIVATE_KEY"],
    chainId: 137,
  },
},
```

## Deployment

### Deploy to Polygon

```bash
npm run deploy
```

### Deploy to Local Network (Testing)

```bash
npm run deploy:local
```

## Verification

After deployment, you should see output like:

```
✅ Proxy contract deployed successfully!
📍 Contract address: 0x...
🔗 Transaction hash: 0x...
⛽ Gas used: 252194
💰 Gas price: 20 gwei
💸 Total cost: 0.00504388 ETH
```

## Usage

### Interact with Deployed Contract

1. **Edit the interaction script:**
   - Open `scripts/interact.js`
   - Replace `PROXY_CONTRACT_ADDRESS` with your deployed contract address
   - Replace `TARGET_CONTRACT_ADDRESS` with the contract you want to call

2. **Run the interaction:**
```bash
npm run interact
```

### Programmatic Usage

```javascript
const { ethers } = require("hardhat");

// Get the deployed contract
const proxyContract = await ethers.getContractAt("FlexibleProxyContract", proxyAddress);

// Call buy function
await proxyContract.buy(targetAddress, depositAmount, minAmountOut);

// Call sell function
await proxyContract.sell(targetAddress, depositAmount, minAmountOut);
```

## Troubleshooting

### Common Issues

1. **"insufficient funds"**
   - Ensure your wallet has enough MATIC for gas fees
   - Recommended: At least 0.1 MATIC

2. **"network error"**
   - Check your RPC URL in the configuration
   - Ensure you have internet connectivity

3. **"invalid private key"**
   - Verify your private key format (64 hex characters)
   - Don't include "0x" prefix

4. **"contract not found"**
   - Run `npm run compile` first
   - Check that contracts are in the `contracts/` directory

### Gas Optimization

The contract is optimized for gas efficiency:
- Uses `external` functions for public calls
- Minimal storage (no state variables)
- Efficient error handling

### Security Notes

- Never commit private keys to version control
- Use environment variables for sensitive data
- Test on local network before mainnet deployment
- Verify contract addresses before interaction

## Support

If you encounter issues:

1. Check the troubleshooting section
2. Run `npm run test` to verify contract functionality
3. Check Hardhat documentation: https://hardhat.org/
4. Review the contract source code in `contracts/FlexibleProxyContract.sol` 