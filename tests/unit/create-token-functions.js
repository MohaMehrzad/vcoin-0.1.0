// This file contains the functions extracted from create-token.ts for testing
const { 
  TOKEN_2022_PROGRAM_ID, 
  createMint,
  createAssociatedTokenAccountIdempotent,
  mintTo,
} = require('@solana/spl-token');

const {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bs58 = require('bs58');

// Import from utils
const {
  getConnection,
  getOrCreateKeypair,
  TOKEN_NAME,
  TOKEN_SYMBOL,
  TOKEN_DECIMALS,
  TOKEN_TOTAL_SUPPLY,
  tokensToRawAmount,
  saveTokenMetadata
} = require('../../src/utils');

// Helper function to handle errors based on environment
function handleError(message, error) {
  console.error(message, error);
  if (process.env.NODE_ENV === 'test') {
    throw error || new Error(message);
  } else {
    process.exit(1);
  }
}

// Function to get keypair from secret key input
async function getKeypairFromPhantom() {
  console.log("\nYou can use your existing Phantom wallet as the authority.");
  console.log("\nTo export your private key from Phantom wallet:");
  console.log("1. Open Phantom wallet");
  console.log("2. Click on the three dots on the bottom right");
  console.log("3. Go to 'Settings' → 'Security & Privacy' → 'Export Private Key'");
  console.log("4. Enter your password");
  console.log("5. Copy the private key (it will be a base58 encoded string)");
  console.log("\nWARNING: NEVER share your private key with anyone else!");
  console.log("\n");
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Check if keypair already exists in keypairs directory
  const keypairPath = path.resolve(process.cwd(), 'keypairs', 'authority.json');
  if (fs.existsSync(keypairPath)) {
    console.log('Authority keypair already exists. Would you like to:');
    console.log('1. Use the existing keypair');
    console.log('2. Create a new keypair from your Phantom wallet');
    
    const answer = await new Promise(resolve => {
      rl.question('Enter your choice (1 or 2): ', resolve);
    });
    
    if (answer === '1') {
      rl.close();
      return getOrCreateKeypair('authority');
    }
  }
  
  // Get private key from user
  const privateKeyBase58 = await new Promise(resolve => {
    rl.question('Enter your Phantom wallet private key: ', resolve);
  });
  
  rl.close();
  
  try {
    // Decode base58 private key to bytes
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    
    // Create keypair from private key
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    
    // Save the keypair to the keypairs directory
    const keypairsDir = path.resolve(process.cwd(), 'keypairs');
    if (!fs.existsSync(keypairsDir)) {
      fs.mkdirSync(keypairsDir, { recursive: true });
    }
    
    fs.writeFileSync(
      keypairPath,
      JSON.stringify(Array.from(keypair.secretKey)),
      'utf-8'
    );
    
    console.log(`\nKeypair saved to ${keypairPath}`);
    console.log(`Public key (wallet address): ${keypair.publicKey.toString()}`);
    return keypair;
  } catch (error) {
    return handleError('Error creating keypair from private key:', error);
  }
}

async function createVCoinToken(options = {}) {
  // For testing purposes, allow overriding the balance check
  const skipBalanceCheck = options.skipBalanceCheck || false;
  
  console.log(`Creating ${TOKEN_NAME} (${TOKEN_SYMBOL}) token using token-2022 program...`);
  
  // Get connection to Solana network
  const connection = getConnection();
  
  // Get or create authority keypair
  let authorityKeypair;
  const useExistingKeypair = process.argv.includes('--use-existing');
  
  if (useExistingKeypair) {
    authorityKeypair = getOrCreateKeypair('authority');
  } else {
    authorityKeypair = await getKeypairFromPhantom();
  }
  
  console.log(`\nAuthority: ${authorityKeypair.publicKey.toString()}`);
  
  // Check if the authority has enough SOL
  const authorityBalance = await connection.getBalance(authorityKeypair.publicKey);
  console.log(`Authority balance: ${authorityBalance / LAMPORTS_PER_SOL} SOL`);
  
  if (!skipBalanceCheck && authorityBalance < 0.05 * LAMPORTS_PER_SOL) {
    return handleError('Error: Authority account does not have enough SOL. Please fund your wallet with at least 0.05 SOL on devnet before continuing.');
  }
  
  // Create mint account using token-2022 program
  console.log('\nCreating mint account with token-2022 program...');
  // No extensions for now, but can be added later
  const extensions = [];
  
  try {
    // Create the mint
    const mint = await createMint(
      connection,
      authorityKeypair,
      authorityKeypair.publicKey,
      authorityKeypair.publicKey,
      TOKEN_DECIMALS,
      undefined, // keypair - one will be generated internally if not provided
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log(`\nToken mint created: ${mint.toString()}`);
    
    // Get associated token account for authority
    const authorityTokenAccount = await createAssociatedTokenAccountIdempotent(
      connection,
      authorityKeypair,
      mint,
      authorityKeypair.publicKey,
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log(`Authority token account: ${authorityTokenAccount.toString()}`);
    
    // Convert tokens to raw amount with decimals
    const rawSupply = tokensToRawAmount(TOKEN_TOTAL_SUPPLY);
    console.log(`\nMinting ${TOKEN_TOTAL_SUPPLY} ${TOKEN_SYMBOL} tokens...`);
    
    // Mint tokens to authority
    const signature = await mintTo(
      connection,
      authorityKeypair,
      mint,
      authorityTokenAccount,
      authorityKeypair.publicKey,
      BigInt(rawSupply),
      [],
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log(`Tokens minted successfully!`);
    console.log(`Transaction signature: ${signature}`);
    console.log(`Tokens minted to ${authorityTokenAccount.toString()}`);
    
    // Save token metadata
    const tokenData = {
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      decimals: TOKEN_DECIMALS,
      totalSupply: TOKEN_TOTAL_SUPPLY.toString(),
      mintAddress: mint.toString(),
      authorityAddress: authorityKeypair.publicKey.toString(),
      authorityTokenAccount: authorityTokenAccount.toString(),
      programId: TOKEN_2022_PROGRAM_ID.toString(),
      network: process.env.SOLANA_NETWORK || 'devnet'
    };
    
    saveTokenMetadata(tokenData);
    
    console.log('\n=========================================');
    console.log('Token creation completed successfully!');
    console.log('=========================================');
    console.log('Token metadata saved to token-metadata.json');
    console.log(`Mint address: ${mint.toString()}`);
    console.log(`Authority address: ${authorityKeypair.publicKey.toString()}`);
    console.log('\nYou can view your token on Solana Explorer:');
    console.log(`https://explorer.solana.com/address/${mint.toString()}?cluster=${process.env.SOLANA_NETWORK || 'devnet'}`);
    console.log('=========================================');
    
    return {
      mint,
      authorityKeypair,
      authorityTokenAccount,
      tokenData
    };
  } catch (error) {
    return handleError('\nError creating token:', error);
  }
}

// Export the functions for testing
module.exports = {
  getKeypairFromPhantom,
  createVCoinToken,
  handleError
}; 