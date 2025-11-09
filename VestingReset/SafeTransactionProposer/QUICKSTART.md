# Quick Start Guide

## 🚀 One-Time Setup

```bash
cd SafeTransactionProposer
npm install

# Copy and configure .env file
cp .env.example .env
# Then edit .env and add your PRIVATE_KEY
```

## 📝 Basic Usage

### Propose All Transactions in a Folder (Most Common)

```bash
node proposeSafeTransactions.js batch ../X23/pushPayment
```

### Propose a Single Transaction File

```bash
node proposeSafeTransactions.js single ../X23/pushPayment/transactions_batch1.json
```

### Alternative: Using Environment Variable (without .env file)

```bash
# Default behavior (uses current nonce)
PRIVATE_KEY=0xYourPrivateKey node proposeSafeTransactions.js batch ../X23/pushPayment

# 🆕 Use queue nonce to append to existing queue (recommended)
PRIVATE_KEY=0xYourPrivateKey USE_QUEUE_NONCE=true node proposeSafeTransactions.js batch ../X23/pushPayment
```

## 🔧 Configuration

### Option 1: Using .env file (Recommended)

Edit your `.env` file:

```bash
# Required
PRIVATE_KEY=0x1234567890abcdef...

# Optional overrides (usually not needed)
CHAIN_ID=137
RPC_URL=https://polygon-rpc.com

# 🆕 NEW: Nonce Configuration
# USE_QUEUE_NONCE=false (default) - Uses current nonce, may overwrite pending transactions
# USE_QUEUE_NONCE=true (recommended) - Appends to queue without overwriting
USE_QUEUE_NONCE=true
```

**Note:** Safe address is automatically extracted from transaction files, no need to configure it.

### Option 2: Edit CONFIG in code

Edit the `CONFIG` object at the top of `proposeSafeTransactions.js`:

```javascript
const CONFIG = {
    CHAIN_ID: '137',        // 137 = Polygon, 1 = Ethereum, etc.
    RPC_URL: 'https://polygon-rpc.com',
    MULTI_SEND_CALL_ONLY_ADDRESS: '0x9641d764fc13c8B624c04430C7356C1C7C8102e2'
};
```

### Option 3: Command line override for Chain ID

```bash
node proposeSafeTransactions.js batch ../X23/pushPayment 137
```

## ⚠️ Important Notes

1. **Private Key Security**: Your private key must belong to a Safe owner
2. **Never commit** your private key to git
3. **Review in Safe UI**: After proposing, check https://app.safe.global to review before executing
4. **Test First**: Use a test Safe on testnet before mainnet transactions

## 📂 Folder Structure Reference

Your transaction files should be in the parent directory:

```
VestingReset/
├── SafeTransactionProposer/          ← You are here
│   ├── proposeSafeTransactions.js
│   └── ...
├── X23/
│   ├── pushPayment/                  ← Transaction files
│   │   ├── transactions_batch1.json
│   │   ├── transactions_batch2.json
│   │   └── ...
│   └── removePayment/                ← Transaction files
│       └── ...
├── generateRemovePaymentsTransactions.js
└── pushPaymentTransactionGenerator.js
```

## 🔗 After Proposing

1. Transactions appear in Safe UI: https://app.safe.global
2. Other owners can review and approve
3. Once threshold is met, anyone can execute

## 💡 Tips

- Use **batch mode** to propose multiple transactions at once
- **🆕 USE_QUEUE_NONCE=true**: Set this to append transactions to your queue without overwriting existing pending transactions
- **Automatic nonce management**: Each batch gets a unique, sequential nonce (no conflicts!)
- The script includes 2-second delays between batches to avoid rate limiting
- Check the console output for transaction hashes, nonces, and links
- If a transaction fails, the script continues with the next one
- Transactions will appear in Safe UI in the correct order based on their nonces

## 🆘 Troubleshooting

| Error | Solution |
|-------|----------|
| "Signer is not an owner" | Verify your private key belongs to a Safe owner |
| "Delegate call is disabled" | **Fixed!** Script uses MultiSendCallOnly (0x9641d764...) - Safe delegates to it, it makes CALLs |
| "Network error" | Check RPC_URL is correct and accessible |
| "Rate limiting" | Wait a few minutes and try again |
| "Transaction already proposed" | This transaction already exists in the Safe |

## 📚 Full Documentation

See [README.md](./README.md) for complete documentation.

