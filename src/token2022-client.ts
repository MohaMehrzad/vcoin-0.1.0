/**
 * VCoin Token-2022 Client
 * Author: SmarTech LLC
 * 
 * This module provides client-side interaction with the VCoin Token-2022 smart contract.
 * It optimizes for low transaction fees while maintaining high security standards.
 */

import {
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  TransactionInstruction,
  Connection
} from '@solana/web3.js';

// Import from spl-token - this package is required for client operations
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  getAccount,
  getMint,
  createTransferCheckedInstruction,
  createTransferInstruction,
  createSyncNativeInstruction,
  ExtensionType,
  getTransferFeeConfig,
  getTransferFeeAmount,
  createInitializeTransferFeeConfigInstruction,
} from '@solana/spl-token';

// We need to also reference TOKEN_2022_PROGRAM_ADDRESS from @solana-program/token-2022
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';

// For real implementations we'll use the actual package
import { findProgramAddressSync } from '@project-serum/anchor/dist/cjs/utils/pubkey';
import * as borsh from 'borsh';
import { createHash } from 'crypto';

// Interface definitions
export interface FeeConfig {
  isInitialized: boolean;
  feeAuthority: PublicKey;
  feeBasisPoints: number;
  maximumFee: bigint;
  feesDisabled: boolean;
  feeReceiver: PublicKey;
  lastUpdateTimestamp: number;
  feeUpdateCooldown: bigint;
}

export interface RateLimitConfig {
  isInitialized: boolean;
  rateLimitAuthority: PublicKey;
  maxTransactions: number;
  timePeriodSeconds: number;
  rateLimitingEnabled: boolean;
}

export interface SecurityConfig {
  isInitialized: boolean;
  securityAuthority: PublicKey;
  transfersFrozen: boolean;
  maxSupply: bigint;
  supplyFixed: boolean;
}

// Program ID constant (should be replaced with the actual program ID after deployment)
export const VCOIN_TOKEN_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

/**
 * Creates a new Token-2022 token with transfer fee enabled
 * @param {Connection} connection - Solana connection object
 * @param {Keypair} payer - Keypair that will pay for the transaction
 * @param {Keypair} mintAuthority - The authority that can mint new tokens
 * @param {Keypair} transferFeeConfigAuthority - The authority that can update transfer fees
 * @param {number} decimals - Number of decimals for the token
 * @param {number} transferFeeBasisPoints - The basis points (1/100 of 1%) to charge as a transfer fee
 * @returns {Promise<PublicKey>} The mint address
 */
export async function createToken2022WithTransferFee(
  connection: Connection,
  payer: Keypair,
  mintAuthority: Keypair,
  transferFeeConfigAuthority: Keypair,
  decimals: number,
  transferFeeBasisPoints: number,
): Promise<PublicKey> {
  try {
    // Calculate the space needed for the token mint with transfer fee extension
    // This includes the base mint size plus the transfer fee extension size
    // The standard mint size is 82 bytes, and the transfer fee extension is 41 bytes
    // However, extension packing may require additional space
    const mintSpace = 
      82 + // Base mint 
      41;  // Transfer fee extension (approximate)
    
    // Create a new keypair for the mint
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    
    // Create a transaction to create the mint
    const lamports = await connection.getMinimumBalanceForRentExemption(mintSpace);
    
    // Create the account instruction
    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: mintSpace,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });
    
    // Initialize transfer fee instruction
    const initializeTransferFeeInstruction = createInitializeTransferFeeConfigInstruction(
      mint,
      transferFeeConfigAuthority.publicKey,
      transferFeeConfigAuthority.publicKey, // withdraw authority (same as config authority for simplicity)
      transferFeeBasisPoints,
      BigInt(0), // Initial 0 maximum fee
      TOKEN_2022_PROGRAM_ID
    );
    
    // Initialize mint instruction
    const initializeMintInstruction = createInitializeMintInstruction(
      mint,
      decimals,
      mintAuthority.publicKey,
      null, // freeze authority (none for this example)
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create and sign transaction
    const transaction = new Transaction().add(
      createAccountInstruction,
      initializeTransferFeeInstruction,
      initializeMintInstruction
    );
    
    // Send and confirm the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, mintKeypair]
    );
    
    console.log('Token created successfully!');
    console.log('Mint Address:', mint.toString());
    console.log('Transaction Signature:', signature);
    
    return mint;
  } catch (error) {
    console.error('Error creating token with transfer fee:', error);
    throw error;
  }
}

