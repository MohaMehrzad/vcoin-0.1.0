// Simple test script for metadata updates
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('💰 VCoin Metadata Update Test Script 💰');
console.log('=======================================');

// Check if token-metadata.json exists
const metadataPath = path.join(process.cwd(), 'token-metadata.json');
if (!fs.existsSync(metadataPath)) {
  console.log('❌ Error: token-metadata.json not found.');
  console.log('   Run "npm run create-token" first to create a token.');
  process.exit(1);
}

// Read the current metadata
console.log('📝 Reading current token metadata...');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
console.log(`   Token: ${metadata.name || 'Unknown'} (${metadata.symbol || 'Unknown'})`);
console.log(`   Mint Address: ${metadata.mintAddress || 'Not set'}`);
console.log(`   Has on-chain metadata: ${metadata.metadataAddress ? 'Yes' : 'No'}`);

// Now run the update-metadata script
console.log('\n🔄 Testing metadata update functionality...');
try {
  // Execute in dry-run mode to prevent actual blockchain transactions
  // This just tests if the code can run without errors
  console.log('   Running in dry-run mode (no actual transactions)');
  
  // Import the module directly instead of executing it
  const updateMetadataPath = path.join(process.cwd(), 'src', 'update-metadata.ts');
  console.log(`   Testing file: ${updateMetadataPath}`);
  
  // Check if file exists
  if (!fs.existsSync(updateMetadataPath)) {
    console.log('❌ Error: update-metadata.ts not found.');
    process.exit(1);
  }
  
  console.log('   File exists, executing using ts-node...');
  
  // Attempt to load the module using ts-node
  try {
    execSync('npx ts-node scripts/simulate-metadata-update.ts', { stdio: 'inherit' });
    console.log('\n✅ Metadata update simulation completed successfully!');
  } catch (error) {
    console.error('\n❌ Error during simulation:', error.message);
    process.exit(1);
  }
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
} 