# Push Payment Transaction Generator with Claim Checking

Generate push payment transactions while automatically deducting tokens users have already claimed, using Etherscan API V2 (supports Polygon network).

## Quick Start

### Recommended Workflow (2-step process)

```bash
# 1. Get free API key from https://etherscan.io/apis
echo "POLYGONSCAN_API_KEY=your_api_key_here" > .env

# 2. Install dependencies
npm install

# 3. Generate claims report (one time)
npm run generate-claims-report

# 4. Generate transactions with deductions
npm run generate-with-deduction
```

### Alternative: One-step process (slower)

```bash
# Generate transactions with live API checking
npm run generate-with-claims
```

## Available Scripts

### ⭐ Recommended Workflow

#### 1. `npm run generate-claims-report`
**Step 1**: Generates a comprehensive JSON report of ALL claimed tokens.
- Fetches all transactions to the Payment Router via API
- Analyzes all token transfer logs
- Groups claims by user and token
- Outputs to `claims_report.json`
- **Run this once**, then reuse the report

#### 2. `npm run generate-with-deduction`  
**Step 2**: Generates push payment transactions with **dual streams** using the claims report.
- Reads transaction files for user payment data
- Reads `claims_report.json` for claimed amounts
- **Creates TWO streams per user:**
  - **Immediate (1s)**: For already-vested tokens minus claims
  - **Weekly (7d)**: For remaining unvested tokens
- Handles over-claims automatically
- Outputs transaction batches to `{projectName}/pushPayment/`
- **Fast** - no API calls, just file processing

### 🔄 Alternative Scripts

#### `npm run generate-with-claims`
Legacy script - generates transactions with live API checking (slower).
- Makes API calls for each user to check claims
- Useful if you don't want to generate the report first

#### `npm run check-claims`
Standalone claims checker for specific users in your transaction file.

#### `npm test`
Test script that analyzes 10 recent claim transactions to verify detection logic.

## What It Does

### Two-Step Process (Recommended)

**Step 1: Generate Claims Report**
1. Fetches ALL transactions to the Payment Router
2. Analyzes transaction logs for token Transfer events
3. Groups claims by user and token
4. Saves comprehensive report to `claims_report.json`

**Step 2: Generate Transactions with Deductions**
1. Reads your transaction file (`1.json`)
2. Reads the claims report (`claims_report.json`)
3. Calculates how much each user has already claimed
4. Deducts claimed amounts from new payment transactions
5. Generates Safe transaction JSON files in batches

### Why Two Steps?

✅ **Faster**: Generate report once, use it multiple times  
✅ **Auditable**: Review claims before generating transactions  
✅ **Flexible**: Manually edit claims report if needed  
✅ **Reliable**: No API rate limits when generating transactions

📖 **See [WORKFLOW_COMPARISON.md](./WORKFLOW_COMPARISON.md) for detailed comparison with the old workflow**

## Configuration

### Dual-Stream Generation with Claim Deduction

Edit `generatePushPaymentWithClaimDeduction.js`:

```javascript
const CONFIG = {
    // Can be a single file or an array of files
    transactionFileNames: [
        "1.json",
        "2.json",  // Add more files as needed
        "3.json",
    ],
    claimsReportFileName: "claims_report.json",
    onlyUsersWithClaims: false,  // false = all users, true = only users who claimed
    
    // New stream start time
    newStreamStartTimestamp: 0,  // 0 = now, or specify Unix timestamp
    // Example: 1760371200 for Oct 13, 2025 16:00:00 GMT
};
```

**Features:**
- 🎯 **Dual-Stream**: Creates two vestings per user (immediate + weekly)
- 📊 **Smart Calculation**: Calculates releasable amount from ALL streams combined
- 💰 **Claim Deduction**: Deducts already-claimed tokens from total releasable
- ⚠️  **Over-Claim Handling**: Handles cases where users claimed more than vested
- 📁 **Multiple Files**: Process multiple transaction files in one run
- 🔄 **Cross-File Merging**: Merges users across ALL files, summing their streams
- 🎯 **One Pair Per User**: Each unique user gets ONE pair of streams (immediate + weekly)

### How It Works

**Step 1: Merge Users Across ALL Files**
1. For each file, extract timing (`start`, `cliff`, `end`)
2. Calculate actual vesting start: `originalStart + originalCliff`
3. For each user in the file, calculate:
   - Releasable: `totalAmount * (newStart - actualStart) / (end - actualStart)`
   - Unvested: `totalAmount - releasable`
4. If user appears in multiple files, SUM their amounts:
   - `totalAmount = sum of all stream amounts`
   - `totalReleasable = sum of all releasable amounts`
   - `totalUnvested = sum of all unvested amounts`

**Step 2: Apply Claim Deductions**
1. Deduct claimed from releasable: `immediateAmount = totalReleasable - claimed`
2. If over-claimed: deduct excess from unvested
3. Skip users who are fully claimed

**Step 3: Generate Dual Streams**
- Stream 1: Immediate (1s) for `immediateAmount`
- Stream 2: Weekly (7d) for `totalUnvested`

⚠️ **Important**: 
- Uses **FIRST file only** for contract addresses (Safe, payment router, token)
- **Merges users across ALL files** to calculate total vested/unvested
- Each unique user gets **ONE pair** of streams (not multiple pairs)

📖 **See [DUAL_STREAM_GUIDE.md](./DUAL_STREAM_GUIDE.md) for detailed examples and calculations**

### Legacy Script Configuration

