# QuickSwap Arbitrage Analyzer

Analyze QuickSwap LPs and calculate arbitrage opportunities with bonding curves.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up your RPC endpoint (RECOMMENDED)
cp .env.example .env
# Edit .env and add your RPC URL

# 3. Run analysis
npm run analyze        # Analyze all projects
npm run arbitrage AKARUN 500  # Single project with budget
npm run lp AKARUN      # Get LP data only
```

## What It Does

This tool focuses specifically on **QuickSwap → Bonding Curve arbitrage**:

1. **Finds QuickSwap LPs** for all bonding curve projects
2. **Compares prices** between QuickSwap and bonding curves
3. **Calculates exact tokens needed** to buy from QuickSwap LP to reach bonding curve price
4. **Skips projects** where QuickSwap price >= Bonding Curve price (no arbitrage)
5. **Provides optimal strategy** with budget constraints

## Tools

### 1. calculateArbitrage.js (Main Tool)
Calculate tokens needed for QuickSwap → Bonding Curve arbitrage.

```bash
# Analyze all projects
node calculateArbitrage.js

# Analyze specific project
node calculateArbitrage.js AKARUN

# With budget limit
node calculateArbitrage.js AKARUN 500
```

**Output:**
- Shows only projects with arbitrage opportunities
- Calculates exact WMATIC needed and tokens received
- Displays profit percentage and slippage
- Provides optimal strategy with budget constraints

### 2. getLPData.js (LP Data Fetcher)
Get QuickSwap LP information for projects.

```bash
# Get LP data for all projects
node getLPData.js

# Get LP data for specific project
node getLPData.js AKARUN

# Calculate tokens needed for specific price
node getLPData.js AKARUN 0.5
```

### 3. analyze.js (Comprehensive Analysis)
Full analysis with report generation.

```bash
# Analyze all projects with reports
node analyze.js

# Quick price comparison
node analyze.js --compare
```

## Example Output

```
🔄 Calculating tokens needed for AKARUN...

📊 Price Comparison:
   Bonding Curve Buy Price: 0.65050000 WMATIC/token
   QuickSwap Price:         0.42000000 WMATIC/token
   Price Difference:        54.88%

💰 Arbitrage Opportunity:
   Strategy: Buy on QuickSwap, Sell on Bonding Curve
   Profit per token: 0.23050000 WMATIC
   Profit percentage: 54.88%

🎯 To reach bonding curve price on QuickSwap:
   WMATIC needed: 1250.500000 WMATIC
   Tokens received: 2500.00 tokens
   New QuickSwap price: 0.65050000 WMATIC/token
   Slippage: 2.15%
```

## Configuration

The tool analyzes these 12 projects:
- AKARUN
- ANCIENT_BEAST
- CITIZEN_WALLET
- GRIDLOCK_SOCIAL_RECOVERY_WALLET
- HOW_TO_DAO
- MELODEX
- PRISMO_TECHNOLOGY
- THE_GRAND_TIMELINE
- TO_DA_MOON
- WEB3_PACKS
- X23AI
- XADE_FINANCE

## Setup

### Get RPC Endpoint (Recommended)

1. **Alchemy**: https://www.alchemy.com/ (300M compute units/month free)
2. **Infura**: https://infura.io/ (100k requests/day free)
3. **QuickNode**: https://www.quicknode.com/ (Credits-based free tier)

### Configure Environment

```bash
cp .env.example .env
# Edit .env and add your RPC URL
```

**Example `.env`:**
```env
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

## Key Features

✅ **Focused Analysis**: Only QuickSwap → Bonding Curve arbitrage
✅ **Exact Calculations**: Precise tokens needed to reach target price
✅ **Budget Constraints**: Respects maximum WMATIC limits
✅ **Slippage Awareness**: Shows impact on LP price
✅ **Liquidity Checks**: Considers LP depth
✅ **Rate Limit Handling**: Built-in delays and retries

## Arbitrage Strategy

**When QuickSwap Price < Bonding Curve Price:**

1. Buy tokens on QuickSwap LP
2. Price moves up due to constant product formula
3. Sell tokens on bonding curve at higher price
4. Profit = (Bonding Curve Price - QuickSwap Price) × Tokens

**The tool calculates:**
- Exact WMATIC needed to reach bonding curve price
- Number of tokens received
- Expected slippage
- Profit potential

## Output Files

Reports are saved to `reports/` directory:
- `arbitrage_YYYY-MM-DDTHH-MM-SS.json` - Machine-readable data
- `arbitrage_YYYY-MM-DDTHH-MM-SS.md` - Human-readable report

## Requirements

- Node.js 16+
- Polygon RPC endpoint (recommended)
- Internet connection for blockchain queries

## Troubleshooting

**No arbitrage opportunities found:**
- QuickSwap prices may be >= Bonding Curve prices
- Check if LPs exist for the projects
- Verify RPC connection

**Rate limit errors:**
- Use a paid RPC endpoint
- The tool has built-in delays
- Wait and retry

**Missing LP data:**
- Some projects may not have QuickSwap LPs
- Check if tokens are listed on QuickSwap
- Verify token addresses in config.js
