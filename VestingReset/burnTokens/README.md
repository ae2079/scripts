# Generate Remove Payment Transactions (With Active Stream Filtering)

Generates transactions to remove payment streams **only for users who have active streams**.

## 🎯 What It Does

This script:
1. ✅ Reads all user addresses from transaction files (1-5.json)
2. ✅ **Checks each user on-chain** to see if they have active payment streams
3. ✅ **Filters to only include active users** (skips those with no streams)
4. ✅ Generates removal transactions **only for users with active streams**
5. ✅ Batches transactions into groups of 25

## 🚀 Usage

### Environment Setup

1. **Copy the environment template:**
   ```bash
   cp env.example .env
   ```

2. **Edit `.env` file with your RPC URL:**
   ```bash
   # Use your paid RPC provider for better rate limits
   RPC_URL=https://your-paid-rpc-provider.com/your-api-key
   ```

   **Recommended RPC providers:**
   - Alchemy: `https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY`
   - Infura: `https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID`
   - QuickNode: `https://polygon-mainnet.quiknode.pro/YOUR_API_KEY/`

   **Note:** Using a paid RPC provider is recommended for better rate limits and reliability when checking hundreds of users.

### Quick Start

```bash
cd burnTokens
npm run generate
```

or

```bash
node generateRemovePaymentsTransactions.js
```

### What Happens

```
📖 Reading transaction files...
✅ Successfully read transaction file: 4.json
✅ Successfully read transaction file: 1.json
... (reading all files)

📊 User Statistics:
   Total EA users: 5
   QACC S1 users: 480
   S2 users: 28
   Total users: 504

🔍 Filtering 504 users for active payment streams...
📍 Payment Processor: 0xD6F574062E948d6B7F07c693f1b4240aFeA41657
📍 Client: 0x6B5d37c206D56B16F44b0C1b89002fd9B138e9Be

   [10/504] Active: 8, Inactive: 2
   [20/504] Active: 15, Inactive: 5
   ... (continues checking all users)

📊 Filtering Summary:
   ✅ Active users (will remove): 350
   ⭕ Inactive users (skipped): 154
   ❌ Errors: 0
   📝 Total checked: 504

🔨 Generating removal transactions for 350 active users...

📁 Created project folder: ./X23
📁 Created removePayment folder: ./X23/removePayment
Transaction file generated: ./X23/removePayment/transactions_batch1_*.json
Transaction file generated: ./X23/removePayment/transactions_batch2_*.json
...

✅ Done!
📄 Generated removal transactions for 350 users with active streams
```

## ⏱️ Processing Time

- **~2-3 minutes** for 504 users
- 300ms delay between each user check (to avoid rate limiting)
- Progress updates every 10 users

## 📁 Output

Generated files in `X23/removePayment/`:
```
transactions_batch1_YYYYMMDD_HHMMSS.json
transactions_batch2_YYYYMMDD_HHMMSS.json
...
transactions_batchN_YYYYMMDD_HHMMSS.json
```

**Only users with active streams** are included in the output files.

## 🎯 Key Features

### 1. **Smart Filtering**
- Only generates transactions for users who actually have active streams
- Saves gas by not including unnecessary removal transactions
- Reduces the number of transactions to sign and execute in Safe

### 2. **On-Chain Verification**
- Calls `isActivePaymentReceiver()` on the Payment Processor contract
- Real-time check ensures accuracy
- Skips users who have already had their streams removed

### 3. **Progress Tracking**
- Shows progress every 10 users
- Displays running count of active vs inactive
- Final summary with statistics

### 4. **Circuit Breaker & Retry Mechanism**
- **Automatic retries**: Up to 5 attempts per failed request
- **Exponential backoff**: 2s → 4s → 8s → 16s → 32s → 60s (max)
- **Rate limit detection**: Automatically detects rate limit errors (code -32090, 429, "Too many requests")
- **Circuit breaker**: Opens when rate limited, waits 1 minute before retrying
- **Continues processing**: Even if some checks fail after retries, continues with other users

### 5. **Error Handling**
- Retries failed requests automatically
- Reports errors but doesn't stop the script
- Shows error count in final summary
- Logs detailed retry information

## 📊 Example Scenarios

### Scenario 1: First Time Running (All Users Have Streams)
```
Total users: 504
Active users: 504
Inactive users: 0

Result: 21 batch files generated (504 / 25 = 21)
```

### Scenario 2: After Some Removals Executed
```
Total users: 504
Active users: 250
Inactive users: 254

Result: 10 batch files generated (250 / 25 = 10)
```

### Scenario 3: All Streams Already Removed
```
Total users: 504
Active users: 0
Inactive users: 504

Result: No files generated, message shown:
⚠️  No active users found. No removal transactions needed!
```

## 🔧 Configuration

The script reads from these files:
- `1.json` - EA1 users + **Project configuration source**
- `2.json` - EA2 users  
- `3.json` - EA3 users
- `4.json` - QACC users
- `5.json` - S2 users

