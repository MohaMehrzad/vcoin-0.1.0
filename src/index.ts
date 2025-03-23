import * as fs from 'fs';
import * as path from 'path';
import { TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, TOKEN_TOTAL_SUPPLY } from './utils';

// Check if token metadata exists
const TOKEN_METADATA_PATH = path.resolve(process.cwd(), 'token-metadata.json');
const hasTokenMetadata = fs.existsSync(TOKEN_METADATA_PATH);

// Check if presale data exists
const PRESALE_DATA_PATH = path.resolve(process.cwd(), 'presale-data.json');
const hasPresaleData = fs.existsSync(PRESALE_DATA_PATH);

// Check if vesting data exists
const VESTING_DATA_PATH = path.resolve(process.cwd(), 'vesting-data.json');
const hasVestingData = fs.existsSync(VESTING_DATA_PATH);

/**
 * Print VCoin token information
 */
function printTokenInfo() {
  console.log('=========================================');
  console.log(`${TOKEN_NAME} (${TOKEN_SYMBOL}) Token Information`);
  console.log('=========================================');
  console.log(`Total Supply: ${TOKEN_TOTAL_SUPPLY} ${TOKEN_SYMBOL}`);
  console.log(`Decimals: ${TOKEN_DECIMALS}`);
  console.log(`Protocol: Token-2022 (Solana)`);
  console.log('=========================================');
  
  if (hasTokenMetadata) {
    const tokenMetadata = JSON.parse(fs.readFileSync(TOKEN_METADATA_PATH, 'utf-8'));
    console.log('Token Status: Created');
    console.log(`Mint Address: ${tokenMetadata.mintAddress}`);
    
    if (tokenMetadata.allocations) {
      console.log('\nToken Allocations:');
      if (tokenMetadata.allocations.development) {
        console.log(`Development: ${tokenMetadata.allocations.development.amount} ${TOKEN_SYMBOL}`);
      }
      if (tokenMetadata.allocations.presale) {
        console.log(`Presale: ${tokenMetadata.allocations.presale.amount} ${TOKEN_SYMBOL}`);
      }
      if (tokenMetadata.allocations.airdrop) {
        console.log(`Airdrop: ${tokenMetadata.allocations.airdrop.amount} ${TOKEN_SYMBOL}`);
      }
      if (tokenMetadata.allocations.vesting) {
        console.log(`Vesting: ${tokenMetadata.allocations.vesting.amount} ${TOKEN_SYMBOL}`);
      }
    } else {
      console.log('\nToken Allocations: Not yet allocated');
    }
  } else {
    console.log('Token Status: Not Created');
  }
  
  // Presale info
  if (hasPresaleData) {
    const presaleData = JSON.parse(fs.readFileSync(PRESALE_DATA_PATH, 'utf-8'));
    console.log('\nPresale Status:');
    console.log(`Active: ${presaleData.isActive ? 'Yes' : 'No'}`);
    console.log(`Tokens Sold: ${presaleData.totalTokensSold || 0} ${TOKEN_SYMBOL}`);
    console.log(`USD Raised: $${presaleData.totalUsdRaised || 0}`);
  } else {
    console.log('\nPresale Status: Not Started');
  }
  
  // Vesting info
  if (hasVestingData) {
    const vestingData = JSON.parse(fs.readFileSync(VESTING_DATA_PATH, 'utf-8'));
    console.log('\nVesting Status:');
    console.log(`Initialized: ${vestingData.initialized ? 'Yes' : 'No'}`);
    if (vestingData.initialized) {
      console.log(`Tokens Released: ${vestingData.totalReleased || 0} ${TOKEN_SYMBOL}`);
      console.log(`Next Release: ${vestingData.nextReleaseDate ? new Date(vestingData.nextReleaseDate).toLocaleDateString() : 'None'}`);
    }
  } else {
    console.log('\nVesting Status: Not Initialized');
  }
}

/**
 * Print usage instructions
 */
function printUsageInstructions() {
  console.log('\n=========================================');
  console.log('VCoin Management System - Usage Instructions');
  console.log('=========================================');
  console.log('1. Token Creation:');
  console.log('   npm run create-token');
  console.log('\n2. Token Allocation:');
  console.log('   npm run allocate-token');
  console.log('\n3. Presale Management:');
  console.log('   npm run presale start');
  console.log('   npm run presale buy <buyer_address> <usd_amount>');
  console.log('   npm run presale status');
  console.log('   npm run presale end');
  console.log('\n4. Vesting Management:');
  console.log('   npm run vesting init');
  console.log('   npm run vesting execute <release_number>');
  console.log('   npm run vesting status');
  console.log('=========================================');
}

// Run the main function
function main() {
  printTokenInfo();
  printUsageInstructions();
}

main(); 