/**
 * Mints tokens to a specified destination account
 * @param {Connection} connection - Solana connection object
 * @param {Keypair} payer - Keypair that will pay for the transaction
 * @param {PublicKey} mint - The mint address
 * @param {PublicKey} destination - The destination token account
 * @param {Keypair} mintAuthority - Authority that can mint tokens
 * @param {number | bigint} amount - Amount to mint (in raw units, not decimal)
 * @returns {Promise<string>} Transaction signature
 */
export async function mintTokens(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  destination: PublicKey,
  mintAuthority: Keypair,
  amount: number | bigint,
): Promise<string> {
  try {
    // Create the mint instruction
    const mintInstruction = createMintToInstruction(
      mint,
      destination,
      mintAuthority.publicKey,
      BigInt(amount),
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create and sign transaction
    const transaction = new Transaction().add(mintInstruction);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, mintAuthority]
    );
    
    console.log('Tokens minted successfully!');
    console.log('Transaction Signature:', signature);
    
    return signature;
  } catch (error) {
    console.error('Error minting tokens:', error);
    throw error;
  }
}

/**
 * Calculates the transfer fee for a given amount
 * @param {Connection} connection - Solana connection object
 * @param {PublicKey} mint - The mint address
 * @param {bigint} amount - Token amount to calculate fee for
 * @returns {Promise<bigint>} The transfer fee amount
 */
export async function calculateTransferFee(
  connection: Connection,
  mint: PublicKey,
  amount: bigint
): Promise<bigint> {
  try {
    const mintInfo = await getMint(connection, mint, undefined, TOKEN_2022_PROGRAM_ID);
    const transferFeeConfig = getTransferFeeConfig(mintInfo);
    
    if (!transferFeeConfig) {
      console.warn('No transfer fee config found on token');
      return BigInt(0);
    }
    
    const fee = getTransferFeeAmount(transferFeeConfig, amount) || BigInt(0);
    return fee;
  } catch (error) {
    console.error('Error calculating transfer fee:', error);
    throw error;
  }
}

/**
 * Gets or creates an associated token account for a wallet
 * @param {Connection} connection - Solana connection object
 * @param {Keypair} payer - The payer for account creation if needed
 * @param {PublicKey} mint - The token mint address
 * @param {PublicKey} owner - Token account owner address
 * @returns {Promise<PublicKey>} Associated token account address
 */
export async function getOrCreateAssociatedTokenAccount2022(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  try {
    // Get the associated token account address
    const associatedTokenAddress = await getAssociatedTokenAddress(
      mint,
      owner,
      true,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Check if the account exists
    try {
      await getAccount(connection, associatedTokenAddress, 'confirmed', TOKEN_2022_PROGRAM_ID);
      console.log('Associated token account already exists:', associatedTokenAddress.toString());
      return associatedTokenAddress;
    } catch (error: any) {
      // If account does not exist, create it
      if (error.name === 'TokenAccountNotFoundError' || error.message?.includes('not found')) {
        console.log('Creating associated token account...');
        
        // Create associated token account instruction
        const instruction = createAssociatedTokenAccountInstruction(
          payer.publicKey,
          associatedTokenAddress,
          owner,
          mint,
          TOKEN_2022_PROGRAM_ID
        );
        
        // Create and sign transaction
        const transaction = new Transaction().add(instruction);
        
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [payer]
        );
        
        console.log('Associated token account created!');
        console.log('Transaction Signature:', signature);
        
        return associatedTokenAddress;
      } else {
        // If it's another error, throw it
        throw error;
      }
    }
  } catch (error) {
    console.error('Error getting or creating associated token account:', error);
    throw error;
  }
}

/**
 * Transfers tokens from one account to another
 * @param {Connection} connection - Solana connection object
 * @param {Keypair} payer - The transaction payer
 * @param {PublicKey} source - Source token account
 * @param {PublicKey} destination - Destination token account
 * @param {Keypair} owner - Source token account owner
 * @param {PublicKey} mint - The token mint
 * @param {number} amount - Amount to transfer (in token units, not decimal)
 * @param {number} decimals - Number of decimals for the token
 * @returns {Promise<string>} Transaction signature
 */
export async function transferTokens(
  connection: Connection,
  payer: Keypair,
  source: PublicKey,
  destination: PublicKey,
  owner: Keypair,
  mint: PublicKey,
  amount: number,
  decimals: number
): Promise<string> {
  try {
    // Create transfer instruction with token decimals check
    const instruction = createTransferCheckedInstruction(
      source,
      mint,
      destination,
      owner.publicKey,
      BigInt(amount),
      decimals,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create and sign transaction
    const transaction = new Transaction().add(instruction);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer, owner]
    );
    
    console.log('Tokens transferred successfully!');
    console.log('Transaction Signature:', signature);
    
    return signature;
  } catch (error) {
    console.error('Error transferring tokens:', error);
    throw error;
  }
}

