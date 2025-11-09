# Dual-Stream Generation Guide

## Overview

The `generatePushPaymentWithClaimDeduction.js` script creates **TWO vesting streams per user** (similar to `PushPaymentFromStreams`), with automatic claim deduction.

## How It Works

### 1. Calculate Vesting State

```
Original Vesting:
├─ Start: May 13, 2025
├─ Cliff: 153 days
├─ Actual Vesting Start: Oct 13, 2025 (start + cliff)
└─ End: Mar 13, 2026

New Stream Start: Nov 9, 2025 (configurable)
```

### 2. Calculate Releasable Amount

Using **linear vesting** formula:
```
releasable = totalAmount * (newStart - actualStart) / (end - actualStart)
```

Example:
- Total: 1000 tokens
- Time elapsed: 27 days (Nov 9 - Oct 13)
- Total duration: 153 days (Oct 13 - Mar 13)
- Releasable: 1000 * (27/153) = 176.47 tokens

### 3. Deduct Claims

```
immediateAmount = releasable - claimed
unvestedAmount = totalAmount - releasable
```

**If user over-claimed** (claimed > releasable):
```
excessClaimed = claimed - releasable
immediateAmount = 0
unvestedAmount = unvestedAmount - excessClaimed
```

### 4. Generate Two Streams

**Stream 1: Immediate (1 second)**
- Amount: `immediateAmount`
- Start: `newStreamStart`
- Cliff: 0
- End: `newStreamStart + 1`
- Purpose: Claimable immediately

**Stream 2: Weekly (7 days)**
- Amount: `unvestedAmount`
- Start: `newStreamStart`
- Cliff: 0
- End: `newStreamStart + 604800` (7 days)
- Purpose: Vests linearly over 7 days

## Configuration

```javascript
const CONFIG = {
    transactionFileNames: ["1.json"], // or ["1.json", "2.json", ...]
    claimsReportFileName: "claims_report.json",
    onlyUsersWithClaims: false,
    
    // Set to 0 to use current time, or specify Unix timestamp
    newStreamStartTimestamp: 0,
    // Example: 1760371200 for Oct 13, 2025 16:00:00 GMT
};
```

## Example Calculation

### User A: Normal Case
```
Total Amount: 1000 tokens
Releasable (Nov 9): 176.47 tokens
Claimed: 50 tokens

→ Immediate (1s): 126.47 tokens (176.47 - 50)
→ Weekly (7d): 823.53 tokens (1000 - 176.47)
```

### User B: Over-Claimed
```
Total Amount: 1000 tokens
Releasable (Nov 9): 176.47 tokens
Claimed: 300 tokens (over-claimed by 123.53)

→ Immediate (1s): 0 tokens
→ Weekly (7d): 700 tokens (823.53 - 123.53)
```

### User C: Fully Claimed
```
Total Amount: 1000 tokens
Releasable (Nov 9): 176.47 tokens
Claimed: 1100 tokens (fully claimed + excess)

→ Skipped (no transactions generated)
```

## Output Example

```json
{
  "transactions": [
    {
      "contractMethod": "pushPayment(...)",
      "contractInputsValues": [
        "0x1bD43F...",          // user address
        "0x0D9B0...",            // token address
        "6606984782223448614",   // immediate amount
        "1762714322",            // start
        "0",                     // cliff
        "1762714323"             // end (start + 1)
      ]
    },
    {
      "contractMethod": "pushPayment(...)",
      "contractInputsValues": [
        "0x1bD43F...",          // same user
        "0x0D9B0...",            // same token
        "30180415217776551386",  // weekly amount
        "1762714322",            // start
        "0",                     // cliff
        "1763319122"             // end (start + 604800)
      ]
    }
  ]
}
```

## Benefits

✅ **Fair Distribution**: Users get immediately what they've already earned  
✅ **Predictable**: 7-day vesting for remaining tokens  
✅ **Claim-Aware**: Automatically accounts for previous claims  
✅ **Over-Claim Safe**: Handles edge cases where users claimed too much  
✅ **Compatible**: Works with existing Safe Transaction Builder

## Important Notes

⚠️ **Time Accuracy**: The new stream start should be in the future when transactions execute  
⚠️ **Linear Vesting**: Assumes original vesting was linear (no acceleration/deceleration)  
⚠️ **Token Precision**: All calculations use BigInt for precision  
⚠️ **Over-Claims**: Script handles but warns about over-claims in logs

---

**Last Updated:** November 9, 2025

