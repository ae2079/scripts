# Bonding Curve Simulator

Analyze Bancor-style bonding curves with proper support for different collateral tokens (POL/WPOL, USDC, etc).

## Quick Answer

**For contract `0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56`:**

**Prices at 7.5M supply:**
- **Buy Price:** 0.6505 WPOL/token ($0.126 USD)
- **Static Price:** 0.6023 WPOL/token ($0.116 USD)
- **Sell Price:** 0.5541 WPOL/token ($0.107 USD)
- **Spread:** 17.39%

**To reach 7.5M supply from current 6.55M:**
- **Cost:** 401,326 WPOL ($77,517 USD)
- **Average price:** 0.4217 WPOL/token (+70%)
- **Current buy price:** 0.2477 WPOL/token
- **Buy price at target:** 0.6505 WPOL/token (+163%)

The buy price at target is 54% higher than the average due to the exponential curve (12.5% reserve ratio).

*Calculated using actual contract's calculatePurchaseReturn() function*

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up your RPC endpoint (RECOMMENDED)
cp .env.example .env
# Edit .env and add your RPC URL (see Setup section below)

# 3. Run analysis
npm run all      # Analyze all 12 projects
npm run project AKARUN 7500000  # Single project
npm run price    # Check POL price
```

## Setup (Recommended for Production)

### Get a Free RPC Endpoint

Using a paid/dedicated RPC endpoint prevents rate limiting:

1. **Alchemy** (Recommended): https://www.alchemy.com/
   - 300M compute units/month free
   - Best reliability

2. **Infura**: https://infura.io/
   - 100k requests/day free
   - Good for development

3. **QuickNode**: https://www.quicknode.com/
   - Credits-based free tier
   - High performance

### Configure Environment Variables

```bash
# Copy example file
cp .env.example .env

# Edit .env and add your RPC URL
nano .env  # or use your preferred editor
```

**Example `.env` file:**
```env
# Alchemy
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Or Infura
POLYGON_RPC_URL=https://polygon-mainnet.infura.io/v3/YOUR_API_KEY
```

### Without RPC Setup

The script will use free public RPC, but may hit rate limits:
```bash
npm install
npm run all  # May need retries, but will complete eventually
```

## Tools

### 1. analyzeAll.js (Batch Analysis)
Analyze all 12 projects at once and generate comprehensive reports.

```bash
node analyzeAll.js
# or
npm run all
```

**Features:**
- ✓ **Automatic Retry**: Retries up to 3 times with exponential backoff (5s, 10s, 20s)
- ✓ **Circuit Breaker**: Opens after 3 consecutive failures, waits 2 minutes before retrying
- ✓ **Rate Limit Handling**: Detects and handles RPC rate limits automatically
- ✓ **10s Delay**: Between projects to avoid hitting rate limits

**Output:**
- 12 JSON reports (machine-readable, per project)
- 12 Markdown reports (human-readable, per project)
- 1 summary.json (complete portfolio data with totals)
- 1 summary.md (comprehensive portfolio analysis)
- Console summary tables (costs and prices)

**Output Files:**
- Uses project names for filenames: `AKARUN_2025-10-20T01-13-42.json/md`
- Includes project name in report header
- Organized by timestamp for historical tracking

**Summary Report Includes:**
- Total WPOL/USD cost to reach 7.5M across all projects
- Per-project cost breakdown (tokens to buy, WPOL needed)
- Prices at target supply (buy/static/sell) for each project
- Current vs target price comparisons
- Complete project details in one place

**Perfect for:**
- Portfolio budgeting and planning
- Cross-project comparison
- Investment analysis
- Historical snapshots

### 2. checkProject.js (Single Project)
Check any project from your tokensInfo.json by name.

```bash
node checkProject.js <project_name> [target_supply]

# Examples
node checkProject.js AKARUN 7500000
node checkProject.js ANCIENT_BEAST
node checkProject.js list  # Show all 12 projects
```

**Features:**
- ✓ Check by project name (no need to remember addresses)
- ✓ Analyzes all 12 Season 2 projects
- ✓ Shows project info + full curve analysis
- ✓ Reports named with project name: `AKARUN_timestamp.json/md`

### 3. check.js (By Contract Address)
**Accurate** bonding curve analysis using actual smart contract calculations.

```bash
node check.js <address> [target_supply] [pol_price]

