# Quick Start - Check Active Streams

## 🎯 What It Does

Quickly checks if addresses have active payment streams (yes/no) without fetching full details.

**Perfect for:**
- ✅ Verifying removal transactions worked
- ✅ Quick status check before creating new vestings
- ✅ Filtering addresses by stream status

---

## 🚀 Usage

### 1. Edit the Address List

Open `checkActiveStreams.js` and find line ~71:

```javascript
const addressesToCheck = [
    "0x313a58f11D8cF6f1667B7C8D615BD93B8c3F49Cb",
    // Add more addresses here
];
```

**Add your addresses** (one per line):
```javascript
const addressesToCheck = [
    "0x313a58f11D8cF6f1667B7C8D615BD93B8c3F49Cb",
    "0xAnotherAddress123...",
    "0xYetAnotherAddress456...",
];
```

### 2. Run the Script

```bash
cd saveStreamDetails
npm run check
```

### 3. Check Results

**Console output** shows real-time status:
```
[1/3] Checking: 0x313a58f11D8cF6f1667B7C8D615BD93B8c3F49Cb
   ✅ Has active streams

[2/3] Checking: 0xAnotherAddress...
   ⭕ No active streams
```

**JSON file** saved automatically:
- `active_streams_check_2025-10-13_1217.json`

---

## 📊 Example Workflow

### After Executing Removal Transactions

```bash
# 1. Edit checkActiveStreams.js with your addresses
# 2. Run the check
npm run check

# 3. Look for this in output:
📊 Summary:
   ✅ Active: 0        ← Should be 0 after successful removals!
   ⭕ Inactive: 504    ← All users should be inactive
   ❌ Errors: 0
```

**✅ If Active = 0**: Proceed with new push payments  
**❌ If Active > 0**: Some removals didn't execute, check Safe UI

---

## 🔍 Reading the Output

### Console Symbols
- ✅ = Has active streams (removal needed)
- ⭕ = No active streams (ready for new payments)
- ❌ = Error checking address

### JSON File
```json
{
  "activeCount": 1,        // Count of addresses with streams
  "inactiveCount": 0,      // Count without streams
  "errorCount": 0,         // Failed checks
  "results": [
    {
      "address": "0x313a...",
      "hasActiveStreams": true,    // ← Key field!
      "status": "success"
    }
  ]
}
```

---

## 💡 Tips

### Check Specific Users
```javascript
// Just check the users you're testing with
const addressesToCheck = [
    "0x313a58f11D8cF6f1667B7C8D615BD93B8c3F49Cb",
];
```

### Check All Project Users
Copy addresses from transaction files or use the full stream data.

### Before Each Vesting Update
Always run this check before proposing new push payments to avoid "execution reverted" errors.

---

## ⚠️ Common Scenarios

### Scenario 1: Before Removals
```
✅ Active: 504
⭕ Inactive: 0
```
**Status**: Old streams exist, proceed with removal transactions

### Scenario 2: After Removals (Success)
```
✅ Active: 0
⭕ Inactive: 504
```
**Status**: ✅ Ready for new push payments!

### Scenario 3: After Removals (Partial)
```
✅ Active: 50
⭕ Inactive: 454
```
**Status**: ⚠️ Some removals didn't execute. Check Safe and execute remaining batches.

---

## 🚨 When to Use Each Script

| Task | Script | Time |
|------|--------|------|
| Quick yes/no check | `checkActiveStreams.js` | ~30 seconds |
| Full stream details | `fetchUserStreamData.js` | ~4 minutes |
| Verify removals worked | `checkActiveStreams.js` | ~30 seconds |
| Generate new vestings | `fetchUserStreamData.js` | ~4 minutes |

---

## 📚 Next Steps

After confirming **no active streams**:

```bash
cd ../PushPaymentFromStreams
# Make sure your push payment transactions are ready
ls -l X23AI/pushPayment/

cd ../SafeTransactionProposer
# Propose the new vestings
npm run propose:batch ../PushPaymentFromStreams/X23AI/pushPayment
```

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot find module 'ethers'" | Run `npm install` |
| Script hangs | Press `Ctrl+C` and check RPC URL |
| All show as active after removals | Removals not executed in Safe yet |
| Some addresses show error | Check address format (must be valid Ethereum address) |

---

**See `README.md` for full documentation!**

