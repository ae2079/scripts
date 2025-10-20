#!/usr/bin/env node

/**
 * Check Bonding Curve by Project Name
 * 
 * Usage:
 *   node checkProject.js <project_name> [target_supply]
 * 
 * Examples:
 *   node checkProject.js AKARUN 7500000
 *   node checkProject.js ANCIENT_BEAST
 *   node checkProject.js list  (shows all projects)
 */

const fs = require('fs');
const path = require('path');
const { accurateCheck } = require('./check');

// Load tokens info
const tokensInfoPath = path.join(__dirname, '../bondingCurveSimulator/tokensInfo.json');
let tokensInfo;

try {
    tokensInfo = JSON.parse(fs.readFileSync(tokensInfoPath, 'utf8'));
} catch (error) {
    console.error('\n❌ Could not load tokensInfo.json');
    console.error('   Expected at:', tokensInfoPath);
    process.exit(1);
}

function listProjects() {
    console.log('\n📋 Available Projects:');
    console.log('═'.repeat(70));

    const projects = Object.entries(tokensInfo.projects);
    projects.forEach(([name, data], index) => {
        console.log(`${(index + 1).toString().padStart(2)}. ${name.padEnd(35)} ${data.bondingCurve}`);
    });

    console.log('\n' + '═'.repeat(70));
    console.log(`Total: ${projects.length} projects`);
    console.log('\nUsage:');
    console.log('  node checkProject.js <project_name> [target_supply]');
    console.log('\nExample:');
    console.log('  node checkProject.js AKARUN 7500000\n');
}

async function main() {
    const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
    const saveReport = process.argv.includes('--report') || process.argv.includes('--save');

    if (args.length === 0 || process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log(`
┌─────────────────────────────────────────────────────────────┐
│         Check Project Bonding Curve                          │
└─────────────────────────────────────────────────────────────┘

Usage:
  node checkProject.js <project_name> [target_supply] [--report]
  node checkProject.js list

Arguments:
  project_name    Project name from tokensInfo.json
  target_supply   Target supply to analyze (optional)

Flags:
  --report, --save   Save analysis report to reports/ directory

Examples:
  node checkProject.js AKARUN 7500000
  node checkProject.js ANCIENT_BEAST --report
  node checkProject.js list
        `);
        process.exit(0);
    }

    const projectName = args[0].toUpperCase();

    // List command
    if (projectName === 'LIST') {
        listProjects();
        process.exit(0);
    }

    // Find project
    const project = tokensInfo.projects[projectName];

    if (!project) {
        console.error(`\n❌ Project "${projectName}" not found`);
        console.log('\n💡 Available projects:');
        Object.keys(tokensInfo.projects).forEach(name => {
            console.log(`   - ${name}`);
        });
        console.log('\n   Or use: node checkProject.js list\n');
        process.exit(1);
    }

    // Parse target supply
    const targetSupply = args[1] ? parseFloat(args[1]) : null;

    console.log('\n📦 Project Info:');
    console.log('═'.repeat(70));
    console.log(`Name: ${projectName}`);
    console.log(`Bonding Curve: ${project.bondingCurve}`);
    console.log(`Issuance Token: ${project.issuanceToken}`);
    console.log(`Collateral Token: ${project.collateralToken}`);
    console.log('═'.repeat(70));

    // Run the accurate check
    await accurateCheck(project.bondingCurve, targetSupply, null, saveReport, projectName);
}

if (require.main === module) {
    main().catch(error => {
        console.error('\n❌ Fatal error:', error.message);
        process.exit(1);
    });
}