**Project Configuration:**
The script automatically reads project configuration from `1.json`:
- Project name: `projectName` field
- Payment router: `queries.addresses.paymentRouter`
- Orchestrator: `queries.addresses.orchestrator`
- Safe: `inputs.projectConfig.SAFE`
- Payment processor: `queries.addresses.paymentProcessor`

**To use a different project:**
1. Replace `1.json` with your project's report file
2. Update the `reportFile` variable in the script if using a different filename
3. The script will automatically extract all configuration from the report file

**RPC URL:**
Configured via `.env` file (see Environment Setup section above)

## ⚠️ Important Notes

### Rate Limiting & Circuit Breaker
- **300ms delay** between each check (when circuit is closed)
- **Automatic retry** with exponential backoff on failures
- **Circuit breaker** opens on rate limit, waits 1 minute before continuing
- **Example of circuit breaker in action**:
  ```
  [45/504] Active: 35, Inactive: 10, Errors: 0
     ⚠️  Rate limit detected (attempt 1/6)
     🔄 Retrying checking 0xAddress... after 2.0s delay...
     ⏸️  Sleeping for 2.0 seconds...
     ⚠️  Rate limit detected (attempt 2/6)
     🔄 Retrying checking 0xAddress... after 4.0s delay...
     🔴 Circuit breaker OPEN. Waiting 60.0s before retry...
     🟡 Circuit breaker half-open. Attempting request...
     🟢 Circuit breaker CLOSED. Request successful after 3 failures.
  [46/504] Active: 36, Inactive: 10, Errors: 0
  ```
- If rate limits persist, consider using a premium RPC (Alchemy, Infura)

### Batching
- 25 transactions per batch (Safe's recommended limit)
- Batches are sequentially numbered
- All batches use the same timestamp

### Checksum Addresses
- All addresses are automatically checksummed
- Compatible with Safe Transaction Builder

## 🆘 Troubleshooting

### "Cannot find module 'ethers'"
```bash
npm install
```

### Script hangs or is very slow
- **Normal behavior**: Circuit breaker may cause 1-minute delays when rate limited
- Check your internet connection
- Verify RPC URL is responsive
- Consider using a premium RPC provider (Alchemy, Infura)
- Look for retry/circuit breaker messages in console

### Getting rate limit errors
- **The script handles this automatically** with retries and circuit breaker
- If you see retry messages, just wait - it will recover
- Circuit breaker will wait 1 minute when rate limited, then retry
- After 5 retries, the user will be marked as error but script continues
- To avoid rate limits entirely:
  - Use a premium RPC (Alchemy, Infura with higher rate limits)
  - Increase the delay between checks (edit line 195 in script)

### All users showing as inactive (but you know they have streams)
- Check the RPC URL is correct
- Verify contract addresses are correct for your network
- Ensure you're on the right network (Polygon Mainnet = chainId 137)

### Want to test with fewer users first
Edit the script to test with a small subset:
```javascript
// In main() function, after totalUsers is defined:
const testUsers = totalUsers.slice(0, 10); // Test with first 10 users
const activeUsers = await filterActiveUsers(testUsers, paymentRouterAddress, paymentProcessor);
```

## 📋 Next Steps

After generating removal transactions:

```bash
cd ../SafeTransactionProposer
npm run propose:batch ../burnTokens/X23/removePayment
```

Then:
1. Go to Safe UI
2. Approve and execute all removal batches
3. Wait for confirmations
4. Verify streams are removed using `checkActiveStreams.js`
5. Then proceed with generating and proposing push payments

## 🔗 Related Scripts

- **`../saveStreamDetails/checkActiveStreams.js`** - Quick check if addresses have active streams
- **`../saveStreamDetails/fetchUserStreamData.js`** - Fetch full stream details
- **`../PushPaymentFromStreams/generatePushPaymentFromStreams.js`** - Generate new vestings
- **`../SafeTransactionProposer/proposeSafeTransactions.js`** - Propose to Safe

## 💡 Pro Tips

1. **Run `checkActiveStreams.js` first** to get a quick count of active users before generating removal transactions
2. **Save the output** to compare before/after removal execution
3. **Check transaction files** before proposing to Safe to ensure the right users are included
4. **Keep old transaction files** as a backup/reference

## 📊 Comparison with Original Script

| Feature | Old Script | New Script |
|---------|-----------|------------|
| User filtering | None (all users) | Active streams only |
| On-chain checks | No | Yes (real-time) |
| Efficiency | Generates unnecessary txs | Only necessary txs |
| Gas savings | No | Yes (fewer transactions) |
| Progress tracking | Basic | Detailed (every 10 users) |
| Error handling | Basic | Robust (continues on errors) |
| Retry mechanism | No | Yes (up to 5 retries) |
| Circuit breaker | No | Yes (rate limit protection) |
| Exponential backoff | No | Yes (2s → 4s → 8s → 16s → 32s) |
| Rate limit handling | Fails | Auto-recovers with delays |

---

**Ready to generate removal transactions!** 🚀

Just run `npm run generate` and it will automatically filter to only users with active streams.

