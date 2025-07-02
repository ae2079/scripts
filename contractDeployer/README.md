# Flexible Proxy Contract Deployer

A Hardhat project for deploying and interacting with a flexible proxy contract that can execute buy and sell operations on any target bonding curve contract.

## Overview

The `FlexibleProxyContract` is a universal proxy that allows users to interact with any bonding curve contract that implements the standard `buyFor` and `sellTo` methods. This proxy handles token transfers and approvals automatically, providing a unified interface for trading on different bonding curve implementations.

## What the Proxy Contract Does

### Core Functionality

The proxy contract acts as an intermediary between users and bonding curve contracts, handling:

1. **Token Transfers**: Automatically transfers tokens from users to the proxy contract
2. **Token Approvals**: Manages approvals for target contracts to spend tokens
3. **Method Forwarding**: Calls the appropriate methods on target bonding curve contracts
4. **Error Handling**: Provides detailed error messages for failed operations

### Buy Operation Flow

When a user wants to buy tokens from a bonding curve:

1. **User Approval**: User must first approve the proxy contract to spend their collateral tokens
2. **Token Transfer**: Proxy transfers collateral tokens from user to itself
3. **Target Approval**: Proxy approves the target bonding curve contract to spend the collateral tokens
4. **Buy Execution**: Proxy calls `buyFor(msg.sender, depositAmount, minAmountOut)` on the target contract
5. **Token Distribution**: Target contract sends purchased tokens directly to the user

### Sell Operation Flow

When a user wants to sell tokens to a bonding curve:

1. **User Approval**: User must first approve the proxy contract to spend their tokens to sell
2. **Token Transfer**: Proxy transfers tokens from user to itself
3. **Target Approval**: Proxy approves the target bonding curve contract to spend the tokens
4. **Sell Execution**: Proxy calls `sellTo(msg.sender, depositAmount, minAmountOut)` on the target contract
5. **Collateral Distribution**: Target contract sends collateral tokens directly to the user

### Key Benefits

- **Universal Interface**: Works with any bonding curve contract that implements `buyFor` and `sellTo`
- **Automatic Token Management**: Handles transfers and approvals automatically
- **Error Handling**: Provides clear error messages for debugging
- **Gas Efficiency**: Optimized for minimal gas consumption

## Contract Functions

### `buy(address _targetContract, address _collateralToken, uint256 _depositAmount, uint256 _minAmountOut)`

Executes a buy operation on the target bonding curve contract.

**Parameters:**
- `_targetContract`: Address of the bonding curve contract
- `_collateralToken`: Address of the collateral token (e.g., WPOL, TPOL)
- `_depositAmount`: Amount of collateral tokens to spend
- `_minAmountOut`: Minimum amount of tokens to receive (slippage protection)

### `sell(address _targetContract, address _tokenToSell, uint256 _depositAmount, uint256 _minAmountOut)`

Executes a sell operation on the target bonding curve contract.

**Parameters:**
- `_targetContract`: Address of the bonding curve contract
- `_tokenToSell`: Address of the token to sell (ABC token)
- `_depositAmount`: Amount of tokens to sell
- `_minAmountOut`: Minimum amount of collateral to receive (slippage protection)

### `isContract(address target)`

Checks if an address is a deployed contract.

**Returns:** `bool` - True if the address is a contract

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`
2. Add your private key and RPC URL:
   ```
   PRIVATE_KEY=your_private_key_here
   POLYGON_RPC_URL=your_polygon_rpc_url_here
   POLYGONSCAN_API_KEY=your_etherscan_api_key_here
   ```

## Usage

### Compile Contracts

```bash
npm run compile
```

### Deploy to Local Network

```bash
npm run deploy:local
```

### Run Tests

```bash
npm run test
```

### Deploy to Polygon Network

```bash
npm run deploy
```

### Verify Contract on Polygon Scanner

```bash
npm run verify <contract-address>
```

### Interact with Deployed Contract

To interact with a deployed contract:

1. Configure the contract parameters in `scripts/interact.js`:
   - Set the proxy contract address
   - Set the target contract address
   - Set the token addresses

2. Run the interaction script:
   ```bash
   npm run interact
   ```

This will execute the example buy and sell transactions defined in the interaction script.

## Example Usage

### Buying Tokens

```javascript
// User must first approve the proxy contract
await collateralToken.approve(proxyAddress, depositAmount);

// Then call the buy function
await proxyContract.buy(
    targetBondingCurveAddress,
    collateralTokenAddress,
    depositAmount,
    minAmountOut
);
```

### Selling Tokens

```javascript
// User must first approve the proxy contract
await tokenToSell.approve(proxyAddress, depositAmount);

// Then call the sell function
await proxyContract.sell(
    targetBondingCurveAddress,
    tokenToSellAddress,
    depositAmount,
    minAmountOut
);
```

## Error Handling

The contract includes several custom errors for better debugging:

- `TransferFailed`: When token transfers fail
- `ApprovalFailed`: When token approvals fail
- `CallFailed`: When the target contract call fails
- `NotAContract`: When the target address is not a contract

## Security Considerations

1. **Input Validation**: All addresses are validated to ensure they are contracts
2. **Slippage Protection**: Users can specify minimum amounts to receive
3. **Direct Token Distribution**: Tokens are sent directly to users, not through the proxy

## Gas Optimization

- Uses low-level calls for maximum efficiency
- Minimizes storage operations
- Optimized error handling with custom errors

## Supported Networks

- Hardhat (local development)
- Polygon
- Any EVM-compatible network

## License

MIT 