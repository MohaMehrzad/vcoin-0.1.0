/**
 * VCoin Token-2022 Integration Tests
 * 
 * These tests verify that the Token-2022 implementation works correctly
 * with the Solana blockchain, testing the key functionality.
 */

import {
  Account,
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getMint,
  mintTo,
  transfer,
  mintToChecked,
  TOKEN_2022_PROGRAM_ID,
  getTransferFeeConfig
} from '@solana/spl-token';
import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram
} from '@solana/web3.js';

import {
  createToken2022,
  mintTokens,
  transferTokens
} from '../../src/examples/vcoin-token2022-example';

import * as fs from 'fs';
import * as path from 'path';

// Utilities for test
const getTestKeypair = (name: string): Keypair => {
  const keypairsDir = path.join(process.cwd(), 'keypairs', 'test');
  if (!fs.existsSync(keypairsDir)) {
    fs.mkdirSync(keypairsDir, { recursive: true });
  }
  
  const keypairPath = path.join(keypairsDir, `${name}.json`);
  
  if (fs.existsSync(keypairPath)) {
    const fileContent = fs.readFileSync(keypairPath, 'utf-8');
    const secretKey = Uint8Array.from(JSON.parse(fileContent));
    return Keypair.fromSecretKey(secretKey);
  } else {
    const keypair = Keypair.generate();
    fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));
    return keypair;
  }
};

// Test configuration
const TEST_TOKEN_NAME = 'VCoin Test';
const TEST_TOKEN_SYMBOL = 'VCNT';
const TEST_TOKEN_DECIMALS = 9;
const TEST_FEE_BASIS_POINTS = 25; // 0.25%
const TEST_MAX_FEE = BigInt(1000000000); // 1 token with 9 decimals
const TEST_MINT_AMOUNT = BigInt(1000000000000); // 1000 tokens
const TEST_TRANSFER_AMOUNT = BigInt(100000000000); // 100 tokens

// Setup and teardown functions
let connection: Connection;
let payer: Keypair;
let mintAuthority: Keypair;
let user1: Keypair;
let user2: Keypair;
let mint: PublicKey;

describe('Token-2022 Integration Tests', () => {
  // This is a long-running test suite that interacts with the Solana blockchain
  // Use jest.setTimeout in a beforeAll function to avoid TypeScript error
  beforeAll(async () => {
    // Set timeout for the entire test suite
    jest.setTimeout(120000); // 2 minutes timeout
    
    // Initialize connection (default to localhost if available, otherwise devnet)
    const endpoint = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
    connection = new Connection(endpoint, 'confirmed');
    
    // Get test keypairs
    payer = getTestKeypair('payer');
    mintAuthority = getTestKeypair('mint_auth');
    user1 = getTestKeypair('user1');
    user2 = getTestKeypair('user2');
    
    console.log(`Test using endpoint: ${endpoint}`);
    console.log(`Payer: ${payer.publicKey.toBase58()}`);
    
    // Request airdrop for payer if needed
    const payerBalance = await connection.getBalance(payer.publicKey);
    if (payerBalance < LAMPORTS_PER_SOL) {
      try {
        const signature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(signature);
        console.log(`Airdrop successful. New balance: ${await connection.getBalance(payer.publicKey) / LAMPORTS_PER_SOL} SOL`);
      } catch (e) {
        console.warn('Failed to request airdrop. Tests may fail if balance is too low.', e);
      }
    }
  });
  
  test('Should create a Token-2022 token with transfer fee', async () => {
    // Create a new token
    mint = await createToken2022(
      connection,
      payer,
      mintAuthority.publicKey,
      TEST_TOKEN_DECIMALS,
      true, // Enable transfer fee
      TEST_FEE_BASIS_POINTS,
      TEST_MAX_FEE,
      TEST_TOKEN_NAME,
      TEST_TOKEN_SYMBOL
    );
    
    expect(mint).toBeDefined();
    
    // Verify the mint account exists
    const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    expect(mintInfo).toBeDefined();
    expect(mintInfo.decimals).toBe(TEST_TOKEN_DECIMALS);
    expect(mintInfo.mintAuthority?.toBase58()).toBe(mintAuthority.publicKey.toBase58());
    
    // Verify the transfer fee configuration
    // Fix getTransferFeeConfig call - it returns the config directly, not a Promise
    const transferFeeConfig = getTransferFeeConfig(mintInfo);
    expect(transferFeeConfig).toBeDefined();
    
    if (transferFeeConfig) {
      expect(transferFeeConfig.newerTransferFee.transferFeeBasisPoints).toBe(TEST_FEE_BASIS_POINTS);
      expect(transferFeeConfig.newerTransferFee.maximumFee).toBe(TEST_MAX_FEE);
    }
  });
  
  test('Should mint tokens to user account', async () => {
    // Mint tokens to user1
    const signature = await mintTokens(
      connection,
      payer,
      mintAuthority,
      mint,
      user1.publicKey,
      TEST_MINT_AMOUNT
    );
    
    expect(signature).toBeDefined();
    
    // Verify the user1's token account has the correct balance
    const tokenAccountAddress = await getAssociatedTokenAddress(
      mint,
      user1.publicKey
    );
    
    const tokenAccount = await getAccount(connection, tokenAccountAddress, 'confirmed', TOKEN_2022_PROGRAM_ID);
    expect(tokenAccount).toBeDefined();
    expect(tokenAccount.amount).toBe(TEST_MINT_AMOUNT);
  });
  
  test('Should transfer tokens with correct fee calculation', async () => {
    // Transfer tokens from user1 to user2
    const { signature, transferFee } = await transferTokens(
      connection,
      payer,
      user1,
      mint,
      user2.publicKey,
      TEST_TRANSFER_AMOUNT
    );
    
    expect(signature).toBeDefined();
    expect(transferFee).toBeDefined();
    
    // Calculate expected fee
    const expectedFee = (TEST_TRANSFER_AMOUNT * BigInt(TEST_FEE_BASIS_POINTS)) / BigInt(10000);
    const cappedFee = expectedFee > TEST_MAX_FEE ? TEST_MAX_FEE : expectedFee;
    
    expect(transferFee).toBe(cappedFee);
    
    // Verify user1's balance was reduced by transfer amount
    const user1TokenAccountAddress = await getAssociatedTokenAddress(
      mint,
      user1.publicKey
    );
    
    const user1TokenAccount = await getAccount(
      connection, 
      user1TokenAccountAddress, 
      'confirmed', 
      TOKEN_2022_PROGRAM_ID
    );
    
    const expectedUser1Balance = TEST_MINT_AMOUNT - TEST_TRANSFER_AMOUNT;
    expect(user1TokenAccount.amount).toBe(expectedUser1Balance);
    
    // Verify user2's balance was increased by transfer amount minus fee
    const user2TokenAccountAddress = await getAssociatedTokenAddress(
      mint,
      user2.publicKey
    );
    
    const user2TokenAccount = await getAccount(
      connection, 
      user2TokenAccountAddress, 
      'confirmed', 
      TOKEN_2022_PROGRAM_ID
    );
    
    const expectedUser2Balance = TEST_TRANSFER_AMOUNT - transferFee;
    expect(user2TokenAccount.amount).toBe(expectedUser2Balance);
  });
});

// Helper functions
async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  return await import('@solana/spl-token').then(token => 
    token.getAssociatedTokenAddress(
      mint,
      owner,
      true, // Allow owner off curve
      TOKEN_2022_PROGRAM_ID
    )
  );
} 