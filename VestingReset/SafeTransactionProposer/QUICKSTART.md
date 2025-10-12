# Quick Start Guide

## 🚀 One-Time Setup

```bash
cd SafeTransactionProposer
npm install
```

## 📝 Basic Usage

### Propose All Transactions in a Folder (Most Common)

```bash
PRIVATE_KEY=0xYourPrivateKey node proposeSafeTransactions.js batch ../X23/pushPayment
```

### Propose a Single Transaction File

```bash
PRIVATE_KEY=0xYourPrivateKey node proposeSafeTransactions.js single ../X23/pushPayment/transactions_batch1.json
```

## 🔧 Configuration

Edit the `CONFIG` object at the top of `proposeSafeTransactions.js` if you need to change:

```javascript
const CONFIG = {
    CHAIN_ID: '137',        // 137 = Polygon, 1 = Ethereum, etc.
    RPC_URL: 'https://polygon-rpc.com',
    SAFE_ADDRESS: '0x1234567890123456789012345678901234567890'
};
```

Or override via command line:

```bash
PRIVATE_KEY=0x... node proposeSafeTransactions.js batch ../X23/pushPayment 0xYourSafeAddress 137
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
- The script includes 2-second delays between batches to avoid rate limiting
- Check the console output for transaction hashes and links
- If a transaction fails, the script continues with the next one

## 🆘 Troubleshooting

| Error | Solution |
|-------|----------|
| "Signer is not an owner" | Verify your private key belongs to a Safe owner |
| "Network error" | Check RPC_URL is correct and accessible |
| "Rate limiting" | Wait a few minutes and try again |
| "Transaction already proposed" | This transaction already exists in the Safe |

## 📚 Full Documentation

See [README.md](./README.md) for complete documentation.