/**
 * Creates a new Token-2022 mint with optimized settings for low gas fees
 */
export async function createVCoinToken(
  connection: Connection,
  payer: Keypair,
  decimals: number = 9,
  mintAuthority: PublicKey = payer.publicKey,
  freezeAuthority: PublicKey | null = null,
  initialSupply: bigint | null = null,
  name: string,
  symbol: string,
  uri?: string,
): Promise<PublicKey> {
  // Generate random keypair for the mint account
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  console.log(`Creating new VCoin token mint: ${mint.toBase58()}`);

  // Calculate minimum balance for rent exemption with extensions
  const mintLen = getMintLen([
    ExtensionType.TransferFeeConfig,
    ExtensionType.MetadataPointer,
    ExtensionType.Metadata,
  ]);
  
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  // Create extensions instructions
  const instructions = [
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mint,
      mintAuthority,
      mintAuthority, // Fee withdrawal authority
      0, // Initial 0 fee
      0, // Initial 0 maximum fee
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint,
      decimals,
      mintAuthority,
      freezeAuthority,
      TOKEN_2022_PROGRAM_ID
    ),
  ];

  // Add metadata instruction
  const metadataInstruction = createMetadataInstruction(
    mint,
    mintAuthority,
    name,
    symbol,
    uri || '',
  );
  if (metadataInstruction) {
    instructions.push(metadataInstruction);
  }

  // If initial supply is provided, add instructions to mint tokens
  if (initialSupply !== null && initialSupply > BigInt(0)) {
    // Get or create the associated token account
    const associatedTokenAccount = await getAssociatedTokenAddress(
      mint,
      mintAuthority,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    // Add instructions to create the token account and mint the initial supply
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        associatedTokenAccount,
        mintAuthority,
        mint,
        TOKEN_2022_PROGRAM_ID
      ),
      createMintToInstruction(
        mint,
        associatedTokenAccount,
        mintAuthority,
        initialSupply,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  // Create and sign transaction
  const transaction = new Transaction().add(...instructions);
  await sendAndConfirmTransaction(connection, transaction, [payer, mintKeypair], {
    commitment: 'confirmed',
  });

  // Log information about the new token
  console.log(`Created VCoin token: ${mint.toBase58()}`);
  console.log(`Name: ${name}`);
  console.log(`Symbol: ${symbol}`);
  console.log(`Decimals: ${decimals}`);
  if (initialSupply !== null) {
    console.log(`Initial supply: ${initialSupply.toString()}`);
  }

  return mint;
}

/**
 * Initialize fee configuration for the token to optimize transaction costs
 */
export async function initializeFeeConfig(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  feeBasisPoints: number,
  maximumFee: bigint,
  feeReceiver: PublicKey,
  feeUpdateCooldown: bigint = BigInt(86400) // 24 hours in seconds
): Promise<void> {
  // Find fee config PDA
  const [feeConfigPDA] = findProgramAddressSync(
    [Buffer.from('fee_config'), mint.toBuffer()],
    VCOIN_TOKEN_PROGRAM_ID
  );

  // Create a transaction for our VCoin Token program
  const transaction = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: feeConfigPDA, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: VCOIN_TOKEN_PROGRAM_ID,
      data: Buffer.from(
        Uint8Array.of(
          1, // Initialize fee config instruction
          ...new Uint8Array(new Uint16Array([feeBasisPoints]).buffer),
          ...new Uint8Array(new BigUint64Array([maximumFee]).buffer),
          ...new Uint8Array(feeReceiver.toBuffer()),
          ...new Uint8Array(new BigUint64Array([feeUpdateCooldown]).buffer)
        )
      ),
    })
  );

  // Also update the transfer fee config in the Token-2022 program
  transaction.add(
    createUpdateTransferFeeInstruction(
      mint,
      payer.publicKey,
      feeBasisPoints,
      maximumFee
    )
  );

  // Send and confirm the transaction
  await sendAndConfirmTransaction(connection, transaction, [payer], {
    commitment: 'confirmed',
  });

  console.log(`Fee configuration initialized for token ${mint.toBase58()}`);
  console.log(`Fee basis points: ${feeBasisPoints} (${feeBasisPoints / 100}%)`);
  console.log(`Maximum fee: ${maximumFee.toString()}`);
  console.log(`Fee receiver: ${feeReceiver.toBase58()}`);
}

