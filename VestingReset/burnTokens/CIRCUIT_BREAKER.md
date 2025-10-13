# Circuit Breaker & Retry Mechanism

## 🛡️ Overview

The script now includes a robust circuit breaker and retry mechanism to handle RPC rate limits automatically.

## 🔄 How It Works

### 1. **Automatic Retry**
When a request fails, it automatically retries up to **5 times** with increasing delays:

```
Attempt 1: Wait 2 seconds
Attempt 2: Wait 4 seconds
Attempt 3: Wait 8 seconds
Attempt 4: Wait 16 seconds
Attempt 5: Wait 32 seconds
Attempt 6: Wait 60 seconds (max)
```

### 2. **Rate Limit Detection**
Automatically detects these rate limit indicators:
- Error code: `-32090`
- Error code: `429`
- Error code: `BAD_DATA` (ethers wrapper)
- Message contains: "rate limit"
- Message contains: "too many requests"
- Message contains: "call rate limit exhausted"

### 3. **Circuit Breaker States**

#### 🟢 **CLOSED** (Normal Operation)
- All requests go through normally
- 300ms delay between checks
- No failures detected

#### 🔴 **OPEN** (Rate Limited)
- Opens when rate limit is detected
- Waits **60 seconds** before attempting any more requests
- Prevents hammering the RPC endpoint
- All subsequent requests wait for circuit to close

#### 🟡 **HALF-OPEN** (Testing Recovery)
- After 60-second wait, circuit tries one request
- If successful → Circuit closes ✅
- If fails → Circuit remains open, wait another 60 seconds

## 📊 Console Output Examples

### Normal Operation
```
[10/504] Active: 8, Inactive: 2, Errors: 0
[20/504] Active: 15, Inactive: 5, Errors: 0
```

### Single Retry (Non-Rate-Limit Error)
```
[45/504] Active: 35, Inactive: 10, Errors: 0
   ⚠️  Request failed (attempt 1/6): Connection timeout...
   🔄 Retrying checking 0xAddress... after 1.0s delay...
   ⏸️  Sleeping for 1.0 seconds...
[46/504] Active: 36, Inactive: 10, Errors: 0
```

### Rate Limit with Circuit Breaker
```
[45/504] Active: 35, Inactive: 10, Errors: 0
   ⚠️  Rate limit detected (attempt 1/6)
   🔄 Retrying checking 0xAddress... after 2.0s delay...
   ⏸️  Sleeping for 2.0 seconds...
   ⚠️  Rate limit detected (attempt 2/6)
   🔄 Retrying checking 0xAddress... after 4.0s delay...
   ⏸️  Sleeping for 4.0 seconds...
   🔴 Circuit breaker OPEN. Waiting 60.0s before retry...
   ⏸️  Sleeping for 60.0 seconds...
   🟡 Circuit breaker half-open. Attempting request...
   🟢 Circuit breaker CLOSED. Request successful after 2 failures.
[46/504] Active: 36, Inactive: 10, Errors: 0
```

### Multiple Failures Leading to Error
```
[100/504] Active: 80, Inactive: 19, Errors: 0
   ⚠️  Rate limit detected (attempt 1/6)
   ... (retries 2-5)
   ❌ Max retries (5) reached for checking 0xAddress...
   ❌ Failed after retries for 0xAddress: Too many requests...
[101/504] Active: 80, Inactive: 20, Errors: 1
```

## ⚙️ Configuration

Located in `generateRemovePaymentsTransactions.js`:

```javascript
const CIRCUIT_BREAKER_CONFIG = {
    maxRetries: 5,              // Max retry attempts per request
    initialDelayMs: 2000,       // Start with 2 seconds
    maxDelayMs: 600000,         // Max 10 minutes (not usually reached)
    backoffMultiplier: 2,       // Double delay each retry
    rateLimitDelay: 60000,      // 1 minute when circuit opens
};
```

### To Adjust Settings:

**More aggressive (faster, riskier):**
```javascript
initialDelayMs: 1000,    // 1 second
rateLimitDelay: 30000,   // 30 seconds
```

**More conservative (slower, safer):**
```javascript
initialDelayMs: 5000,    // 5 seconds
rateLimitDelay: 120000,  // 2 minutes
```

## 🎯 Benefits

### 1. **Resilience**
- Script doesn't crash on rate limits
- Automatically recovers from temporary failures
- Completes successfully even with intermittent issues

### 2. **Efficiency**
- Backs off when rate limited (doesn't waste retries)
- Waits appropriate time before retrying
- Continues processing other users while waiting

### 3. **Transparency**
- Shows exactly what's happening
- Clear visual indicators (🟢🟡🔴)
- Detailed retry information

### 4. **No Manual Intervention**
- Handles rate limits automatically
- No need to restart script
- Just wait and it recovers

## 📈 Expected Behavior

### Scenario 1: No Rate Limits
```
Processing time: ~2-3 minutes for 504 users
Rate: ~3 users per second
No circuit breaker activation
```

### Scenario 2: Occasional Rate Limits
```
Processing time: ~5-10 minutes for 504 users
Circuit opens 2-3 times
Each opening adds 60 seconds
Still completes successfully
```

### Scenario 3: Severe Rate Limiting
```
Processing time: 15-30 minutes for 504 users
Circuit opens frequently
Many 60-second waits
Most users still checked successfully
Some marked as errors after 5 retries
```

## ⚠️ When Circuit Breaker Activates

**This is NORMAL and EXPECTED behavior!**

✅ **What to do:** Just wait - the script is handling it
✅ **Don't:** Stop the script and restart
✅ **Don't:** Worry about the delays
✅ **Do:** Consider using a premium RPC for next time

## 🔧 Premium RPC Options

To avoid rate limits entirely:

### Alchemy
```javascript
const RPC_URL = "https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY";
```
- Free tier: 300M compute units/month
- Paid: Higher limits

### Infura
```javascript
const RPC_URL = "https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID";
```
- Free tier: 100k requests/day
- Paid: Higher limits

### QuickNode
```javascript
const RPC_URL = "https://YOUR_ENDPOINT.quiknode.pro/YOUR_TOKEN/";
```
- Various paid tiers
- Very high rate limits

## 📊 Success Criteria

The script is working correctly if:
- ✅ Shows progress updates
- ✅ Continues after retries
- ✅ Circuit breaker opens and closes
- ✅ Eventually completes with most users checked
- ✅ Generates transaction files at the end

The script has issues if:
- ❌ Crashes immediately
- ❌ Hangs forever without progress
- ❌ All users show as errors
- ❌ No transaction files generated

## 💡 Pro Tips

1. **Run during off-peak hours** - Less RPC congestion
2. **Use premium RPC** - Avoid rate limits entirely
3. **Check output files** - Verify correct users included
4. **Keep console output** - Helpful for debugging
5. **Don't restart on retries** - Let circuit breaker work

---

**The circuit breaker makes the script resilient and production-ready!** 🚀

