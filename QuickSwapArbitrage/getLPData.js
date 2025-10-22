const { ethers } = require('ethers');
const axios = require('axios');
const config = require('./config');

// Uniswap V3 SDK imports
const { Pool, Position, nearestUsableTick, TickMath, TICK_SPACINGS } = require('@uniswap/v3-sdk');
const { Token, CurrencyAmount, TradeType, Percent } = require('@uniswap/sdk-core');

// QuickSwap ABI fragments
const PAIR_ABI = [
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function totalSupply() external view returns (uint256)"
];

const FACTORY_V2_ABI = [
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

const ALGEBRA_FACTORY_ABI = [
    "function poolByPair(address tokenA, address tokenB) external view returns (address pool)"
];

const ALGEBRA_POOL_ABI = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function liquidity() external view returns (uint128)",
    "function globalState() external view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)"
];

const ERC20_ABI = [
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function name() external view returns (string)",
    "function balanceOf(address account) external view returns (uint256)"
];

class QuickSwapLPAnalyzer {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(config.rpc.polygon);
        this.factoryV2 = new ethers.Contract(config.quickswap.factoryV2, FACTORY_V2_ABI, this.provider);
        this.algebraFactory = new ethers.Contract(config.quickswap.factoryV3, ALGEBRA_FACTORY_ABI, this.provider);
    }

    /**
     * Get LP pair address for a token/WMATIC pair (V2)
     */
    async getPairAddressV2(tokenAddress) {
        try {
            const pairAddress = await this.factoryV2.getPair(tokenAddress, config.quickswap.wmatic);
            return pairAddress !== ethers.ZeroAddress ? pairAddress : null;
        } catch (error) {
            console.error(`Error getting V2 pair address for ${tokenAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Get LP pool address for a token/WMATIC pair (Algebra Protocol)
     */
    async getPoolAddressV3(tokenAddress) {
        try {
            console.log(`🔍 Checking Algebra Protocol for ${tokenAddress}...`);

            // Use Algebra Protocol's poolByPair method
            const poolAddress = await this.algebraFactory.poolByPair(tokenAddress, config.quickswap.wmatic);

            if (poolAddress !== ethers.ZeroAddress) {
                console.log(`✅ Found Algebra pool: ${poolAddress}`);

                // Verify the pool has liquidity
                try {
                    const pool = new ethers.Contract(poolAddress, ALGEBRA_POOL_ABI, this.provider);
                    const liquidity = await pool.liquidity();
                    if (liquidity > 0) {
                        return { address: poolAddress, fee: 0 }; // Algebra pools don't have fixed fee tiers
                    }
                } catch (error) {
                    console.log(`⚠️  Pool found but couldn't verify liquidity: ${error.message}`);
                    // Return the pool anyway, as it might still be valid
                    return { address: poolAddress, fee: 0 };
                }
            }

            return null;
        } catch (error) {
            console.error(`Error getting Algebra pool address for ${tokenAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Fetch pool data from QuickSwap Analytics API
     */
    async fetchPoolFromAPI(tokenAddress) {
        try {
            console.log(`🔍 Fetching pool data from QuickSwap API for ${tokenAddress}...`);

            // Try to find the pool by checking known pool addresses
            // For now, we'll use the known AKARUN pool address
            const knownPools = {
                '0xA3dd6163B5742B0D8Cb7d79CB5DFE3F81F8F8fC4': '0xd404b5ec643a129e2853d78ba98368cee097ae92' // AKARUN pool
            };

            const poolAddress = knownPools[tokenAddress];
            if (!poolAddress) {
                console.log(`❌ No known pool address for ${tokenAddress}`);
                return null;
            }

            const apiUrl = `${config.quickswap.analyticsAPI}/${poolAddress}/v3?chainId=137`;
            const response = await axios.get(apiUrl);

            if (response.data && response.data.data && response.data.data.pairData) {
                const poolData = response.data.data.pairData;

                console.log(`✅ Found pool data from API: ${poolAddress}`);

                return {
                    pairAddress: poolAddress,
                    address: poolAddress,
                    type: 'V3',
                    fee: parseInt(poolData.fee),
                    projectToken: tokenAddress,
                    tokenSymbol: poolData.token1.symbol,
                    tokenName: poolData.token1.name,
                    tokenDecimals: parseInt(poolData.token1.decimals),
                    tokenPrice: parseFloat(poolData.token1Price), // WPOL per token
                    totalLiquidityWMATIC: parseFloat(poolData.totalValueLockedUSD) / 0.195, // Convert USD to WPOL (rough estimate)
                    liquidity: parseFloat(poolData.reserve0), // WPOL reserve
                    reserves: {
                        token0: poolData.token0.id,
                        token1: poolData.token1.id,
                        reserve0: parseFloat(poolData.reserve0),
                        reserve1: parseFloat(poolData.reserve1)
                    },
                    source: 'API'
                };
            }

            return null;
        } catch (error) {
            console.error(`Error fetching pool data from API:`, error.message);
            return null;
        }
    }

    /**
     * Get LP address (tries V3 first, then V2, then API)
     */
    async getPairAddress(tokenAddress) {
        // Try V3 first
        const v3Pool = await this.getPoolAddressV3(tokenAddress);
        if (v3Pool) {
            return { address: v3Pool.address, type: 'V3', fee: v3Pool.fee };
        }

        // Try V2
        const v2Pair = await this.getPairAddressV2(tokenAddress);
        if (v2Pair) {
            return { address: v2Pair, type: 'V2' };
        }

        // Try API as fallback
        const apiData = await this.fetchPoolFromAPI(tokenAddress);
        if (apiData) {
            return { address: apiData.address, type: 'V3', fee: apiData.fee, apiData };
        }

        return null;
    }

    /**
     * Get LP reserves and token information
     */
    async getLPData(pairInfo) {
        try {
            const { address: pairAddress, type, fee, apiData } = pairInfo;

            // If we have API data, use it directly
            if (apiData) {
                return apiData;
            }

            if (type === 'V3') {
                return await this.getV3PoolData(pairAddress, fee);
            } else {
                return await this.getV2PairData(pairAddress);
            }
        } catch (error) {
            console.error(`Error getting LP data for ${pairInfo.address}:`, error.message);
            return null;
        }
    }

    /**
     * Get V2 pair data
     */
    async getV2PairData(pairAddress) {
        try {
            const pair = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);

            // Get reserves
            const reserves = await pair.getReserves();
            const [reserve0, reserve1] = reserves;

            // Get token addresses
            const token0 = await pair.token0();
            const token1 = await pair.token1();

            // Determine which is WMATIC and which is the project token
            const isToken0WMATIC = token0.toLowerCase() === config.quickswap.wmatic.toLowerCase();
            const projectToken = isToken0WMATIC ? token1 : token0;
            const wmaticReserve = isToken0WMATIC ? reserve0 : reserve1;
            const tokenReserve = isToken0WMATIC ? reserve1 : reserve0;

            // Get token info
            const tokenContract = new ethers.Contract(projectToken, ERC20_ABI, this.provider);
            const [decimals, symbol, name] = await Promise.all([
                tokenContract.decimals(),
                tokenContract.symbol(),
                tokenContract.name()
            ]);

            // Calculate price (WMATIC per token)
            const tokenPrice = Number(ethers.formatUnits(wmaticReserve, 18)) /
                Number(ethers.formatUnits(tokenReserve, decimals));

            // Calculate total liquidity in WMATIC
            const totalLiquidityWMATIC = Number(ethers.formatUnits(wmaticReserve, 18)) * 2;

            return {
                pairAddress,
                type: 'V2',
                projectToken,
                tokenSymbol: symbol,
                tokenName: name,
                tokenDecimals: decimals,
                wmaticReserve: Number(ethers.formatUnits(wmaticReserve, 18)),
                tokenReserve: Number(ethers.formatUnits(tokenReserve, decimals)),
                tokenPrice, // WMATIC per token
                totalLiquidityWMATIC,
                reserves: {
                    reserve0: Number(ethers.formatUnits(reserve0, 18)),
                    reserve1: Number(ethers.formatUnits(reserve1, decimals)),
                    token0,
                    token1,
                }
            };
        } catch (error) {
            console.error(`Error getting V2 pair data for ${pairAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Get Algebra Protocol pool data (using API for accurate pricing)
     */
    async getV3PoolData(poolAddress, fee) {
        try {
            const pool = new ethers.Contract(poolAddress, ALGEBRA_POOL_ABI, this.provider);

            // Get basic pool info
            const [token0, token1, liquidity] = await Promise.all([
                pool.token0(),
                pool.token1(),
                pool.liquidity()
            ]);

            // Determine which is WMATIC and which is the project token
            const isToken0WMATIC = token0.toLowerCase() === config.quickswap.wmatic.toLowerCase();
            const projectToken = isToken0WMATIC ? token1 : token0;

            // Get token info
            const tokenContract = new ethers.Contract(projectToken, ERC20_ABI, this.provider);
            const [decimals, symbol, name] = await Promise.all([
                tokenContract.decimals(),
                tokenContract.symbol(),
                tokenContract.name()
            ]);

            // Use API data for accurate pricing and reserves
            const apiData = await this.fetchPoolFromAPI(projectToken);

            if (apiData) {
                // Use API data which is more accurate and reliable
                return {
                    pairAddress: poolAddress,
                    type: 'V3',
                    fee,
                    projectToken,
                    tokenSymbol: symbol,
                    tokenName: name,
                    tokenDecimals: decimals,
                    tokenPrice: 1 / apiData.tokenPrice, // Convert from AKA/WPOL to WPOL/token
                    totalLiquidityWMATIC: apiData.totalLiquidityWMATIC, // From API
                    liquidity: Number(ethers.formatUnits(liquidity, 18)),
                    wmaticReserve: apiData.reserves.reserve0,
                    tokenReserve: apiData.reserves.reserve1,
                    reserves: {
                        token0,
                        token1,
                        reserve0: apiData.reserves.reserve0,
                        reserve1: apiData.reserves.reserve1,
                    },
                    source: 'API + Blockchain',
                    note: 'Price calculated from QuickSwap API for accuracy'
                };
            } else {
                // API failed - try to get actual token balances from blockchain
                const liquidityAmount = Number(ethers.formatUnits(liquidity, 18));

                try {
                    // Try to get price using Algebra quoter
                    const QUOTER_ABI = [
                        "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)"
                    ];

                    // Algebra quoter address (from the user's code snippet)
                    const quoterAddress = "0xa15F0D7377B2A0C0c10db057f641beD21028FC89";
                    const quoter = new ethers.Contract(quoterAddress, QUOTER_ABI, this.provider);

                    // Try to get quote for 1 WPOL -> project token
                    const oneWPOL = ethers.parseUnits("1", 18);
                    let calculatedPrice;

                    try {
                        if (token0.toLowerCase() === config.quickswap.wmatic.toLowerCase()) {
                            // Token0 is WMATIC, token1 is project token
                            const amountOut = await quoter.quoteExactInputSingle(token0, token1, oneWPOL, 0);
                            const tokensReceived = Number(ethers.formatUnits(amountOut, decimals));
                            calculatedPrice = 1 / tokensReceived; // WPOL per token
                            console.log(`   Quoter quote: 1 WPOL = ${tokensReceived.toFixed(6)} tokens`);
                            console.log(`   Calculated price: ${calculatedPrice.toFixed(8)} WPOL/token`);
                        } else {
                            // Token1 is WMATIC, token0 is project token
                            const amountOut = await quoter.quoteExactInputSingle(token1, token0, oneWPOL, 0);
                            const tokensReceived = Number(ethers.formatUnits(amountOut, decimals));
                            calculatedPrice = 1 / tokensReceived; // WPOL per token
                            console.log(`   Quoter quote: 1 WPOL = ${tokensReceived.toFixed(6)} tokens`);
                            console.log(`   Calculated price: ${calculatedPrice.toFixed(8)} WPOL/token`);
                        }
                    } catch (quoterError) {
                        console.log(`   Quoter quote failed: ${quoterError.message}`);
                        throw quoterError;
                    }

                    // Get token balances for reserves (for display purposes)
                    const token0Contract = new ethers.Contract(token0, ERC20_ABI, this.provider);
                    const token1Contract = new ethers.Contract(token1, ERC20_ABI, this.provider);

                    const [token0Balance, token1Balance] = await Promise.all([
                        token0Contract.balanceOf(poolAddress),
                        token1Contract.balanceOf(poolAddress)
                    ]);

                    const token0Amount = Number(ethers.formatUnits(token0Balance, 18));
                    const token1Amount = Number(ethers.formatUnits(token1Balance, decimals));

                    let wmaticReserve, tokenReserve;
                    if (token0.toLowerCase() === config.quickswap.wmatic.toLowerCase()) {
                        wmaticReserve = token0Amount;
                        tokenReserve = token1Amount;
                    } else {
                        wmaticReserve = token1Amount;
                        tokenReserve = token0Amount;
                    }

                    return {
                        pairAddress: poolAddress,
                        type: 'V3',
                        fee,
                        projectToken,
                        tokenSymbol: symbol,
                        tokenName: name,
                        tokenDecimals: decimals,
                        tokenPrice: calculatedPrice,
                        totalLiquidityWMATIC: liquidityAmount,
                        liquidity: liquidityAmount,
                        wmaticReserve: wmaticReserve,
                        tokenReserve: tokenReserve,
                        reserves: {
                            token0,
                            token1,
                            reserve0: token0.toLowerCase() === config.quickswap.wmatic.toLowerCase() ? wmaticReserve : tokenReserve,
                            reserve1: token0.toLowerCase() === config.quickswap.wmatic.toLowerCase() ? tokenReserve : wmaticReserve,
                        },
                        source: 'Blockchain (pool balances)',
                        note: 'Price calculated from pool token balances'
                    };
                } catch (error) {
                    console.log(`❌ Could not get pool balances for ${projectToken}: ${error.message}`);
                    console.log(`❌ Cannot determine accurate price - API unavailable and blockchain data inaccessible`);
                    return null; // Return null instead of fallback data
                }
            }
        } catch (error) {
            console.error(`Error getting Algebra pool data for ${poolAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Calculate V3 tokens to buy using Uniswap V3 SDK
     */
    /**
     * Calculate V3 tokens to buy using price impact analysis
     */
    async calculateV3TokensToBuyForPrice(lpData, targetPrice) {
        console.log('   Using price impact analysis for accurate calculation...');

        const currentPrice = lpData.tokenPrice;
        const priceIncreaseNeeded = (targetPrice - currentPrice) / currentPrice;

        console.log(`   📊 Current price: ${currentPrice.toFixed(6)} WPOL/token`);
        console.log(`   📊 Target price: ${targetPrice.toFixed(6)} WPOL/token`);
        console.log(`   📊 Price increase needed: ${(priceIncreaseNeeded * 100).toFixed(2)}%`);

        // Test different amounts to find the right price impact
        const testAmounts = [
            lpData.totalLiquidityWMATIC * 0.001, // 0.1% of liquidity
            lpData.totalLiquidityWMATIC * 0.005, // 0.5% of liquidity
            lpData.totalLiquidityWMATIC * 0.01, // 1% of liquidity
            lpData.totalLiquidityWMATIC * 0.02, // 2% of liquidity
            lpData.totalLiquidityWMATIC * 0.05, // 5% of liquidity
            lpData.totalLiquidityWMATIC * 0.1, // 10% of liquidity
            lpData.totalLiquidityWMATIC * 0.2, // 20% of liquidity
            lpData.totalLiquidityWMATIC * 0.3, // 30% of liquidity
            lpData.totalLiquidityWMATIC * 0.5, // 50% of liquidity
        ];

        let bestResult = null;
        let maxLiquidityResult = null;

        for (let i = 0; i < testAmounts.length; i++) {
            const testAmount = testAmounts[i];

            try {
                const quoteResult = await this.quoteSwapWithPriceImpact(lpData, testAmount);

                if (!quoteResult) {
                    console.log(`   Test ${i + 1}: ${testAmount.toFixed(2)} WMATIC -> Quote failed (insufficient liquidity)`);
                    // Store the maximum liquidity we can use
                    if (!maxLiquidityResult) {
                        maxLiquidityResult = await this.calculateMaxLiquidityUsage(lpData, testAmounts[i - 1] || testAmount * 0.5);
                    }
                    break;
                }

                const newPrice = quoteResult.executionPrice;
                const priceImpact = quoteResult.priceImpact / 10000; // Convert PPM to percentage
                const priceIncrease = (newPrice - currentPrice) / currentPrice;

                console.log(`   Test ${i + 1}: ${testAmount.toFixed(2)} WMATIC -> ${newPrice.toFixed(6)} WPOL/token (${(priceIncrease * 100).toFixed(2)}% increase, ${priceImpact.toFixed(2)}% impact)`);

                // Check if this amount gets us close to the target price
                const priceDiff = Math.abs(newPrice - targetPrice) / targetPrice;

                if (priceDiff < 0.02) { // Within 2% of target (tightened from 5%)
                    const tokensReceived = testAmount / newPrice;
                    bestResult = {
                        wmaticNeeded: testAmount,
                        tokensReceived: tokensReceived,
                        newPrice: newPrice,
                        slippage: priceImpact,
                        priceImpact: quoteResult.priceImpact,
                        spotPrice: quoteResult.minPrice,
                        note: `Price impact analysis (${(priceIncrease * 100).toFixed(1)}% price increase)`
                    };
                    console.log(`   ✅ Found solution: ${testAmount.toFixed(2)} WMATIC needed`);
                    break;
                } else if (newPrice > targetPrice) {
                    // We've overshot, use binary search between previous and current amount
                    if (i > 0) {
                        const low = testAmounts[i - 1];
                        const high = testAmount;
                        bestResult = await this.binarySearchForExactPrice(lpData, targetPrice, low, high, currentPrice);
                        if (bestResult) break;
                    }
                }

                // Store the maximum liquidity result for fallback
                if (!maxLiquidityResult || testAmount > maxLiquidityResult.wmaticNeeded) {
                    maxLiquidityResult = {
                        wmaticNeeded: testAmount,
                        tokensReceived: testAmount / newPrice,
                        newPrice: newPrice,
                        slippage: priceImpact,
                        priceImpact: quoteResult.priceImpact,
                        spotPrice: quoteResult.minPrice,
                        note: 'Maximum LP utilization',
                        liquidityExhausted: true,
                        minAmountToExhaust: testAmount * 1.1
                    };
                }

            } catch (error) {
                console.log(`   Test ${i + 1}: ${testAmount.toFixed(2)} WMATIC -> Error: ${error.message}`);
                if (!maxLiquidityResult) {
                    maxLiquidityResult = await this.calculateMaxLiquidityUsage(lpData, testAmounts[i - 1] || testAmount * 0.5);
                }
                break;
            }
        }

        if (!bestResult) {
            console.log(`   ⚠️  Target price requires more liquidity than available`);
            if (maxLiquidityResult) {
                console.log(`   📊 Maximum LP utilization: ${maxLiquidityResult.wmaticNeeded.toFixed(2)} WMATIC`);
                return maxLiquidityResult;
            }

            // Fallback to maximum liquidity calculation
            const maxLiquidityFallback = await this.calculateMaxLiquidityUsage(lpData, lpData.totalLiquidityWMATIC * 0.1);
            if (maxLiquidityFallback) {
                console.log(`   📊 Maximum LP utilization: ${maxLiquidityFallback.wmaticNeeded.toFixed(2)} WMATIC`);
                return maxLiquidityFallback;
            }

            throw new Error('Could not find accurate amount through price impact analysis');
        }

        return bestResult;
    }

    /**
     * Binary search for exact price between two amounts
     */
    async binarySearchForExactPrice(lpData, targetPrice, low, high, currentPrice) {
        console.log(`   🔍 Binary search between ${low.toFixed(2)} and ${high.toFixed(2)} WMATIC`);

        for (let i = 0; i < 25; i++) { // Increased from 15 to 25 iterations
            const mid = (low + high) / 2;

            try {
                const quoteResult = await this.quoteSwapWithPriceImpact(lpData, mid);

                if (!quoteResult) {
                    high = mid;
                    continue;
                }

                const newPrice = quoteResult.executionPrice;
                const priceDiff = Math.abs(newPrice - targetPrice) / targetPrice;
                const priceImpact = quoteResult.priceImpact / 10000;
                const priceIncrease = (newPrice - currentPrice) / currentPrice;

                console.log(`   Binary ${i + 1}: ${mid.toFixed(2)} WMATIC -> ${newPrice.toFixed(6)} WPOL/token (${(priceIncrease * 100).toFixed(2)}% increase, ${priceImpact.toFixed(2)}% impact)`);

                if (priceDiff < 0.005) { // Tightened tolerance from 1% to 0.5%
                    const tokensReceived = mid / newPrice;
                    return {
                        wmaticNeeded: mid,
                        tokensReceived: tokensReceived,
                        newPrice: newPrice,
                        slippage: priceImpact,
                        priceImpact: quoteResult.priceImpact,
                        spotPrice: quoteResult.minPrice,
                        note: `Binary search (${(priceIncrease * 100).toFixed(1)}% price increase)`
                    };
                } else if (newPrice < targetPrice) {
                    low = mid;
                } else {
                    high = mid;
                }

                // Check if we're converging (difference between low and high is very small)
                if ((high - low) / low < 0.001) { // Stop if range is less than 0.1% of low value
                    console.log(`   📊 Binary search converged after ${i + 1} iterations`);
                    const tokensReceived = mid / newPrice;
                    return {
                        wmaticNeeded: mid,
                        tokensReceived: tokensReceived,
                        newPrice: newPrice,
                        slippage: priceImpact,
                        priceImpact: quoteResult.priceImpact,
                        spotPrice: quoteResult.minPrice,
                        note: `Binary search converged (${(priceIncrease * 100).toFixed(1)}% price increase)`
                    };
                }
            } catch (error) {
                high = mid;
            }
        }

        return null;
    }

    /**
     * Calculate the maximum liquidity that can be used from the LP
     */
    async calculateMaxLiquidityUsage(lpData, maxSafeAmount) {
        console.log('   🔍 Calculating maximum LP liquidity utilization...');

        // Try to find the maximum amount we can safely use
        let testAmount = maxSafeAmount;
        let lastSuccessfulQuote = null;
        let firstFailedAmount = null; // Track the first amount that fails

        // Binary search to find the maximum safe amount
        let low = 0;
        let high = Math.min(lpData.totalLiquidityWMATIC * 0.2, maxSafeAmount * 2); // More conservative: max 20% of liquidity

        for (let i = 0; i < 15; i++) {
            const mid = (low + high) / 2;

            try {
                const quoteResult = await this.quoteSwapWithPriceImpact(lpData, mid);
                if (quoteResult) {
                    lastSuccessfulQuote = {
                        amount: mid,
                        quote: quoteResult
                    };
                    low = mid;
                } else {
                    // This is the first failure we encounter
                    if (firstFailedAmount === null) {
                        firstFailedAmount = mid;
                    }
                    high = mid;
                }
            } catch (error) {
                // This is the first failure we encounter
                if (firstFailedAmount === null) {
                    firstFailedAmount = mid;
                }
                high = mid;
            }
        }

        if (lastSuccessfulQuote) {
            const tokensReceived = lastSuccessfulQuote.amount / lastSuccessfulQuote.quote.executionPrice;
            return {
                wmaticNeeded: lastSuccessfulQuote.amount,
                tokensReceived: tokensReceived,
                newPrice: lastSuccessfulQuote.quote.executionPrice,
                slippage: lastSuccessfulQuote.quote.priceImpact / 10000,
                priceImpact: lastSuccessfulQuote.quote.priceImpact,
                spotPrice: lastSuccessfulQuote.quote.minPrice,
                note: 'LP liquidity exhausted - maximum possible utilization',
                liquidityExhausted: true,
                minAmountToExhaust: firstFailedAmount || lastSuccessfulQuote.amount * 1.1 // Estimate if we couldn't find exact failure point
            };
        }

        // Fallback if we can't get any quotes
        return {
            wmaticNeeded: lpData.totalLiquidityWMATIC * 0.1, // Conservative estimate
            tokensReceived: 0,
            newPrice: lpData.tokenPrice,
            slippage: 0,
            priceImpact: 0,
            spotPrice: lpData.tokenPrice,
            note: 'LP liquidity exhausted - conservative estimate',
            liquidityExhausted: true,
            minAmountToExhaust: firstFailedAmount || lpData.totalLiquidityWMATIC * 0.2
        };
    }

    /**
     * Quote swap with price impact calculation (based on your improved code)
     */
    async quoteSwapWithPriceImpact(lpData, amountIn) {
        const QUOTER_ABI = [
            "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)"
        ];

        const quoterAddress = "0xa15F0D7377B2A0C0c10db057f641beD21028FC89";
        const quoter = new ethers.Contract(quoterAddress, QUOTER_ABI, this.provider);

        // Determine token order
        const isToken0WMATIC = lpData.reserves.token0.toLowerCase() === config.quickswap.wmatic.toLowerCase();
        const tokenIn = isToken0WMATIC ? lpData.reserves.token0 : lpData.reserves.token1;
        const tokenOut = isToken0WMATIC ? lpData.reserves.token1 : lpData.reserves.token0;


        try {
            // Try the original amount first
            const amountInWei = ethers.parseUnits(amountIn.toString(), 18);
            const amountOut = await quoter.quoteExactInputSingle(tokenIn, tokenOut, amountInWei, 0);

            if (!amountOut || amountOut === BigInt(0)) {
                console.log("Swap amount too large for current liquidity. Try a smaller amount.");
                return null;
            }

            const amountOutHuman = Number(ethers.formatUnits(amountOut, lpData.tokenDecimals));
            const amountInHuman = amountIn;

            // Calculate execution price based on token ordering
            const executionPrice = isToken0WMATIC ?
                amountInHuman / amountOutHuman // WPOL per token when swapping WMATIC -> project token
                :
                amountInHuman / amountOutHuman; // WPOL per token when swapping WMATIC -> project token (same calculation!)

            // Try with 1 token first for spot price
            const smallAmountIn = ethers.parseUnits("1", 18);
            const smallAmountOut = await quoter.quoteExactInputSingle(tokenIn, tokenOut, smallAmountIn, 0);

            let minPrice;
            if (!smallAmountOut || smallAmountOut === BigInt(0)) {
                // If 1 token is too much, try with an even smaller amount
                const tinyAmountIn = ethers.parseUnits("0.1", 18);
                const tinyAmountOut = await quoter.quoteExactInputSingle(tokenIn, tokenOut, tinyAmountIn, 0);

                if (!tinyAmountOut || tinyAmountOut === BigInt(0)) {
                    console.log("Cannot determine spot price. Pool may have insufficient liquidity.");
                    return null;
                }

                const tinyAmountOutHuman = Number(ethers.formatUnits(tinyAmountOut, lpData.tokenDecimals));
                const tinyAmountInHuman = 0.1;

                // Calculate min price based on token ordering
                minPrice = isToken0WMATIC ?
                    tinyAmountInHuman / tinyAmountOutHuman // WPOL per token
                    :
                    tinyAmountInHuman / tinyAmountOutHuman; // WPOL per token (same calculation!)
            } else {
                const smallAmountOutHuman = Number(ethers.formatUnits(smallAmountOut, lpData.tokenDecimals));

                // Calculate min price based on token ordering
                minPrice = isToken0WMATIC ?
                    1 / smallAmountOutHuman // WPOL per token
                    :
                    1 / smallAmountOutHuman; // WPOL per token (same calculation!)
            }

            // Calculate price impact (execution price should be the middle price, so we need to double the impact)
            const priceImpact = Math.abs((executionPrice - minPrice) / minPrice) * 2 * 1000000; // PPM

            return {
                amountOut: amountOut,
                executionPrice: executionPrice,
                minPrice: minPrice,
                priceImpact: Math.floor(priceImpact)
            };

        } catch (error) {
            console.error("Error in quoteSwapWithPriceImpact:", error);
            return null;
        }
    }

    /**
     * Calculate how many tokens to buy to move price to target
     */
    async calculateTokensToBuyForPrice(lpData, targetPrice) {
        if (lpData.type === 'V3') {
            console.log('🔍 Using Uniswap V3 SDK for accurate calculation...');

            try {
                return await this.calculateV3TokensToBuyForPrice(lpData, targetPrice);
            } catch (error) {
                console.log(`❌ V3 SDK calculation failed: ${error.message}`);
                console.log('   Falling back to simplified calculation');

                // Fallback to simplified calculation
                const currentPrice = lpData.tokenPrice;
                const priceIncrease = (targetPrice - currentPrice) / currentPrice;
                const estimatedWMATIC = lpData.totalLiquidityWMATIC * priceIncrease * 0.1;
                const estimatedTokens = estimatedWMATIC / targetPrice;

                return {
                    wmaticNeeded: estimatedWMATIC,
                    tokensReceived: estimatedTokens,
                    newPrice: targetPrice,
                    slippage: priceIncrease * 100,
                    note: 'V3 calculation failed - using simplified fallback'
                };
            }
        } else {
            // V2 calculation (original logic)
            const { wmaticReserve, tokenReserve } = lpData;

            // Using constant product formula: (x + Δx) * (y - Δy) = x * y
            // Where x = wmaticReserve, y = tokenReserve, Δx = wmaticIn, Δy = tokensOut

            // For target price P: P = (x + Δx) / (y - Δy)
            // Solving: Δy = y - (x + Δx) / P
            // And: Δx = (P * y - x) / (1 + P)

            const x = wmaticReserve;
            const y = tokenReserve;
            const P = targetPrice;

            // Calculate WMATIC needed
            const wmaticNeeded = (P * y - x) / (1 + P);

            // Calculate tokens received
            const tokensReceived = y - (x + wmaticNeeded) / P;

            return {
                wmaticNeeded,
                tokensReceived,
                newWmaticReserve: x + wmaticNeeded,
                newTokenReserve: y - tokensReceived,
                newPrice: (x + wmaticNeeded) / (y - tokensReceived),
                slippage: Math.abs((targetPrice - (x + wmaticNeeded) / (y - tokensReceived)) / targetPrice) * 100
            };
        }
    }

    /**
     * Analyze a single project's LP
     */
    async analyzeProject(projectName, projectData) {
        console.log(`\n🔍 Analyzing ${projectName} LP...`);

        const { issuanceToken } = projectData;

        // Get pair address (tries V3 first, then V2)
        const pairInfo = await this.getPairAddress(issuanceToken);
        if (!pairInfo) {
            console.log(`❌ No LP found for ${projectName}`);
            return null;
        }

        console.log(`✓ Found LP (${pairInfo.type}): ${pairInfo.address}`);

        // Get LP data
        const lpData = await this.getLPData(pairInfo);
        if (!lpData) {
            console.log(`❌ Failed to get LP data for ${projectName}`);
            return null;
        }

        console.log(`✓ LP Data:`);
        console.log(`   Token: ${lpData.tokenSymbol} (${lpData.tokenName})`);
        console.log(`   Current Price: ${lpData.tokenPrice.toFixed(8)} WMATIC/token`);
        console.log(`   Liquidity: ${lpData.totalLiquidityWMATIC.toFixed(2)} WMATIC`);

        if (lpData.type === 'V3') {
            console.log(`   Fee Tier: ${lpData.fee / 10000}%`);
            console.log(`   Pool Liquidity: ${lpData.liquidity.toFixed(2)}`);
        } else {
            console.log(`   Reserves: ${lpData.wmaticReserve.toFixed(2)} WMATIC, ${lpData.tokenReserve.toFixed(2)} tokens`);
        }

        return {
            projectName,
            ...lpData,
            pairAddress: lpData.pairAddress
        };
    }

    /**
     * Analyze all projects
     */
    async analyzeAllProjects() {
        console.log('🚀 Starting QuickSwap LP Analysis...\n');

        const results = [];

        for (const [projectName, projectData] of Object.entries(config.projects)) {
            const result = await this.analyzeProject(projectName, projectData);
            if (result) {
                results.push(result);
            }

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`\n✅ Analysis complete! Found ${results.length} LPs`);
        return results;
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
┌─────────────────────────────────────────────────────────────┐
│         QuickSwap LP Analyzer                               │
└─────────────────────────────────────────────────────────────┘

Usage:
  node getLPData.js [project_name] [target_price]

Arguments:
  project_name    Project name to analyze (optional, analyzes all if not provided)
  target_price    Target price in WMATIC/token (optional)

Examples:
  # Analyze all projects
  node getLPData.js

  # Analyze specific project
  node getLPData.js AKARUN

  # Calculate tokens needed for specific price
  node getLPData.js AKARUN 0.5

Features:
  ✓ Finds QuickSwap LPs for all bonding curve projects
  ✓ Calculates current prices and liquidity
  ✓ Determines tokens needed to reach target price
  ✓ Handles slippage calculations
        `);
        process.exit(0);
    }

    const analyzer = new QuickSwapLPAnalyzer();

    if (args.length === 0) {
        // Analyze all projects
        const results = await analyzer.analyzeAllProjects();

        console.log('\n📊 Summary:');
        console.log('═'.repeat(80));
        results.forEach(result => {
            console.log(`${result.projectName.padEnd(25)} | ${result.tokenPrice.toFixed(6).padStart(10)} WMATIC | ${result.totalLiquidityWMATIC.toFixed(0).padStart(8)} WMATIC`);
        });
    } else {
        // Analyze specific project
        const projectName = args[0].toUpperCase();
        const targetPrice = args[1] ? parseFloat(args[1]) : null;

        const projectData = config.projects[projectName];
        if (!projectData) {
            console.error(`❌ Project "${projectName}" not found`);
            process.exit(1);
        }

        const result = await analyzer.analyzeProject(projectName, projectData);
        if (!result) {
            process.exit(1);
        }

        if (targetPrice) {
            console.log(`\n🎯 Calculating tokens needed for price: ${targetPrice} WMATIC/token`);
            const calculation = await analyzer.calculateTokensToBuyForPrice(result, targetPrice);

            console.log(`\n📈 Arbitrage Calculation:`);
            console.log(`   WMATIC Needed: ${calculation.wmaticNeeded.toFixed(6)} WMATIC`);
            console.log(`   Tokens Received: ${calculation.tokensReceived.toFixed(2)} tokens`);
            console.log(`   New Price: ${calculation.newPrice.toFixed(8)} WMATIC/token`);
            console.log(`   Slippage: ${calculation.slippage.toFixed(2)}%`);
        }
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('\n❌ Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = QuickSwapLPAnalyzer;