/**
 * Creates an optimized transaction for transferring tokens
 * This reduces gas costs by batching operations and using TransferChecked
 */
export async function createOptimizedTransfer(
  connection: Connection,
  sender: Keypair,
  destination: PublicKey,
  mint: PublicKey,
  amount: bigint
): Promise<Transaction> {
  // Find the associated token accounts for sender and recipient
  const senderTokenAccount = await getAssociatedTokenAddress(
    mint,
    sender.publicKey,
    true,
    TOKEN_2022_PROGRAM_ID
  );

  const destinationTokenAccount = await getAssociatedTokenAddress(
    mint,
    destination,
    true,
    TOKEN_2022_PROGRAM_ID
  );

  // Create a new transaction
  const transaction = new Transaction();

  // Get token account details
  try {
    await getAccount(connection, destinationTokenAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
  } catch (error) {
    // If destination token account doesn't exist, create it
    transaction.add(
      createAssociatedTokenAccountInstruction(
        sender.publicKey,
        destinationTokenAccount,
        destination,
        mint,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  // Get token mint to determine decimals for checked transfer
  const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);

  // Add transfer instruction
  transaction.add(
    createTransferCheckedInstruction(
      senderTokenAccount,
      mint,
      destinationTokenAccount,
      sender.publicKey,
      amount,
      mintInfo.decimals,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  return transaction;
}

/**
 * Update the fee settings for the token
 */
export async function updateFeeSettings(
  connection: Connection,
  feeAuthority: Keypair,
  mint: PublicKey,
  feeBasisPoints: number,
  maximumFee: bigint,
  feeReceiver?: PublicKey
): Promise<void> {
  // Find fee config PDA
  const [feeConfigPDA] = findProgramAddressSync(
    [Buffer.from('fee_config'), mint.toBuffer()],
    VCOIN_TOKEN_PROGRAM_ID
  );

  // Create our transaction for the VCoin Token program
  const transaction = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: feeAuthority.publicKey, isSigner: true, isWritable: false },
        { pubkey: feeConfigPDA, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
      ],
      programId: VCOIN_TOKEN_PROGRAM_ID,
      data: Buffer.from(
        Uint8Array.of(
          2, // Update fee settings instruction
          ...new Uint8Array(new Uint16Array([feeBasisPoints]).buffer),
          ...new Uint8Array(new BigUint64Array([maximumFee]).buffer),
          feeReceiver ? 1 : 0, // Flag for whether fee receiver is provided
          ...(feeReceiver ? new Uint8Array(feeReceiver.toBuffer()) : [])
        )
      ),
    })
  );

  // Also update the transfer fee config in the Token-2022 program
  transaction.add(
    createUpdateTransferFeeInstruction(
      mint,
      feeAuthority.publicKey,
      feeBasisPoints,
      maximumFee
    )
  );

  // Send and confirm the transaction
  await sendAndConfirmTransaction(connection, transaction, [feeAuthority], {
    commitment: 'confirmed',
  });

  console.log(`Fee settings updated for token ${mint.toBase58()}`);
  console.log(`New fee basis points: ${feeBasisPoints} (${feeBasisPoints / 100}%)`);
  console.log(`New maximum fee: ${maximumFee.toString()}`);
  if (feeReceiver) {
    console.log(`New fee receiver: ${feeReceiver.toBase58()}`);
  }
}

/**
 * Permanently disable fees for the token
 */
export async function permanentlyDisableFees(
  connection: Connection,
  feeAuthority: Keypair,
  mint: PublicKey
): Promise<void> {
  // Find fee config PDA
  const [feeConfigPDA] = findProgramAddressSync(
    [Buffer.from('fee_config'), mint.toBuffer()],
    VCOIN_TOKEN_PROGRAM_ID
  );

  // Create our transaction for the VCoin Token program
  const transaction = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: feeAuthority.publicKey, isSigner: true, isWritable: false },
        { pubkey: feeConfigPDA, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: VCOIN_TOKEN_PROGRAM_ID,
      data: Buffer.from(
        Uint8Array.of(4) // Permanently disable fees instruction
      ),
    })
  );

  // Also update the transfer fee config in the Token-2022 program to disable fees
  transaction.add(
    createUpdateTransferFeeInstruction(
      mint,
      feeAuthority.publicKey,
      0, // Set fee to 0
      BigInt(0) // Set maximum fee to 0
    )
  );

  // Send and confirm the transaction
  await sendAndConfirmTransaction(connection, transaction, [feeAuthority], {
    commitment: 'confirmed',
  });

  console.log(`Fees permanently disabled for token ${mint.toBase58()}`);
}

