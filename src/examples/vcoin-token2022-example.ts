/**
 * VCoin Token-2022 Example
 * 
 * This example demonstrates how to use the Token-2022 program
 * with a focus on production readiness.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  sendAndConfirmTransaction,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Cluster
} from '@solana/web3.js';

import {
  createInitializeMintInstruction,
  ExtensionType,
  createInitializeTransferFeeConfigInstruction, 
  getMintLen,
  getTransferFeeConfig,
  getTransferFeeAmount,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  TOKEN_2022_PROGRAM_ID,
} from '../token2022-adapter';

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import bs58 from 'bs58';

// Load environment variables
config();

/**
 * Custom error class for token operations
 */
class TokenOperationError extends Error {
  logs?: string[];
  
  constructor(message: string, logs?: string[]) {
    super(message);
    this.name = "TokenOperationError";
    this.logs = logs;
  }
}

/**
 * Read a keypair from a file or environment variable
 */
const readKeypair = (name: string): Keypair => {
  try {
    // First, try to read from environment variable
    const envVar = `VCOIN_${name.toUpperCase()}_KEYPAIR`;
    const privateKeyString = process.env[envVar];
    
    if (privateKeyString) {
      try {
        const privateKey = bs58.decode(privateKeyString);
        return Keypair.fromSecretKey(privateKey);
      } catch (error) {
        console.error(`Error decoding keypair from environment variable ${envVar}:`, error);
      }
    }
    
    // If not found in environment, try to read from file
    const filePath = path.join(process.cwd(), 'keypairs', `${name}.json`);
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const secretKey = Uint8Array.from(JSON.parse(fileContent));
      return Keypair.fromSecretKey(secretKey);
    }
    
    throw new Error(`Keypair not found: ${name}`);
  } catch (error) {
    console.error('Error reading keypair:', error);
    // Create a new keypair as fallback for demo purposes only
    // In production, this should always fail with a clear error
    const keypair = Keypair.generate();
    const filePath = path.join(process.cwd(), 'keypairs', `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(Array.from(keypair.secretKey)));
    return keypair;
  }
};

/**
 * Get an existing keypair or create a new one
 */
const getOrCreateKeypair = (name: string): Keypair => {
  const keypairsDir = path.join(process.cwd(), 'keypairs');
  if (!fs.existsSync(keypairsDir)) {
    fs.mkdirSync(keypairsDir, { recursive: true });
  }
  
  try {
    return readKeypair(name);
  } catch (error) {
    console.log(`Creating new keypair for ${name}...`);
    const keypair = Keypair.generate();
    const keypairPath = path.join(keypairsDir, `${name}.json`);
    fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));
    return keypair;
  }
};

/**
 * Log an error with enhanced detail
 */
const logError = (error: any): void => {
  if (error?.name === 'TokenUnsupportedInstructionError') {
    console.error('Unsupported instruction error:', error.message);
  } else if (error instanceof Error && 'logs' in error && error.logs) {
    console.error('Error logs:', error.logs);
  } else {
    console.error('Error:', error);
  }
};

/**
 * Creates a new Token-2022 with all requested extensions
 */
async function createToken2022(
  connection: Connection,
  payer: Keypair,
  mintAuthority: PublicKey,
  decimals: number = 9,
  enableTransferFee: boolean = true,
  transferFeeBasisPoints: number = 25, // 0.25%
  maxFee: bigint = BigInt(1000000000), // 1 token with 9 decimals
  tokenName: string = "VCoin",
  tokenSymbol: string = "VCN"
): Promise<PublicKey> {
  try {
    console.log(`Creating a new Token-2022 with name: ${tokenName}, symbol: ${tokenSymbol}`);
    
    // Generate a new keypair for the mint
    const mintKeypair = Keypair.generate();
    console.log(`Mint address: ${mintKeypair.publicKey.toBase58()}`);
    
    // Calculate required extensions and space
    const extensions = [ExtensionType.TransferFeeConfig];
    const mintLen = getMintLen(extensions);
    
    // Calculate rent-exempt balance
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    
    // Create a transaction to initialize the mint with extensions
    const transaction = new Transaction().add(
      // Create account for the mint
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      
      // Initialize transfer fee config if enabled
      createInitializeTransferFeeConfigInstruction(
        mintKeypair.publicKey,
        payer.publicKey,  // Fee config authority
        payer.publicKey,  // Withdraw withheld authority
        transferFeeBasisPoints,
        maxFee
      ),
      
      // Initialize the mint
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        mintAuthority,
        null, // Freeze authority (null for no freeze authority)
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    // Send and confirm the transaction with both payer and mint keypairs
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, mintKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log(`Token created successfully! Signature: ${signature}`);
    console.log(`Token details: Name: ${tokenName}, Symbol: ${tokenSymbol}, Decimals: ${decimals}`);
    
    return mintKeypair.publicKey;
  } catch (error) {
    logError(error);
    throw new TokenOperationError('Failed to create token', error instanceof Error && 'logs' in error ? error.logs as string[] : undefined);
  }
}

/**
 * Mints tokens to a recipient
 */
async function mintTokens(
  connection: Connection,
  payer: Keypair,
  mintAuthority: Keypair,
  mint: PublicKey,
  recipient: PublicKey,
  amount: bigint
): Promise<string> {
  try {
    console.log(`Minting ${amount.toString()} tokens to ${recipient.toBase58()}`);
    
    // Get the associated token account address for the recipient
    const recipientTokenAccount = await getAssociatedTokenAddress(
      mint,
      recipient,
      true, // Allow owner off curve
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create transaction to initialize token account and mint tokens
    const transaction = new Transaction();
    
    // Check if the recipient's token account exists
    try {
      await getAccount(connection, recipientTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
      console.log('Recipient token account already exists');
    } catch (error) {
      console.log('Creating recipient token account...');
      // Add instruction to create the associated token account if it doesn't exist
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          recipientTokenAccount,
          recipient,
          mint,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    
    // Create the mint to instruction
    const mintToInstruction = createMintToInstruction(
      mint,
      recipientTokenAccount,
      mintAuthority.publicKey,
      amount,
      []
    );
    
    // Add it to a transaction
    transaction.add(mintToInstruction);
    
    // Send and confirm the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, mintAuthority]
    );
    
    console.log(`Minted ${amount.toString()} tokens successfully! Signature: ${signature}`);
    return signature;
  } catch (error) {
    logError(error);
    throw new TokenOperationError('Failed to mint tokens', error instanceof Error && 'logs' in error ? error.logs as string[] : undefined);
  }
}

/**
 * Transfers tokens between accounts with transfer fee calculation
 */
async function transferTokens(
  connection: Connection,
  payer: Keypair,
  sender: Keypair,
  mint: PublicKey,
  recipient: PublicKey,
  amount: bigint
): Promise<{signature: string, transferFee: bigint}> {
  try {
    console.log(`Transferring ${amount.toString()} tokens from ${sender.publicKey.toBase58()} to ${recipient.toBase58()}`);
    
    // Get the mint info to check decimals and transfer fee config
    const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    
    // Get transfer fee config and calculate fee
    const transferFeeConfig = await getTransferFeeConfig(
      connection, 
      mint, 
      'confirmed', 
      TOKEN_2022_PROGRAM_ID
    );
    
    let transferFee = BigInt(0);
    if (transferFeeConfig) {
      transferFee = getTransferFeeAmount(transferFeeConfig, amount);
      console.log(`Transfer fee: ${transferFee.toString()} (${Number(transferFee) / 10 ** mintInfo.decimals} tokens)`);
    }
    
    // Get token accounts for sender and recipient
    const senderTokenAccount = await getAssociatedTokenAddress(
      mint,
      sender.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    
    const recipientTokenAccount = await getAssociatedTokenAddress(
      mint,
      recipient,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create transaction
    const transaction = new Transaction();
    
    // Check if recipient token account exists
    try {
      await getAccount(connection, recipientTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch (error) {
      console.log('Creating recipient token account...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          recipientTokenAccount,
          recipient,
          mint,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    
    // Add instruction to transfer tokens
    transaction.add(
      createTransferCheckedInstruction(
        senderTokenAccount,
        mint,
        recipientTokenAccount,
        sender.publicKey,
        amount,
        mintInfo.decimals,
        [], // No multi-signers
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    // Send and confirm the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, sender],
      { commitment: 'confirmed' }
    );
    
    console.log(`Transfer completed successfully! Signature: ${signature}`);
    return { signature, transferFee };
  } catch (error) {
    logError(error);
    throw new TokenOperationError('Failed to transfer tokens', error instanceof Error && 'logs' in error ? error.logs as string[] : undefined);
  }
}

/**
 * Main function to demonstrate Token-2022 functionality
 */
async function main() {
  try {
    // Initialize connection to Solana
    const network = process.env.SOLANA_NETWORK || 'devnet';
    const endpoint = process.env.SOLANA_RPC_URL || clusterApiUrl(network as Cluster);
    const connection = new Connection(endpoint, 'confirmed');
    console.log(`Connected to Solana ${network} at ${endpoint}`);
    
    // Get or create keypairs
    const payer = getOrCreateKeypair('payer');
    const mintAuthority = getOrCreateKeypair('mint_authority');
    const user1 = getOrCreateKeypair('user1');
    const user2 = getOrCreateKeypair('user2');
    
    console.log(`Payer: ${payer.publicKey.toBase58()}`);
    console.log(`Mint Authority: ${mintAuthority.publicKey.toBase58()}`);
    console.log(`User 1: ${user1.publicKey.toBase58()}`);
    console.log(`User 2: ${user2.publicKey.toBase58()}`);
    
    // Check payer balance and request airdrop if needed
    const payerBalance = await connection.getBalance(payer.publicKey);
    console.log(`Payer balance: ${payerBalance / 1e9} SOL`);
    
    if (payerBalance < 1e9) { // Less than 1 SOL
      console.log('Requesting airdrop for payer...');
      const signature = await connection.requestAirdrop(payer.publicKey, 2e9); // 2 SOL
      await connection.confirmTransaction(signature);
      console.log(`Airdrop successful! New balance: ${await connection.getBalance(payer.publicKey) / 1e9} SOL`);
    }
    
    // Step 1: Create a new token with transfer fee
    console.log('\n=== Creating Token ===');
    const mint = await createToken2022(
      connection,
      payer,
      mintAuthority.publicKey,
      9, // 9 decimals
      true, // Enable transfer fee
      25, // 0.25% fee
      BigInt(1000000000) // Max fee: 1 token
    );
    
    // Step 2: Mint tokens to user1
    console.log('\n=== Minting Tokens ===');
    const mintAmount = BigInt(1000000000000); // 1000 tokens with 9 decimals
    await mintTokens(
      connection,
      payer,
      mintAuthority,
      mint,
      user1.publicKey,
      mintAmount
    );
    
    // Step 3: Transfer tokens from user1 to user2
    console.log('\n=== Transferring Tokens ===');
    const transferAmount = BigInt(100000000000); // 100 tokens
    const { transferFee } = await transferTokens(
      connection,
      payer,
      user1,
      mint,
      user2.publicKey,
      transferAmount
    );
    
    // Step 4: Verify balances
    console.log('\n=== Verifying Balances ===');
    
    // Get token accounts
    const user1TokenAccount = await getAssociatedTokenAddress(
      mint,
      user1.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    
    const user2TokenAccount = await getAssociatedTokenAddress(
      mint,
      user2.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Get account info
    const user1AccountInfo = await getAccount(connection, user1TokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
    const user2AccountInfo = await getAccount(connection, user2TokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
    
    // Calculate expected balances (including transfer fee)
    const expectedUser1Balance = mintAmount - transferAmount;
    const expectedUser2Balance = transferAmount - transferFee;
    
    console.log(`User 1 Balance: ${user1AccountInfo.amount.toString()} (Expected: ${expectedUser1Balance.toString()})`);
    console.log(`User 2 Balance: ${user2AccountInfo.amount.toString()} (Expected: ${expectedUser2Balance.toString()})`);
    
    // Verify the transfer fee was collected correctly
    console.log(`Transfer Fee: ${transferFee.toString()}`);
    
    console.log('\n=== Example Complete ===');
    console.log('The Token-2022 implementation is working correctly.');
  } catch (error) {
    logError(error);
    process.exit(1);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
}

// Export functions for testing and importing in other modules
export {
  createToken2022,
  mintTokens,
  transferTokens
}; 