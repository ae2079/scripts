# Bonding Curve Simulator

Analyze Bancor-style bonding curves with proper support for different collateral tokens (POL/WPOL, USDC, etc).

## Quick Answer

**For contract `0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56`:**

**Exact spot price at 7.5M supply: 0.6505 WPOL/token ($0.125 USD)**

To reach 7.5M supply from current 6.55M:
- **Cost:** 401,326 WPOL ($77,266 USD)
- **Average price:** 0.4217 WPOL/token ($0.081 USD)
- **Current price:** 0.2477 WPOL/token ($0.048 USD)
- **Price impact:** +163% (spot at target vs. current)

The spot price at target is 54% higher than the average due to the exponential curve (12.5% reserve ratio).

*Calculated using actual contract's calculatePurchaseReturn() function*

## Quick Start

```bash
# Install
npm install

# Check by project name (easiest!)
node checkProject.js AKARUN 7500000
node checkProject.js list  # Show all 12 projects

# Or check by contract address
node check.js 0x9776b3A8E233e1Bc1ad24985BaEcFDDd57D47c56 7500000

# npm shortcuts
npm run project AKARUN 7500000
npm run price
```

## Tools

### 1. checkProject.js (Easiest!)
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

### 2. check.js (Main Tool)
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
- ✓ **No approximations - all values from actual contract**

### 3. getPrice.js
Get current POL price from CoinGecko.

```bash
node getPrice.js
```

### 4. getToken.js
Detect collateral token and its details.

```bash
node getToken.js <address>
```

### 5. compare.js
Compare multiple curves side-by-side.

```bash
node compare.js <address1> <address2> [address3...]
node compare.js --config --export
```

### 6. export.js
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

**Report Contents:**
- Current state (supply, collateral, fees, reserve ratio)
- Current prices (buy/sell/spread)
- Target analysis (cost, average price, spot price)
- Market cap projections
- Timestamp and contract details

## Files

```
BondingCurveSimulator/
├── checkProject.js  # Check by project name (easiest!)
├── check.js         # Main tool - check bonding curves
├── getPrice.js      # Fetch POL price from CoinGecko
├── getToken.js      # Detect collateral token
├── compare.js       # Compare multiple curves
├── export.js        # Export data to CSV/JSON/MD
├── config.js        # Configuration
├── package.json     # NPM configuration
├── reports/         # Auto-generated reports (gitignored)
└── README.md        # This file
```

## License

MIT