/**
 * Initialize security configuration for the token
 */
export async function initializeSecurityConfig(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  maxSupply: bigint,
  fixSupply: boolean
): Promise<void> {
  // Find security config PDA
  const [securityConfigPDA] = findProgramAddressSync(
    [Buffer.from('security_config'), mint.toBuffer()],
    VCOIN_TOKEN_PROGRAM_ID
  );

  // Create our transaction
  const transaction = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: securityConfigPDA, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: VCOIN_TOKEN_PROGRAM_ID,
      data: Buffer.from(
        Uint8Array.of(
          7, // Initialize security config instruction
          ...new Uint8Array(new BigUint64Array([maxSupply]).buffer),
          fixSupply ? 1 : 0
        )
      ),
    })
  );

  // Send and confirm the transaction
  await sendAndConfirmTransaction(connection, transaction, [payer], {
    commitment: 'confirmed',
  });

  console.log(`Security configuration initialized for token ${mint.toBase58()}`);
  console.log(`Maximum supply: ${maxSupply.toString()}`);
  console.log(`Supply fixed: ${fixSupply}`);
}

/**
 * Activate or deactivate emergency freeze on all transfers
 */
export async function setEmergencyFreeze(
  connection: Connection,
  securityAuthority: Keypair,
  mint: PublicKey,
  freeze: boolean
): Promise<void> {
  // Find security config PDA
  const [securityConfigPDA] = findProgramAddressSync(
    [Buffer.from('security_config'), mint.toBuffer()],
    VCOIN_TOKEN_PROGRAM_ID
  );

  // Create our transaction
  const transaction = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: securityAuthority.publicKey, isSigner: true, isWritable: false },
        { pubkey: securityConfigPDA, isSigner: false, isWritable: true },
      ],
      programId: VCOIN_TOKEN_PROGRAM_ID,
      data: Buffer.from(
        Uint8Array.of(
          8, // Emergency freeze instruction
          freeze ? 1 : 0
        )
      ),
    })
  );

  // Send and confirm the transaction
  await sendAndConfirmTransaction(connection, transaction, [securityAuthority], {
    commitment: 'confirmed',
  });

  console.log(`Emergency freeze ${freeze ? 'activated' : 'deactivated'} for token ${mint.toBase58()}`);
}

// Helper functions

/**
 * Calculate the mint account size with extensions
 */
function getMintLen(extensions: ExtensionType[]): number {
  let len = 82; // Base mint size
  
  for (const extension of extensions) {
    switch(extension) {
      case ExtensionType.TransferFeeConfig:
        len += 72; // Size of TransferFeeConfig
        break;
      case ExtensionType.MetadataPointer:
        len += 54; // Size of MetadataPointer
        break;
      case ExtensionType.Metadata:
        len += 500; // Approximate size for Metadata
        break;
      default:
        break;
    }
  }
  
  return len;
}

/**
 * Create a metadata instruction for the token
 */
function createMetadataInstruction(
  mint: PublicKey,
  authority: PublicKey,
  name: string,
  symbol: string,
  uri: string
): TransactionInstruction | null {
  try {
    // Construct metadata args
    const data = Buffer.from(
      JSON.stringify({
        name: name,
        symbol: symbol,
        uri: uri,
        decimals: null, // Will be inferred from the mint
        tokenStandard: 0 // Fungible
      })
    );

    // Create the instruction
    return new TransactionInstruction({
      keys: [
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: false },
        { pubkey: authority, isSigner: false, isWritable: true }, // Payer
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: TOKEN_2022_PROGRAM_ID,
      data: Buffer.from([23, ...Array.from(data)]) // 23 is the instruction index for initializeMetadata
    });
  } catch (error) {
    console.error("Error creating metadata instruction:", error);
    return null;
  }
}

/**
 * Create an instruction to update transfer fee
 */
function createUpdateTransferFeeInstruction(
  mint: PublicKey,
  authority: PublicKey,
  feeBasisPoints: number,
  maximumFee: bigint
): TransactionInstruction {
  const data = Buffer.alloc(9);
  data[0] = 11; // Instruction index for updateTransferFeeConfig
  data.writeUInt16LE(feeBasisPoints, 1);
  data.writeBigUInt64LE(maximumFee, 3);

  return new TransactionInstruction({
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    programId: TOKEN_2022_PROGRAM_ID,
    data,
  });
} 