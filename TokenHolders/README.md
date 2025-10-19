# Token Holders Fetcher

Get all token holders for any ERC20 token on Polygon network.

## Features

- ⚡ **Fast API method** (10-100x faster) using PolygonScan API
- 🔗 **RPC method** (backup) for direct blockchain scanning
- 🔐 **Secure** configuration using `.env` file
- 📊 **Export** results to JSON and CSV
- 📈 **Analytics** including holder rankings, distribution, and concentration

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Get Free PolygonScan API Key

1. Sign up at https://polygonscan.com/register
2. Get your API key at https://polygonscan.com/myapikey

### 3. Configure Environment

```bash
# Copy example file
cp .env.example .env

# Edit .env and add your settings:
# POLYGONSCAN_API_KEY=YourActualAPIKey
# TOKEN_ADDRESS=0xYourTokenAddress
```

### 4. Run

```bash
# Using API method (recommended - fast)
node getTokenHoldersAPI.js

# Or specify token on command line
node getTokenHoldersAPI.js 0xTokenAddress

# Using RPC method (slower, no API key needed)
node getTokenHolders.js 0xTokenAddress
```

## Configuration

Create a `.env` file with your settings:

```bash
# Required
POLYGONSCAN_API_KEY=YourApiKey
TOKEN_ADDRESS=0xYourTokenAddress

# Optional (have defaults)
MIN_BALANCE=0.0001
OUTPUT_DIR=./output
RPC_URL=https://polygon-rpc.com
PAGE_SIZE=10000
API_DELAY=250
```

## Methods

### API Method (Recommended ⚡)

**File:** `getTokenHoldersAPI.js`

- 10-100x faster than RPC
- Requires free PolygonScan API key
- Handles large tokens (500K+ holders)
- Free tier: 5 requests/second

```bash
node getTokenHoldersAPI.js 0xTokenAddress
```

### RPC Method (Backup)

**File:** `getTokenHolders.js`

- No API key needed
- Direct blockchain scanning
- Slower but works without registration

```bash
node getTokenHolders.js 0xTokenAddress
```

## Output

Results are saved in the `output/` directory:

- `token_holders_SYMBOL_timestamp.json` - Complete data with statistics
- `token_holders_SYMBOL_timestamp.csv` - Spreadsheet format

### JSON Output Example

```json
{
  "metadata": {
    "name": "Token Name",
    "symbol": "TOKEN",
    "decimals": 18,
    "totalSupply": "1000000000"
  },
  "statistics": {
    "totalHolders": 5000,
    "averageBalance": "200000",
    "top10Concentration": "45.67%"
  },
  "holders": [
    {
      "rank": 1,
      "address": "0x...",
      "balance": "50000000",
      "percentage": "5.000000"
    }
  ]
}
```

## NPM Scripts

```bash
npm test              # Test setup
npm start             # Run API method
npm run fetch:api     # Run API method
npm run fetch:rpc     # Run RPC method
npm run batch         # Batch analyze multiple tokens
```

## Batch Analysis

To analyze multiple tokens, edit `batchAnalyze.js` and set tokens to `enabled: true`:

```javascript
const TOKENS_TO_ANALYZE = [
    {
        name: "USDC",
        address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        enabled: true
    }
];
```

Then run:
```bash
npm run batch
```

## Examples

```bash
# USDC on Polygon
node getTokenHoldersAPI.js 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174

# WMATIC
node getTokenHoldersAPI.js 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270
```

## Troubleshooting

### "Invalid API Key"
- Get API key at https://polygonscan.com/myapikey
- Make sure it's correctly set in `.env`
- No spaces: `POLYGONSCAN_API_KEY=ABC123`

### "Rate limit exceeded"
- Increase `API_DELAY` in `.env` to 500
- Free tier: 5 requests/second

### Script too slow
- Use API method instead of RPC method
- API method is 10-100x faster

### "Invalid token address"
- Address must start with `0x`
- Verify it's a Polygon token (not Ethereum)

## Performance

| Token Size | API Method | RPC Method |
|-----------|-----------|-----------|
| 500 holders | 3 seconds | 2 minutes |
| 10K holders | 12 seconds | 10 minutes |
| 50K holders | 30 seconds | 30 minutes |
| 500K+ holders | 3 minutes | 2+ hours |

**Recommendation:** Always use API method for best performance.

## Vesting Data from Reports

### Get Locked, Claimed, and Claimable Amounts

**File:** `getVestingDataFromReports.js`

Fetches vesting data (locked, claimed, claimable amounts) for token holders from report files.

#### Features

- Read participant addresses from report JSON files
- Fetch vesting stream data from payment processor contract
- Get locked, claimed, and claimable amounts for each holder
- Retry logic with circuit breaker for rate limiting
- Export to JSON and CSV formats

#### Configuration

Add to your `.env` file:

```bash
# Vesting contract addresses
PAYMENT_PROCESSOR_ADDRESS=0xD6F574062E948d6B7F07c693f1b4240aFeA41657
PAYMENT_ROUTER_ADDRESS=0x6B5d37c206D56B16F44b0C1b89002fd9B138e9Be
```

#### Usage

1. Edit the script and add your report file paths:

```javascript
const reportFiles = [
    '../VestingReset/PushPaymentFromReports/reports/Season1/PROJECT/1.json',
    '../VestingReset/PushPaymentFromReports/reports/Season1/PROJECT/2.json'
];
```

2. Run the script:

```bash
node getVestingDataFromReports.js
```

#### Output

Results are saved in `vestingData/` directory:

- `vesting_data_PROJECT_timestamp.json` - Complete vesting data with streams
- `vesting_summary_PROJECT_timestamp.csv` - Summary for spreadsheets

#### Output Structure

```json
{
  "projectName": "ProjectName",
  "statistics": {
    "totalUsers": 100,
    "activeReceivers": 85,
    "usersWithVesting": 85
  },
  "users": {
    "0xaddress": {
      "address": "0xaddress",
      "isActiveReceiver": true,
      "totalStreams": 2,
      "summary": {
        "totalLocked": "50000",
        "totalClaimed": "10000",
        "totalClaimable": "5000",
        "totalLockedFormatted": "50000.0",
        "totalClaimedFormatted": "10000.0",
        "totalClaimableFormatted": "5000.0"
      },
      "vestingStreams": [
        {
          "streamId": "123",
          "totalAmount": "100000",
          "claimed": "20000",
          "locked": "80000",
          "claimable": "10000",
          "startDate": "2024-01-01T00:00:00.000Z",
          "endDate": "2025-01-01T00:00:00.000Z"
        }
      ]
    }
  }
}
```

## License

MIT
