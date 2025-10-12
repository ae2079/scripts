# Vesting Reset Safe Transaction Scripts

This directory contains scripts to generate and propose transactions to Safe (Gnosis Safe) multisig wallets for managing vesting payments.

## Scripts Overview

### 1. `generateRemovePaymentsTransactions.js`
Generates transaction JSON files to remove payment streams from users.

**Features:**
- Reads existing transaction files to extract user addresses
- Filters users based on different criteria (QACC, EA, Season 2, etc.)
- Generates batched transactions (25 per batch)
- Creates organized folder structure for transaction files

### 2. `pushPaymentTransactionGenerator.js`
Generates transaction JSON files to create new payment streams for users.

**Features:**
- Reads user data from existing transaction files
- Creates vesting payment transactions with start, cliff, and end times
- Supports filtering and deduction logic for specific addresses
- Generates batched transactions (25 per batch)

### 3. `proposeSafeTransactions.js` ⭐ NEW
Programmatically proposes generated transactions to a Safe multisig wallet.

**Features:**
- Proposes single transaction files or entire directories (batch mode)
- Uses Safe SDK for secure transaction submission
- Verifies signer is a Safe owner before proposing
- Provides detailed progress and summary reports
- Includes rate limiting protection between batches

## Installation

Install the required dependencies:

```bash
npm install
```

## Usage

### Step 1: Generate Transactions

First, generate your transaction files using one of the generator scripts:

**For Remove Payments:**
```bash
npm run generate:remove
```

**For Push Payments:**
```bash
npm run generate:push
```

This will create transaction JSON files in folders like:
- `./X23/removePayment/`
- `./X23/pushPayment/`

### Step 2: Propose Transactions to Safe

After generating transaction files, propose them to your Safe multisig:

#### Propose a Single Transaction File

```bash
PRIVATE_KEY=0x... node proposeSafeTransactions.js single ./X23/pushPayment/transactions_X23_batch1_20251012_0000.json
```

#### Propose All Transactions in a Directory (Batch Mode)

```bash
PRIVATE_KEY=0x... node proposeSafeTransactions.js batch ./X23/pushPayment
```

#### With Custom Safe Address and Chain ID

```bash
PRIVATE_KEY=0x... node proposeSafeTransactions.js batch ./X23/pushPayment 0xYourSafeAddress 137
```

### NPM Scripts

You can also use the provided npm scripts:

```bash
# Propose a single transaction (you need to modify the script to add the path)
PRIVATE_KEY=0x... npm run propose:single <file_path>

# Propose all transactions in a directory
PRIVATE_KEY=0x... npm run propose:batch <directory_path>
```

## Configuration

### Default Configuration in `proposeSafeTransactions.js`

```javascript
const CONFIG = {
    CHAIN_ID: '137',        // Polygon Mainnet
    RPC_URL: 'https://polygon-rpc.com',
    SAFE_ADDRESS: '0xe077bC743b10833cC938cd5700F92316d5dA11Bf'
};
```

You can override these values:
- Via command line arguments
- By editing the CONFIG object in the script
- Chain ID and Safe address can be passed as command line arguments

### Required Environment Variables

- `PRIVATE_KEY`: Private key of a Safe owner (required)
  - **⚠️ SECURITY**: Never commit your private key. Always use environment variables.
  - The private key must belong to an owner of the Safe multisig
  - Format: `0x...` (with 0x prefix)

### Optional Environment Variables

You can also use a `.env` file (not included in git):

```bash
PRIVATE_KEY=0xyour_private_key_here
RPC_URL=https://your-rpc-endpoint.com
```

## Security Best Practices

1. **Never commit private keys**: Always use environment variables or secure key management
2. **Use hardware wallets**: For production, consider using a hardware wallet integration
3. **Verify transactions**: Always review transactions in the Safe UI before executing
4. **Test first**: Use a test Safe on a testnet before proposing to mainnet
5. **Backup**: Keep backups of all generated transaction files

## How It Works

### Transaction Generation Flow

```
User Data → Generator Script → Transaction JSON Files → Safe Transaction Builder Format
```

### Transaction Proposal Flow

```
Transaction JSON → proposeSafeTransactions.js → Safe SDK → Safe API → Safe UI
```

1. **Read**: Script reads transaction JSON files
2. **Initialize**: Connects to Safe using SDK with your private key
3. **Verify**: Checks that signer is a Safe owner
4. **Format**: Converts transactions to Safe SDK format
5. **Sign**: Signs the transaction with your private key
6. **Propose**: Submits to Safe Transaction Service
7. **View**: Transaction appears in Safe UI for other owners to approve

## Transaction File Format

Generated transaction files follow the Safe Transaction Builder format:

```json
{
  "version": "1.0",
  "chainId": "137",
  "createdAt": 1234567890,
  "meta": {
    "name": "[PUSH-PAYMENTS]-[X23]-[QACC-ROUND-1]-[TX-0]",
    "description": "Batch 1 for X23"
  },
  "transactions": [
    {
      "to": "0x...",
      "value": "0",
      "data": "0x...",
      "contractMethod": "pushPayment(address,address,uint256,uint256,uint256,uint256)",
      "contractInputsValues": [...]
    }
  ]
}
```

## Troubleshooting

### "Signer is not an owner of Safe"
- Ensure the private key you're using belongs to a Safe owner
- Verify the Safe address is correct
- Check you're connected to the correct network

### "Rate limiting" or "Too many requests"
- The script includes automatic delays between batches (2 seconds)
- If issues persist, increase `delayBetweenBatches` parameter
- Wait a few minutes and try again

### "Network error" or "RPC error"
- Check your internet connection
- Verify RPC_URL is accessible
- Try using a different RPC endpoint (e.g., Alchemy, Infura)

### "Transaction already proposed"
- This transaction hash already exists in the Safe
- Check the Safe UI to see existing pending transactions
- You can skip this transaction or use a different nonce

## Advanced Usage

### Custom RPC Endpoint

```bash
# Edit the CONFIG object in proposeSafeTransactions.js
const CONFIG = {
    RPC_URL: 'https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY',
    // ...
};
```

### Different Chains

The script supports any chain that Safe supports. Update the `CHAIN_ID`:

- Ethereum Mainnet: `1`
- Polygon: `137`
- Gnosis Chain: `100`
- Arbitrum: `42161`
- Optimism: `10`
- Base: `8453`

## Additional Resources

- [Safe Documentation](https://docs.safe.global/)
- [Safe SDK Documentation](https://docs.safe.global/sdk/overview)
- [Safe Transaction Service API](https://docs.safe.global/core-api/transaction-service-overview)
- [Safe Web App](https://app.safe.global/)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Safe SDK documentation
3. Verify all configuration values are correct
4. Check transaction files are properly formatted

## License

MIT

