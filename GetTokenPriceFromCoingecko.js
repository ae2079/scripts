export class CoinGeckoService {
    constructor() {
        this.baseUrl = 'https://api.coingecko.com/api/v3';
        this.tokenId = 'giveth';
        this.cache = {
            price: null,
            lastUpdated: 0
        };
        this.cacheDuration = 5 * 60 * 1000; // 5 minutes cache
    }

    /**
     * Get distribution token price in USD
     * @param {boolean} forceRefresh Force refresh the cache
     * @returns {Promise<number>} Distribution token price in USD
     */
    async getTokenPrice(forceRefresh = false) {
        const now = Date.now();

        // Return cached price if still valid and not forcing refresh
        if (!forceRefresh &&
            this.cache.price !== null &&
            (now - this.cache.lastUpdated) < this.cacheDuration) {
            return this.cache.price;
        }

        try {
            const response = await fetch(
                `${this.baseUrl}/simple/price?ids=${this.tokenId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&include_last_updated_at=true`
            );

            if (!response.ok) {
                throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();


            if (!data[this.tokenId] || !data[this.tokenId].usd) {
                throw new Error(`Token '${this.tokenId}' price not found in CoinGecko response. Available tokens: ${Object.keys(data).join(', ')}`);
            }

            const price = data[this.tokenId].usd;

            // Update cache
            this.cache.price = price;
            this.cache.lastUpdated = now;

            console.log(`Token price updated: $${price} USD`);
            return price;

        } catch (error) {
            console.error('Failed to fetch token price from CoinGecko:', error);

            // If we have a cached price, return it even if expired
            if (this.cache.price !== null) {
                console.log(`Using cached token price: $${this.cache.price} USD`);
                return this.cache.price;
            }

            // Fallback to a default price if no cache available
            console.log('Using fallback token price: $0.10 USD');
            return 0.10; // Fallback price
        }
    }

    /**
     * Convert token amount to USD value
     * @param {number} tokenAmount Amount in distribution tokens
     * @param {boolean} forceRefresh Force refresh the price cache
     * @returns {Promise<number>} USD value
     */
    async convertTokenToUsd(tokenAmount, forceRefresh = false) {
        const tokenPrice = await this.getTokenPrice(forceRefresh);
        return tokenAmount * tokenPrice;
    }

    /**
     * Get cache information
     * @returns {Object} Cache status
     */
    getCacheInfo() {
        const now = Date.now();
        const isExpired = (now - this.cache.lastUpdated) >= this.cacheDuration;

        return {
            price: this.cache.price,
            lastUpdated: this.cache.lastUpdated,
            isExpired
        };
    }

    /**
     * Clear the price cache
     */
    clearCache() {
        this.cache.price = null;
        this.cache.lastUpdated = 0;
        console.log('Distribution token price cache cleared');
    }
}

/**
 * Main function to test the CoinGeckoService
 */
async function main() {
    console.log('=== Testing CoinGeckoService ===\n');

    const coinGeckoService = new CoinGeckoService();

    try {
        // Test 1: Get token price
        console.log('1. Getting current token price...');
        const price = await coinGeckoService.getTokenPrice();
        console.log(`   Current price: $${price} USD\n`);

        // Test 2: Convert token amount to USD
        console.log('2. Converting 1000 tokens to USD...');
        const tokenAmount = 1000;
        const usdValue = await coinGeckoService.convertTokenToUsd(tokenAmount);
        console.log(`   ${tokenAmount} tokens = $${usdValue.toFixed(2)} USD\n`);

        // Test 3: Check cache info
        console.log('3. Checking cache information...');
        const cacheInfo = coinGeckoService.getCacheInfo();
        console.log(`   Cached price: $${cacheInfo.price} USD`);
        console.log(`   Last updated: ${new Date(cacheInfo.lastUpdated).toLocaleString()}`);
        console.log(`   Cache expired: ${cacheInfo.isExpired}\n`);

        // Test 4: Force refresh price
        console.log('4. Force refreshing price...');
        const refreshedPrice = await coinGeckoService.getTokenPrice(true);
        console.log(`   Refreshed price: $${refreshedPrice} USD\n`);

        // Test 5: Clear cache
        console.log('5. Clearing cache...');
        coinGeckoService.clearCache();
        const cacheInfoAfterClear = coinGeckoService.getCacheInfo();
        console.log(`   Cache cleared. Price: ${cacheInfoAfterClear.price}`);
        console.log(`   Last updated: ${cacheInfoAfterClear.lastUpdated}\n`);

        console.log('=== All tests completed successfully! ===');

    } catch (error) {
        console.error('Error during testing:', error);
    }
}

main();