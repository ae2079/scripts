#!/usr/bin/env node

/**
 * Analyze All Projects
 * 
 * Runs bonding curve analysis on all projects in tokensInfo.json
 * and generates reports for each one.
 */

const fs = require('fs');
const path = require('path');
const { accurateCheck } = require('./check');

const tokensInfoPath = path.join(__dirname, '../bondingCurveSimulator/tokensInfo.json');
const tokensInfo = JSON.parse(fs.readFileSync(tokensInfoPath, 'utf8'));

// Retry and circuit breaker configuration
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 5000, // 5 seconds base delay
    maxDelay: 300000, // 5 minutes max delay
    backoffMultiplier: 2, // Exponential backoff
};

const CIRCUIT_BREAKER = {
    failureThreshold: 3, // Open circuit after 3 consecutive failures
    recoveryTime: 120000, // 2 minutes before trying again
    failureCount: 0,
    state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
    lastFailureTime: null,
};

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error) {
    const message = error.message ? error.message.toLowerCase() : '';
    return message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('429') ||
        error.code === 'RATE_LIMIT_EXCEEDED';
}

/**
 * Check circuit breaker state
 */
function checkCircuitBreaker() {
    if (CIRCUIT_BREAKER.state === 'OPEN') {
        const timeSinceFailure = Date.now() - CIRCUIT_BREAKER.lastFailureTime;
        if (timeSinceFailure >= CIRCUIT_BREAKER.recoveryTime) {
            console.log(`\n🔄 Circuit breaker: Moving to HALF_OPEN state`);
            CIRCUIT_BREAKER.state = 'HALF_OPEN';
            CIRCUIT_BREAKER.failureCount = 0;
        } else {
            const waitTime = Math.ceil((CIRCUIT_BREAKER.recoveryTime - timeSinceFailure) / 1000);
            throw new Error(`Circuit breaker OPEN. Wait ${waitTime}s before retry.`);
        }
    }
}

/**
 * Record success in circuit breaker
 */
function recordSuccess() {
    if (CIRCUIT_BREAKER.state === 'HALF_OPEN') {
        console.log(`✓ Circuit breaker: Recovered, moving to CLOSED state`);
        CIRCUIT_BREAKER.state = 'CLOSED';
    }
    CIRCUIT_BREAKER.failureCount = 0;
}

/**
 * Record failure in circuit breaker
 */
function recordFailure() {
    CIRCUIT_BREAKER.failureCount++;
    CIRCUIT_BREAKER.lastFailureTime = Date.now();

    if (CIRCUIT_BREAKER.failureCount >= CIRCUIT_BREAKER.failureThreshold) {
        console.log(`\n⚠️  Circuit breaker OPENED after ${CIRCUIT_BREAKER.failureCount} failures`);
        console.log(`   Waiting ${CIRCUIT_BREAKER.recoveryTime / 1000}s before retry...`);
        CIRCUIT_BREAKER.state = 'OPEN';
    }
}

/**
 * Analyze project with retry logic
 */