Edit `pushPaymentWithClaimCheckAPI.js`:

```javascript
const CONFIG = {
    transactionFileName: "1.json",  // Single file only
    polygonScanApiKey: process.env.POLYGONSCAN_API_KEY,
    apiUrl: "https://api.polygonscan.com/api",
    checkClaims: true,
    onlyFilteredUsers: false
};
```

## Available Commands

### Test the Approach (Recommended First!)
```bash
npm test
```
Tests claim detection on the Payment Router to verify the approach works. Shows recent claim transactions and amounts.

### All-in-One (Recommended)
```bash
npm run generate-with-claims
```
Checks claims and generates transactions in one step.

### Two-Step Process
```bash
# Step 1: Check claims only
npm run check-claims

# Step 2: Review output, then generate transactions
npm run generate
```

## Output

The script generates:
- `PROJECT_NAME/addressToFilter.json` - Users and amounts to deduct
- `PROJECT_NAME/addressToFilter_detailed.json` - Includes transaction hashes
- `PROJECT_NAME/pushPayment/transactions_*.json` - Ready to import to Safe

## How It Works

Since payments were removed from the payment processor, the script:
1. Fetches ALL transaction history for the Payment Router from PolygonScan API (1 call)
2. Filters for successful transactions FROM your users (ClaimAll calls)
3. For each claim transaction, fetches the event logs
4. Parses Transfer events from the logs to get exact claimed amounts
5. Sums up total claimed amount per user
6. Deducts those amounts when generating new payment transactions

This approach is both **efficient** (1 API call to get all payment router transactions instead of 150+ calls for individual users) and **accurate** (looks at actual transaction logs/events), just like viewing them on [PolygonScan](https://polygonscan.com/tx/0x673893996fe55380656eede8b43fc2e95209763b3f550b42b9551381170938fe#eventlog).

**Important**: The script now detects token transfers from ANY source (not just the payment router), as tokens may be held in a vault contract.

## Etherscan API V2 (Multichain)

### Getting an API Key (Free)
1. Go to https://etherscan.io/apis
2. Sign up (free)
3. Create an API key (works for all chains including Polygon!)
4. Create a `.env` file in the project root:
   ```
   POLYGONSCAN_API_KEY=your_api_key_here
   ```

**Note**: As of August 2025, PolygonScan has merged with Etherscan's V2 API. One API key now works for Ethereum, Polygon, and 60+ other networks!

### Rate Limits (Free Tier)
- 5 calls per second
- 100,000 calls per day
- This script uses: 1 call (get payment router transactions) + 1 call per claim transaction (get logs)
- For 150 users with 12 claims, expect ~13 API calls total (very efficient!)
- Built-in 250ms delay between calls to respect rate limits

### Alternative: Environment Variable
Instead of `.env` file, you can set environment variable:
```bash
export POLYGONSCAN_API_KEY=your_api_key_here
```

Or hardcode in the script (not recommended):
```javascript
polygonScanApiKey: "your_actual_api_key"
```

## Troubleshooting

### "Invalid API Key" or "NOTOK"  
- **Create a `.env` file** with: `POLYGONSCAN_API_KEY=your_actual_key`
- Or set environment variable: `export POLYGONSCAN_API_KEY=your_key`
- Don't use "YourApiKeyToken" - get a real key from polygonscan.com

### "No transactions found"
- Could mean users haven't claimed yet (good!)
- Verify Payment Router and Token addresses are correct

### "Rate limit exceeded"
- Script includes 250ms delays between calls
- Very unlikely with this efficient approach (only ~10-20 API calls for typical projects)
- Free tier can easily handle thousands of users

## Example Output

```
✅ Project Configuration:
   Project Name: GRIDLOCK_SOCIAL_RECOVERY_WALLET
   Payment Router: 0x513E116779a0E4645d262c3d78190B4cC6bB47Dd
   Token Address: 0xA3dd6163B5742B0D8Cb7d79CB5DFE3F81F8F8fC4
   Users Found: 150

🔍 Checking claimed amounts via PolygonScan API...
📊 Fetching all Payment Router transactions...

   Found 2543 total transactions to Payment Router
   Found 12 claim transactions from our users

🔎 Analyzing transaction logs...

   [1/12] Analyzing tx 0xabc...
      ✓ User 0x1234...5678 claimed 450.5 tokens
        Block: 78746692

   [2/12] Analyzing tx 0xdef...
      ✓ User 0x9876...5432 claimed 320.75 tokens
        Block: 78544345

📋 SUMMARY
Total Users: 150
Users with Claims: 12
Users without Claims: 138
Total Claimed Amount: 5432.12 tokens

✅ Address filter data saved to: ./PROJECT_NAME/addressToFilter.json
Transaction file generated: ./PROJECT_NAME/pushPayment/transactions_batch1_....json
```

## Import to Safe

1. Go to your Safe Wallet
2. Apps → Transaction Builder
3. Upload the generated JSON files
4. Review transactions
5. Execute!

## Files

- **`test.js`** - Test script to verify claim detection works
- **`pushPaymentWithClaimCheckAPI.js`** - All-in-one script (recommended)
- **`checkClaimedAmountsViaAPI.js`** - Check claims only
- **`pushPaymentTransactionGenerator.js`** - Original generator (manual config)
- **`package.json`** - NPM scripts
- **`1.json`** - Your input transaction file

## Notes

- Script automatically checksums all addresses
- Transactions are batched in groups of 25 users
- All amounts are in wei (smallest token unit)
- The detailed output includes transaction hashes for verification

