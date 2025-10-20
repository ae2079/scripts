/**
 * Fetch POL (Polygon) Price from CoinGecko API
 * 
 * Free tier: 10-30 calls/minute
 */

const https = require('https');

async function getPOLPrice() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.coingecko.com',
            path: '/api/v3/simple/price?ids=polygon-ecosystem-token&vs_currencies=usd',
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed['polygon-ecosystem-token'] && parsed['polygon-ecosystem-token'].usd) {
                        resolve(parsed['polygon-ecosystem-token'].usd);
                    } else {
                        reject(new Error('POL price not found in response'));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse response: ' + error.message));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error('API request failed: ' + error.message));
        });

        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

async function getPOLPriceWithFallback(fallbackPrice = 0.195) {
    try {
        const price = await getPOLPrice();
        console.log(`✓ Fetched POL price: $${price}`);
        return price;
    } catch (error) {
        console.log(`⚠️  Failed to fetch POL price: ${error.message}`);
        console.log(`   Using fallback: $${fallbackPrice}`);
        return fallbackPrice;
    }
}

// CLI usage
if (require.main === module) {
    console.log('\n🔍 Fetching POL price from CoinGecko...\n');

    getPOLPrice()
        .then(price => {
            console.log('═'.repeat(50));
            console.log(`POL Price: $${price} USD`);
            console.log('═'.repeat(50));
            console.log(`\nSource: CoinGecko API`);
            console.log(`Time: ${new Date().toLocaleString()}\n`);
        })
        .catch(error => {
            console.error(`❌ Error: ${error.message}\n`);
            process.exit(1);
        });
}

module.exports = { getPOLPrice, getPOLPriceWithFallback };