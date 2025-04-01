/**
 * Simple test to verify VCoin program deployment on devnet
 */

const { Connection, PublicKey, Keypair, SystemProgram } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

// Configuration
const PROGRAM_ID = 'DGGdYArz4mBq1hxsfLM64vxRiSFMcP1URR1WjmNUaPST';
const RPC_URL = 'https://api.devnet.solana.com';

// Initialize connection
const connection = new Connection(RPC_URL, 'confirmed');

// Load wallet
const loadWalletFromFile = (path) => {
  const keypairData = JSON.parse(fs.readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(new Uint8Array(keypairData));
};

async function main() {
  try {
    console.log('Testing VCoin program deployment on devnet...');
    
    // Get program account
    const programId = new PublicKey(PROGRAM_ID);
    const programInfo = await connection.getAccountInfo(programId);
    
    if (!programInfo) {
      console.error('❌ Program not found! Deployment may have failed.');
      return;
    }
    
    console.log('✅ Program is deployed at:', PROGRAM_ID);
    console.log('   Program size:', programInfo.data.length, 'bytes');
    console.log('   Program owner:', programInfo.owner.toString());
    
    // Check program data account 
    console.log('\nVerifying program data account...');
    const programDataAddress = new PublicKey('8Xi8V9tgprF4AVG8QZL3ZGk1h5sr8zbSCuehnCQW8V5u');
    try {
      const programDataInfo = await connection.getAccountInfo(programDataAddress);
      if (programDataInfo) {
        console.log('✅ Program data account exists:', programDataAddress.toString());
        console.log('   Program data size:', programDataInfo.data.length, 'bytes');
      } else {
        console.log('❌ Program data account not found');
      }
    } catch (err) {
      console.error('Error checking program data:', err);
    }
    
    console.log('\nDeployment verification complete!');
  } catch (error) {
    console.error('Error during verification:', error);
  }
}

// Run the test
main().then(() => {
  console.log('Test completed');
}).catch((err) => {
  console.error('Test failed with error:', err);
}); 