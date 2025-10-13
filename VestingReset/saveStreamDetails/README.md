# Save Stream Details Scripts

Two scripts for checking and fetching stream data from the blockchain.

## 📋 Scripts

### 1. `checkActiveStreams.js` - Quick Active Stream Check

Quickly check if addresses have active payment streams (without fetching full stream data).

**Use when:**
- You want to verify if removals were successful
- You need a quick check before proposing new transactions
- You want to filter a list of addresses

**Usage:**
```bash
npm run check
```

**Configure the addresses:**
Edit `checkActiveStreams.js` line ~71:
```javascript
const addressesToCheck = [
    "0x313a58f11D8cF6f1667B7C8D615BD93B8c3F49Cb",
    "0xAnotherAddress...",
    // Add more addresses
];
```

**Output:**
- Console: Real-time status for each address
- File: `active_streams_check_YYYYMMDD_HHMMSS.json`

**Example Output:**
```
[1/3] Checking: 0x313a58f11D8cF6f1667B7C8D615BD93B8c3F49Cb
   ✅ Has active streams

[2/3] Checking: 0xAnotherAddress...
   ⭕ No active streams

📊 Summary:
   ✅ Active: 1
   ⭕ Inactive: 1
   ❌ Errors: 0
   📝 Total: 2
```

---

### 2. `fetchUserStreamData.js` - Full Stream Data Fetch

Fetch complete stream data (amounts, start/end times, releasable amounts) for all project users.

**Use when:**
- You need to generate new push payment transactions
- You want detailed information about all streams
- You're preparing for a vesting reset

**Usage:**
```bash
npm run fetch
```

**Configures automatically from:**
- `1.json` - EA1 users
- `2.json` - EA2 users
- `3.json` - EA3 users
- `4.json` - QACC users
- `5.json` - S2 users

**Output:**
- Console: Real-time progress for all users
- File: `X23/streamData/stream_data_X23_YYYYMMDD_HHMMSS.json`

**Processing Time:**
- ~4 minutes for 504 users (with 500ms delay between requests)

---

## 🚀 Setup (First Time)

```bash
cd saveStreamDetails
npm install
```

---

## 📊 Output Formats

### checkActiveStreams.js Output
```json
{
  "timestamp": "2025-10-13T12:00:00.000Z",
  "totalAddresses": 2,
  "activeCount": 1,
  "inactiveCount": 1,
  "errorCount": 0,
  "results": [
    {
      "address": "0x313a58f11D8cF6f1667B7C8D615BD93B8c3F49Cb",
      "hasActiveStreams": true,
      "status": "success"
    },
    {
      "address": "0xAnotherAddress...",
      "hasActiveStreams": false,
      "status": "success"
    }
  ]
}
```

### fetchUserStreamData.js Output
```json
{
  "projectName": "X23",
  "client": "0x6B5d37c206D56B16F44b0C1b89002fd9B138e9Be",
  "paymentProcessor": "0xD6F574062E948d6B7F07c693f1b4240aFeA41657",
  "totalUsers": 504,
  "successfulFetches": 503,
  "failedFetches": 1,
  "timestamp": "2025-10-13T12:00:00.000Z",
  "users": {
    "0x313a58f11d8cf6f1667b7c8d615bd93b8c3f49cb": {
      "address": "0x313a58f11d8cf6f1667b7c8d615bd93b8c3f49cb",
      "isActiveReceiver": true,
      "totalStreams": 1,
      "streams": [
        {
          "token": "0xc530B75465Ce3c6286e718110A7B2e2B64Bdc860",
          "streamId": "2",
          "amount": "3684799900000000000000",
          "released": "457936925337906041287",
          "start": "1750413600",
          "cliff": "0",
          "end": "1766224800",
          "releasable": "1829062499441092390204"
        }
      ]
    }
  }
}
```

---

## 📝 Common Use Cases

### Verify Removals Were Successful
After executing removal transactions in Safe:
```bash
# Edit checkActiveStreams.js to add the addresses you removed
npm run check

# Expected: All addresses show "No active streams"
```

### Before Creating New Vestings
```bash
# Check if any addresses still have active streams
npm run check

# If any are active, don't proceed with push payments yet
```

### Generate New Push Payments from Current State
```bash
# 1. Fetch current stream data
npm run fetch

# 2. Use the generated file in PushPaymentFromStreams
cd ../PushPaymentFromStreams
# Edit generatePushPaymentFromStreams.js:
# streamDataFile = '../saveStreamDetails/X23/streamData/stream_data_X23_*.json'
node generatePushPaymentFromStreams.js
```

---

## ⚠️ Important Notes

### Rate Limiting
Both scripts include delays between requests to avoid RPC rate limiting:
- `checkActiveStreams.js`: 300ms delay
- `fetchUserStreamData.js`: 500ms delay + exponential backoff on errors

### Circuit Breaker
`fetchUserStreamData.js` includes a circuit breaker that automatically:
- Detects rate limit errors
- Implements exponential backoff (2s → 4s → 8s → 16s → 32s)
- Opens the circuit after repeated failures
- Retries up to 5 times per request

### Stopping a Running Script
Press **`Ctrl+C`** in the terminal.

---

## 🔧 Configuration

### RPC URL
Both scripts use `https://polygon-rpc.com` by default.

To use a different RPC (e.g., Alchemy, Infura):
```javascript
const RPC_URL = "https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY";
```

### Contract Addresses
```javascript
const paymentProcessorAddress = "0xD6F574062E948d6B7F07c693f1b4240aFeA41657";
const paymentRouterAddress = "0x6B5d37c206D56B16F44b0C1b89002fd9B138e9Be";
```

---

## 🆘 Troubleshooting

### "Cannot find module 'ethers'"
```bash
npm install
```

### "Rate limit exceeded"
The scripts handle this automatically with retries and delays. If it persists:
1. Use a premium RPC provider (Alchemy, Infura)
2. Increase delays in the script
3. Process fewer addresses at a time

### "All requests failed"
- Check your internet connection
- Verify RPC URL is working
- Try a different RPC provider

---

## 📚 Related Scripts

- **`generateRemovePaymentsTransactions.js`** - Generates removal transactions
- **`generatePushPaymentFromStreams.js`** - Generates new vesting transactions
- **`SafeTransactionProposer/proposeSafeTransactions.js`** - Proposes to Safe

---

## 🎯 Typical Workflow

```
1. fetchUserStreamData.js       → Get current state
2. generateRemovePayments...    → Create removal txs
3. propose + execute removals   → Clear old streams
4. checkActiveStreams.js        → Verify removals ✓
5. generatePushPaymentFrom...   → Create new vestings
6. propose + execute payments   → Apply new vestings
```

