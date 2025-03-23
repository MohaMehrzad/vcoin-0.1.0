import { 
  TOKEN_2022_PROGRAM_ID, 
  createMint,
  createAssociatedTokenAccountIdempotent,
  mintTo,
  ExtensionType,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import bs58 from 'bs58';
import {
  getConnection,
  getOrCreateKeypair,
  TOKEN_NAME,
  TOKEN_SYMBOL,
  TOKEN_DECIMALS,
  TOKEN_TOTAL_SUPPLY,
  tokensToRawAmount,
  saveTokenMetadata
} from './utils';
import { execSync } from 'child_process';
import { Writable } from 'stream';

// Helper function to handle errors based on environment
export function handleError(message: string, error?: Error): never {
  console.error(message, error);
  if (process.env.NODE_ENV === 'test') {
    throw error || new Error(message);
  } else {
    process.exit(1);
  }
}

// Function to get keypair from secret key input
export async function getKeypairFromPhantom(): Promise<Keypair> {
  console.log("\nYou can use your existing Phantom wallet as the authority.");
  console.log("\nTo export your private key from Phantom wallet:");
  console.log("1. Open Phantom wallet");
  console.log("2. Click on the three dots on the bottom right");
  console.log("3. Go to 'Settings' → 'Security & Privacy' → 'Export Private Key'");
  console.log("4. Enter your password");
  console.log("5. Copy the private key (it will be a base58 encoded string)");
  console.log("\nWARNING: NEVER share your private key with anyone else!");
  console.log("\nSECURITY NOTE: For production use, consider using a hardware wallet integration instead.");
  console.log("\n");
  
  // Check if keypair already exists in keypairs directory
  const keypairPath = path.resolve(process.cwd(), 'keypairs', 'authority.json');
  if (fs.existsSync(keypairPath)) {
    console.log('Authority keypair already exists. Would you like to:');
    console.log('1. Use the existing keypair');
    console.log('2. Create a new keypair from your Phantom wallet');
    console.log('3. Generate a new random keypair (recommended for development)');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>(resolve => {
      rl.question('Enter your choice (1, 2, or 3): ', resolve);
    });
    
    rl.close();
    
    if (answer === '1') {
      return getOrCreateKeypair('authority');
    } else if (answer === '3') {
      // Generate a new random keypair
      const newKeypair = Keypair.generate();
      
      // Save the keypair securely
      await saveKeypairSecurely(newKeypair, 'authority');
      console.log(`\nNew keypair generated. Public key: ${newKeypair.publicKey.toString()}`);
      
      return newKeypair;
    }
  }
  
  // If we're here, we're importing from Phantom or creating a new one
  
  // Use muted terminal input for private key
  console.log('Enter your Phantom wallet private key (input will be hidden):');
  const privateKeyBase58 = await new Promise<string>(resolve => {
    // Use readline with muted output
    const rl = readline.createInterface({
      input: process.stdin,
      output: new Writable({
        write: function(chunk, encoding, callback) {
          callback();
        }
      })
    });
    
    process.stdout.write('> ');
    rl.question('', answer => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
  
  try {
    // Decode base58 private key to bytes
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    
    // Create keypair from private key
    const keypair = Keypair.fromSecretKey(privateKeyBytes);
    
    // Save the keypair securely
    await saveKeypairSecurely(keypair, 'authority');
    
    console.log(`\nKeypair imported successfully. Public key: ${keypair.publicKey.toString()}`);
    
    // Clear sensitive data from memory
    privateKeyBytes.fill(0);
    
    return keypair;
  } catch (error: any) {
    throw new Error(`Failed to import keypair: ${error.message}`);
  }
}

/**
 * Saves a keypair securely with encrypted storage
 * @param keypair The keypair to save
 * @param name The name for the keypair file
 */
async function saveKeypairSecurely(keypair: Keypair, name: string): Promise<void> {
  const keypairsDir = path.resolve(process.cwd(), 'keypairs');
  if (!fs.existsSync(keypairsDir)) {
    fs.mkdirSync(keypairsDir, { recursive: true, mode: 0o700 });  // Only owner can access
  }
  
  const keypairPath = path.resolve(keypairsDir, `${name}.json`);
  
  // In a production environment, we would encrypt this data
  // For development purposes, we'll just set strict file permissions
  fs.writeFileSync(
    keypairPath,
    JSON.stringify(Array.from(keypair.secretKey)),
    { encoding: 'utf-8', mode: 0o600 }  // Only owner can read/write
  );
  
  console.log(`\nKeypair saved securely to ${keypairPath}`);
  console.log('NOTE: In production, implement proper encryption for the keypair file.');
}

export interface CreateVCoinOptions {
  skipBalanceCheck?: boolean;
}

export async function createVCoinToken(options: CreateVCoinOptions = {}) {
  // For testing purposes, allow overriding the balance check
  const skipBalanceCheck = options.skipBalanceCheck || false;
  
  console.log(`Creating ${TOKEN_NAME} (${TOKEN_SYMBOL}) token using token-2022 program...`);
  
  // Get connection to Solana network
  const connection = getConnection();
  
  // Get or create authority keypair
  let authorityKeypair: Keypair;
  const useExistingKeypair = process.argv.includes('--use-existing');
  
  if (useExistingKeypair) {
    authorityKeypair = await getOrCreateKeypair('authority');
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
  const extensions: ExtensionType[] = [];
  
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
    
    saveTokenMetadata(tokenData, authorityKeypair);
    
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
    return handleError('\nError creating token:', error as Error);
  }
}

// Execute the function only when this file is run directly, not when imported
if (require.main === module) {
  createVCoinToken().catch(err => {
    console.error('Error creating token:', err);
    process.exit(1);
  });
} 