async function analyzeProjectWithRetry(name, data, retryCount = 0) {
    try {
        // Check circuit breaker
        checkCircuitBreaker();

        // Attempt analysis
        const result = await accurateCheck(data.bondingCurve, 7500000, null, true, name);

        // Success - record and return
        recordSuccess();

        return {
            name,
            success: true,
            contract: data.bondingCurve,
            currentSupply: result.currentState ? result.currentState.supply : null,
            targetSupply: result.targetAnalysis ? result.targetAnalysis.targetSupply : null,
            tokensToBuy: result.targetAnalysis ? result.targetAnalysis.tokensNeeded : null,
            wpolCost: result.targetAnalysis ? result.targetAnalysis.cost ? result.targetAnalysis.cost.wpol : null : null,
            usdCost: result.targetAnalysis ? result.targetAnalysis.cost ? result.targetAnalysis.cost.usd : null : null,
            currentBuyPrice: result.currentPrices ? result.currentPrices.buy ? result.currentPrices.buy.wpol : null : null,
            currentSellPrice: result.currentPrices ? result.currentPrices.sell ? result.currentPrices.sell.wpol : null : null,
            targetBuyPrice: result.targetAnalysis ? result.targetAnalysis.pricesAtTarget ? result.targetAnalysis.pricesAtTarget.buy ? result.targetAnalysis.pricesAtTarget.buy.wpol : null : null : null,
            targetStaticPrice: result.targetAnalysis ? result.targetAnalysis.pricesAtTarget ? result.targetAnalysis.pricesAtTarget.static ? result.targetAnalysis.pricesAtTarget.static.wpol : null : null : null,
            targetSellPrice: result.targetAnalysis ? result.targetAnalysis.pricesAtTarget ? result.targetAnalysis.pricesAtTarget.sell ? result.targetAnalysis.pricesAtTarget.sell.wpol : null : null : null,
            averagePrice: result.targetAnalysis ? result.targetAnalysis.averagePrice ? result.targetAnalysis.averagePrice.wpol : null : null,
            polPrice: result.polPrice,
        };

    } catch (error) {
        const isRateLimit = isRateLimitError(error);

        // If rate limit error and retries available, retry with backoff
        if (isRateLimit && retryCount < RETRY_CONFIG.maxRetries) {
            recordFailure();

            const delay = Math.min(
                RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, retryCount),
                RETRY_CONFIG.maxDelay
            );

            console.log(`\n⚠️  Rate limit hit. Retry ${retryCount + 1}/${RETRY_CONFIG.maxRetries} in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));

            return analyzeProjectWithRetry(name, data, retryCount + 1);
        }

        // Max retries exceeded or non-rate-limit error
        if (isRateLimit) {
            recordFailure();
        }

        console.error(`❌ ${name} failed:`, error.message);
        return {
            name,
            success: false,
            error: error.message,
            retries: retryCount,
        };
    }
}

async function analyzeAllProjects() {
    const projects = Object.entries(tokensInfo.projects);
    const results = [];

    console.log('\n🔄 Analyzing All Projects');
    console.log('═'.repeat(70));
    console.log(`Total projects: ${projects.length}`);
    console.log(`Retry config: Max ${RETRY_CONFIG.maxRetries} retries with exponential backoff`);
    console.log(`Circuit breaker: Opens after ${CIRCUIT_BREAKER.failureThreshold} consecutive failures`);
    console.log('═'.repeat(70));

    for (let i = 0; i < projects.length; i++) {
        const [name, data] = projects[i];

        console.log(`\n[${i + 1}/${projects.length}] Analyzing ${name}...`);
        console.log('─'.repeat(70));

        const result = await analyzeProjectWithRetry(name, data);
        results.push(result);

        if (result.success) {
            console.log(`✅ ${name} complete`);

            // Add delay to avoid rate limiting (wait 10 seconds between projects)
            if (i < projects.length - 1) {
                console.log(`⏳ Waiting 3s to avoid rate limits...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } else {
            console.log(`❌ ${name} failed after ${result.retries || 0} retries`);

            // If circuit breaker is open, wait recovery time
            if (CIRCUIT_BREAKER.state === 'OPEN') {
                console.log(`⏳ Circuit breaker open, waiting ${CIRCUIT_BREAKER.recoveryTime / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, CIRCUIT_BREAKER.recoveryTime));
            }
        }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('📊 SUMMARY: Target Supply Analysis (7.5M)');
    console.log('═'.repeat(70));

    // Sort by WPOL cost (descending)
    const successful = results.filter(r => r.success).sort((a, b) => (b.wpolCost || 0) - (a.wpolCost || 0));

    console.log('\n📋 Cost to Reach 7.5M Supply:\n');
    console.log('| # | Project | Tokens to Buy | WPOL Cost | USD Cost |');
    console.log('|---|---------|---------------|-----------|----------|');

    let totalWpolCost = 0;
    let totalUsdCost = 0;

    successful.forEach((r, i) => {
        if (r.wpolCost && r.usdCost) {
            totalWpolCost += r.wpolCost;
            totalUsdCost += r.usdCost;
            console.log(`| ${String(i + 1).padStart(2)} | ${r.name.padEnd(25)} | ${r.tokensToBuy.toLocaleString(undefined, {maximumFractionDigits: 0}).padStart(13)} | ${r.wpolCost.toLocaleString(undefined, {maximumFractionDigits: 0}).padStart(9)} | $${r.usdCost.toLocaleString(undefined, {maximumFractionDigits: 0}).padStart(7)} |`);
        }
    });

    console.log('|---|---------|---------------|-----------|----------|');
    console.log(`|   | **TOTAL** | | **${totalWpolCost.toLocaleString(undefined, {maximumFractionDigits: 0}).padStart(9)}** | **$${totalUsdCost.toLocaleString(undefined, {maximumFractionDigits: 0}).padStart(7)}** |`);

    console.log('\n\n💰 Prices at Target Supply (7.5M):\n');
    console.log('| # | Project | Buy Price | Static Price | Sell Price | Avg Price |');
    console.log('|---|---------|-----------|--------------|------------|-----------|');

    successful.forEach((r, i) => {
        if (r.targetBuyPrice) {
            console.log(`| ${String(i + 1).padStart(2)} | ${r.name.padEnd(25)} | ${r.targetBuyPrice.toFixed(4)} | ${r.targetStaticPrice.toFixed(4)} | ${r.targetSellPrice.toFixed(4)} | ${r.averagePrice.toFixed(4)} |`);
        }
    });

    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
        console.log(`\n\n❌ Failed: ${failed.length} projects`);
        failed.forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }

    console.log('\n' + '═'.repeat(70));
    console.log(`✅ Analysis complete: ${successful.length}/${projects.length} projects`);
    console.log(`📁 Individual reports saved to: reports/`);
    console.log('═'.repeat(70) + '\n');

    // Save summary JSON
    const summaryPath = path.join(__dirname, 'reports', 'summary.json');
    const summaryData = {
        timestamp: new Date().toISOString(),
        targetSupply: 7500000,
        totalProjects: projects.length,
        successful: successful.length,
        failed: failed.length,
        totals: {
            wpolCost: totalWpolCost,
            usdCost: totalUsdCost,
        },
        projects: results,
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2));

    // Save summary Markdown
    const summaryMdPath = path.join(__dirname, 'reports', 'summary.md');
    const summaryMarkdown = generateSummaryMarkdown(summaryData, successful, failed);
    fs.writeFileSync(summaryMdPath, summaryMarkdown);

    console.log(`📄 Summary reports saved:`);
    console.log(`   JSON: ${summaryPath}`);
    console.log(`   MD:   ${summaryMdPath}\n`);
}

function generateSummaryMarkdown(data, successful, failed) {
    let md = `# Portfolio Analysis Summary\n\n`;
    md += `**Generated:** ${new Date(data.timestamp).toLocaleString()}\n`;
    md += `**Target Supply:** ${data.targetSupply.toLocaleString()} tokens per project\n`;
    md += `**Total Projects:** ${data.totalProjects} (${successful.length} successful, ${failed.length} failed)\n\n`;

    md += `## 💰 Total Cost to Reach Target\n\n`;
    md += `- **WPOL:** ${data.totals.wpolCost.toLocaleString(undefined, {maximumFractionDigits: 2})}\n`;
    md += `- **USD:** $${data.totals.usdCost.toLocaleString(undefined, {maximumFractionDigits: 2})}\n\n`;

    md += `## 📊 Cost Breakdown by Project\n\n`;
    md += `| # | Project | Tokens to Buy | WPOL Cost | USD Cost |\n`;
    md += `|---|---------|--------------|-----------|----------|\n`;

    successful.forEach((r, i) => {
        if (r.wpolCost) {
            md += `| ${i + 1} | ${r.name} | ${r.tokensToBuy.toLocaleString(undefined, {maximumFractionDigits: 0})} | ${r.wpolCost.toLocaleString(undefined, {maximumFractionDigits: 2})} | $${r.usdCost.toLocaleString(undefined, {maximumFractionDigits: 2})} |\n`;
        }
    });

    md += `\n## 💎 Prices at Target Supply\n\n`;
    md += `| # | Project | Buy Price | Static Price | Sell Price | Avg Buy Price |\n`;
    md += `|---|---------|-----------|--------------|------------|---------------|\n`;

    successful.forEach((r, i) => {
        if (r.targetBuyPrice) {
            md += `| ${i + 1} | ${r.name} | ${r.targetBuyPrice.toFixed(4)} | ${r.targetStaticPrice.toFixed(4)} | ${r.targetSellPrice.toFixed(4)} | ${r.averagePrice.toFixed(4)} |\n`;
        }
    });

    md += `\n## 📈 Current vs Target Prices\n\n`;
    md += `| Project | Current Buy | Target Buy | Change |\n`;
    md += `|---------|-------------|------------|--------|\n`;

    successful.forEach(r => {
        if (r.currentBuyPrice && r.targetBuyPrice) {
            const change = ((r.targetBuyPrice - r.currentBuyPrice) / r.currentBuyPrice * 100).toFixed(1);
            md += `| ${r.name} | ${r.currentBuyPrice.toFixed(4)} | ${r.targetBuyPrice.toFixed(4)} | +${change}% |\n`;
        }
    });

    md += `\n## 📋 Project Details\n\n`;
    successful.forEach((r, i) => {
        md += `### ${i + 1}. ${r.name}\n\n`;
        md += `- **Contract:** \`${r.contract}\`\n`;
        md += `- **Current Supply:** ${r.currentSupply.toLocaleString(undefined, {maximumFractionDigits: 2})} tokens\n`;
        md += `- **Target Supply:** ${r.targetSupply.toLocaleString()} tokens\n`;
        md += `- **Tokens to Buy:** ${r.tokensToBuy.toLocaleString(undefined, {maximumFractionDigits: 2})}\n`;
        md += `- **WPOL Cost:** ${r.wpolCost.toLocaleString(undefined, {maximumFractionDigits: 2})} WPOL\n`;
        md += `- **USD Cost:** $${r.usdCost.toLocaleString(undefined, {maximumFractionDigits: 2})}\n`;
        md += `- **Current Buy Price:** ${r.currentBuyPrice.toFixed(6)} WPOL/token\n`;
        md += `- **Target Buy Price:** ${r.targetBuyPrice.toFixed(6)} WPOL/token\n`;
        md += `- **Average Price:** ${r.averagePrice.toFixed(6)} WPOL/token\n\n`;
    });

    if (failed.length > 0) {
        md += `## ❌ Failed Projects\n\n`;
        failed.forEach(r => {
            md += `- **${r.name}:** ${r.error}\n`;
        });
    }

    md += `\n---\n*Generated by Bonding Curve Simulator*\n`;

    return md;
}

if (require.main === module) {
    analyzeAllProjects().catch(error => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { analyzeAllProjects };