# Examples
node check.js 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56
node check.js 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56 7500000
node check.js 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56 7500000 0.20
```

**Features:**
- ✓ Uses contract's `calculatePurchaseReturn()` for accuracy
- ✓ Binary search to find exact collateral needed
- ✓ Auto-fetches POL price from CoinGecko API
- ✓ Auto-detects collateral token & decimals
- ✓ Calculates exact spot price at target supply
- ✓ **Generates JSON and Markdown reports with `--report` flag**
- ✓ **Report files use short contract address when project name not provided**
- ✓ **No approximations - all values from actual contract**

### 4. getPrice.js
Get current POL price from CoinGecko.

```bash
node getPrice.js
```

### 5. getToken.js
Detect collateral token and its details.

```bash
node getToken.js <address>
```

### 6. compare.js
Compare multiple curves side-by-side.

```bash
node compare.js <address1> <address2> [address3...]
node compare.js --config --export
```

### 7. export.js
Export data to JSON, CSV, or Markdown.

```bash
node export.js <address> --format csv
node export.js <address> --format json --output mydata.json
```

## NPM Scripts

```bash
npm start <address> [target]     # Same as check.js
npm run check <address> [target] # Check bonding curve
npm run price                    # Get POL price
npm run token <address>          # Get token info
npm run compare -- --config      # Compare curves
npm run export -- <address>      # Export data
```

## Configuration

Edit `config.js` to:
- Add your contracts for easy access
- Set custom RPC endpoints
- Define target supply points
- Update fallback POL price

```javascript
contracts: {
    "my_project": {
        address: "0x...",
        network: "polygon",
        name: "My Project",
    },
}
```

## Token Support

### Auto-Detection
The tools automatically detect:
- Collateral token (POL/WPOL, USDC, etc)
- Token decimals (18 for POL, 6 for USDC)
- Current prices from CoinGecko

### Supported Networks
- Polygon (default)
- Ethereum
- Any EVM-compatible chain

## Example Output

```
🔍 Bonding Curve Analysis (Accurate)
══════════════════════════════════════════════════════════════════════
📍 Contract: 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56

💰 Fetching current POL price...
✓ Fetched POL price: $0.19337
💎 Collateral Token: WPOL (18 decimals)

📊 Current State:
   Supply:        6,548,361.34 tokens
   Collateral:    182,747.07 WPOL
   Buy Fee:       8%
   Sell Fee:      8%
   Reserve Ratio: 12.50%

💰 Current Prices (from contract calculatePurchaseReturn/SaleReturn):
   Buy:  0.24766812 WPOL/token = $0.047892 USD
   Sell: 0.20125477 WPOL/token = $0.038917 USD
   Spread: 23.06%

📈 Market Cap: $313,611.40 USD

🎯 ACCURATE Analysis for 7,500,000 Tokens
──────────────────────────────────────────────────────────────────────
   Tokens to buy: 951,638.66
   Increase:      14.53%

   ⏳ Calculating exact cost using contract functions...

   ✅ Exact Cost (calculated via contract):
      Collateral: 401,325.52 WPOL
      USD:        $77,604.32
      Avg Price:  0.42172064 WPOL/token
      Avg Price:  $0.081548 USD/token
      Tokens:     951,638.33
      Converged:  Yes

   📊 Price Impact:
      Current:    $0.047892 USD/token
      Average:    $0.081548 USD/token
      Change:     +70.28%

   💎 Market Cap at Target:
      3,162,904.77 WPOL
      $611,610.90 USD
```

## Report Generation

Both `check.js` and `checkProject.js` support automatic report generation:

```bash
# Generate reports (JSON + Markdown)
node check.js 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56 7500000 --report
node checkProject.js AKARUN 7500000 --save

# Reports are saved to reports/ directory
# - JSON file: Complete analysis data (machine-readable)
# - Markdown file: Formatted report (human-readable)
```

**File Naming:**
- With project name: `AKARUN_2025-10-20T01-13-42.json/md`
- Without project: `0x9776b3A8_2025-10-20T01-13-42.json/md`
- Includes timestamp for historical tracking

**Report Contents:**
- Current state (supply, collateral, fees, reserve ratio)
- Current prices (buy/sell/spread)
- Target analysis (cost, average price, spot price)
- Market cap projections
- Timestamp and contract details

## Files

```
BondingCurveSimulator/
├── analyzeAll.js    # Batch analyze all projects ⭐
├── checkProject.js  # Check by project name
├── check.js         # Check by contract address
├── getPrice.js      # Fetch POL price from CoinGecko
├── getToken.js      # Detect collateral token
├── compare.js       # Compare multiple curves
├── export.js        # Export data to CSV/JSON/MD
├── config.js        # Configuration
├── package.json     # NPM configuration
├── tokensInfo.json  # Project contracts (12 projects)
├── reports/         # Auto-generated reports (gitignored)
│   ├── summary.json # Portfolio summary with totals
│   ├── summary.md   # Human-readable portfolio analysis
│   └── *.json/md    # Individual project reports
└── README.md        # This file
```

## Portfolio Summary Report

The `summary.md` report generated by `npm run all` includes:

### 1. Total Cost to Reach Target
- Total WPOL needed across all 12 projects
- Total USD cost

### 2. Cost Breakdown by Project
- Tokens to buy for each project
- WPOL cost per project
- USD cost per project

### 3. Prices at Target Supply (7.5M)
- Buy price (with 8% fee)
- Static price (base price)
- Sell price (with 8% fee)
- Average buy price during accumulation

### 4. Current vs Target Prices
- Price comparison for each project
- Percentage change

### 5. Individual Project Details
- Complete breakdown for all 12 projects
- Contract addresses
- All key metrics in one place

**Example Summary:**
```
Total Cost to Reach 7.5M Supply:
  WPOL: 4,800,000 WPOL
  USD:  $930,000 USD

Cost Breakdown:
  AKARUN:        401,326 WPOL  ($77,648)
  ANCIENT_BEAST: 403,965 WPOL  ($78,167)
  ...
```

## License

MIT
