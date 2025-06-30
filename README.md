# Scripts for some common usages

# Contract deployer

A flexible proxy contract that can call `buy` and `sell` methods on **any** target contract address. This proxy contract acts as a universal intermediary, allowing you to call specific functions on multiple different contracts through a standardized interface.

## Features

- **Universal Proxy Pattern**: Can call any contract address dynamically
- **Buy/Sell Functions**: Supports the exact function signatures you specified
- **Error Handling**: Proper error propagation from target contracts
- **Gas Optimization**: Efficient call forwarding with minimal overhead
- **No Constructor Parameters**: Deploy once, use with any contract
- **Hardhat Integration**: Professional development environment with testing

## Contract Functions

The flexible proxy contract provides these functions:

### Buy Function
```solidity
function buy(address _targetContract, uint256 _depositAmount, uint256 _minAmountOut) external
```
- Calls the buy function on any specified target contract

### Sell Function
```solidity
function sell(address _targetContract, uint256 _depositAmount, uint256 _minAmountOut) external
```
- Calls the sell function on any specified target contract

## Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables (optional):**
```bash
# Copy the example file
cp .env.example .env

# Edit .env with your private key and RPC URLs
```

## Configuration

The project uses Hardhat for compilation and deployment. Configuration is in `hardhat.config.js`:

```javascript
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    polygon: {
      url: "YOUR_POLYGON_RPC_URL",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 137,
    },
  },
};
```

## Development

### Compile Contracts
```bash
npm run compile
```

### Run Tests
```bash
npm run test
```

### Clean Build Artifacts
```bash
npm run clean
```

## Deployment

### Deploy to Polygon
```bash
npm run deploy
```

### Deploy to Local Network
```bash
npm run deploy:local
```

### Manual Deployment
```bash
npx hardhat run scripts/deploy.js --network polygon
```

## Usage Examples

### After Deployment

Once deployed, you can interact with any contract through the proxy:

```javascript
const { ethers } = require("hardhat");

// Get the deployed contract
const proxyContract = await ethers.getContractAt("FlexibleProxyContract", proxyAddress);

// Call buy function on any contract
const targetContract = "0x1234567890123456789012345678901234567890";
const depositAmount = ethers.parseUnits("1.0", 18); // 1 ETH
const minAmountOut = ethers.parseUnits("0.95", 18); // 0.95 ETH minimum
await proxyContract.buy(targetContract, depositAmount, minAmountOut);

// Call sell function on a different contract
const anotherContract = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
await proxyContract.sell(anotherContract, depositAmount, minAmountOut);
```

### Using the Interaction Script

```bash
# Edit scripts/interact.js with your contract addresses
npm run interact
```

## Project Structure

```
├── contracts/
│   ├── FlexibleProxyContract.sol    # Main proxy contract
│   └── MockTargetContract.sol       # Mock contract for testing
├── scripts/
│   ├── deploy.js                    # Deployment script
│   └── interact.js                  # Interaction script
├── test/
│   └── ProxyContract.test.js        # Test suite
├── hardhat.config.js                # Hardhat configuration
└── package.json                     # Dependencies
```

## Key Advantages

1. **Universal Compatibility**: Works with any contract that has `buy`/`sell` functions
2. **Dynamic Targeting**: No need to redeploy for different target contracts
3. **Cost Effective**: One deployment serves all your proxy needs
4. **Future Proof**: Works with contracts deployed after the proxy
5. **Professional Tooling**: Hardhat provides compilation, testing, and deployment

## Contract Verification

The deployment script automatically verifies:
- Contract compilation success
- Function signatures
- Gas estimation
- Network information

## Security Considerations

1. **Private Key Security**: Use environment variables for private keys
2. **Target Contract Validation**: Ensure target contracts have the expected functions
3. **Gas Limits**: Hardhat automatically estimates gas
4. **Error Handling**: The proxy properly forwards errors from target contracts
5. **Address Validation**: Zero addresses are rejected

## Network Support

The script supports any Ethereum-compatible network:
- Ethereum Mainnet
- Ethereum Testnets (Goerli, Sepolia)
- Layer 2 networks (Polygon, Arbitrum, etc.)
- Local development networks

## Testing

Run the test suite to verify contract functionality:

```bash
npm run test
```

The tests include:
- Deployment verification
- Zero address validation
- Function call testing
- Mock contract interaction

## Troubleshooting

### Common Issues

1. **Insufficient Balance**: Ensure wallet has enough ETH for deployment
2. **Network Issues**: Check RPC URL and network connectivity
3. **Compilation Errors**: Run `npm run compile` to check for issues
4. **Test Failures**: Run `npm run test` to identify problems

### Error Messages

- `"Target contract cannot be zero address"`: Invalid target contract address
- `"Buy call failed"` / `"Sell call failed"`: Target contract call reverted
- `"insufficient funds"`: Wallet doesn't have enough ETH
- `"network error"`: RPC connection issues

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with `npm run test`
5. Submit a pull request

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the error messages
3. Verify your configuration
4. Test on a local network first
