# Quick Start Guide

Generate pushPayment transactions from stream data with immediate + weekly vestings.

## 🚀 Setup (One Time)

```bash
cd PushPaymentFromStreams
npm install
```

## 📝 Usage

### 1. Edit Configuration

Open `generatePushPaymentFromStreams.js` and update the configuration:

**File paths (lines ~325-326):**
```javascript
const streamDataFile = '../X23/streamData/stream_data_X23_20250113_123456.json';
const configFile = '../1.json';
```

**Vesting start times (lines ~25-31):**
```javascript
const IMMEDIATE_VESTING_START_TIMESTAMP = 0; // 0 = use current timestamp
const WEEKLY_VESTING_START_TIMESTAMP = 0; // 0 = use current timestamp
```

Options for both:
- `0` - Use current timestamp (start immediately) - **Default**
- `1736780000` - Specific Unix timestamp in seconds for future start date

### 2. Run the Script

```bash
npm run generate
```

or

```bash
node generatePushPaymentFromStreams.js
```

### 3. Output Location

Transactions will be saved to: `../[PROJECT_NAME]/pushPayment/`

Example: `../X23/pushPayment/transactions_X23_batch1_*.json`

## 💡 What It Does

For each user with streams:
1. **Calculates**:
   - `Immediate` = claimable now (releasable)
   - `Weekly` = total - released - releasable (unvested)

2. **Creates 2 vestings**:
   - **Vesting 1**: Immediate amount, 1 second duration
   - **Vesting 2**: Weekly amount, 7 days duration

3. **Generates** Safe Transaction Builder compatible JSON files

## 📊 Example

User has:
- Total: 1000 tokens
- Claimed: 300 tokens
- Claimable: 200 tokens
- Unvested: 500 tokens

Script creates:
- ✅ Transaction 1: 200 tokens (1 second vesting)
- ✅ Transaction 2: 500 tokens (7 days vesting)

## 🔄 Next Steps

After generating transactions:

```bash
cd ../SafeTransactionProposer
npm run propose:batch ../X23/pushPayment
```

Then review in Safe UI: https://app.safe.global

## ⚠️ Important

1. **Remove old streams first** using `generateRemovePaymentsTransactions.js`
2. **Execute removals** in Safe before creating new vestings
3. **Fresh stream data** - run `fetchUserStreamData.js` to get current state

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| "No transactions generated" | All users fully claimed or have errors |
| "Cannot find module" | Run `npm install` |
| "File not found" | Check streamDataFile and configFile paths |
| Wrong amounts | Re-fetch stream data with fetchUserStreamData.js |

## 📚 Full Documentation

See [README.md](./README.md) for complete documentation.

