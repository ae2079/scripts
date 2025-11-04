# Token Distributer

This tool generates Safe Transaction Builder JSON files from a CSV file containing token distribution data.

## Features

- ✅ Reads CSV file with token distribution data
- ✅ Supports native token transfers (ETH/MATIC) and ERC20 token transfers
- ✅ Automatically batches transactions (50 per batch by default)
- ✅ Generates Safe Transaction Builder format JSON files
- ✅ Validates addresses and amounts
- ✅ Groups ERC20 transfers by token address

## Installation

Install dependencies:

```bash
npm install
```

## Usage

### Basic Usage

Set your Safe address as an environment variable and run:

```bash
SAFE_ADDRESS=0xYourSafeAddress node generateDistributions.js
```

Or update the `CONFIG.safeAddress` in the script directly.

### Configuration

You can modify these settings in `generateDistributions.js`:

- `batchSize`: Number of transactions per batch (default: 50)
- `chainId`: Blockchain chain ID (default: "137" for Polygon)
- `csvFileName`: Name of your CSV file
- `outputFolder`: Folder where transaction files will be saved

### CSV Format

The CSV file should have the following columns:

- `token_type`: Either "native" for native tokens or leave empty/omit for ERC20
- `token_address`: Token contract address (empty for native tokens)
- `receiver`: Recipient wallet address
- `amount`: Amount to send (in token units, not wei)
- `id`: Optional identifier (not used)

Example:
```csv
token_type,token_address,receiver,amount,id
native,,0x72a4298c0e0889a0e8a2e6bb42e29ee6469dfef4,1428.522555,
native,,0x69eb4ac4d16e5f0afe940d2fb1220787eaf7bec9,329.5871739,
```

### Output

The script generates JSON files in the `transactions/` folder:

- `transactions_native_batch1_TIMESTAMP.json` - Native token transfers
- `transactions_erc20_TOKENADDRESS_batch1_TIMESTAMP.json` - ERC20 token transfers

Each file follows the Safe Transaction Builder format and can be:
1. Imported directly into Safe Transaction Builder UI
2. Used with the SafeTransactionProposer script
3. Manually reviewed and proposed

## Next Steps

After generating the transaction files:

1. **Review** the generated files to verify amounts and addresses
2. **Propose** using SafeTransactionProposer:
   ```bash
   cd ../SafeTransactionProposer
   node proposeSafeTransactions.js batch ../tokenDistributer/transactions
   ```
3. **Or import** directly into Safe Transaction Builder UI

## Example

```bash
# Set your Safe address
export SAFE_ADDRESS=0x1234567890123456789012345678901234567890

# Generate transactions
node generateDistributions.js

# Output:
# ✅ Successfully parsed CSV file
# 📊 Found 489 distribution records
# 💰 Processing 489 native token transfers...
# ✅ Generated: transactions_native_batch1_20250101_120000.json (50 transactions)
# ✅ Generated: transactions_native_batch2_20250101_120000.json (50 transactions)
# ...
# ✨ Total files generated: 10
```

