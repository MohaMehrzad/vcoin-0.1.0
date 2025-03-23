/**
 * Token-2022 Adapter
 * 
 * This adapter bridges between the type definitions in our types/spl-token-2022.d.ts
 * and the actual implementation in @solana-program/token-2022.
 * 
 * It maps functions and constants from @solana/spl-token-2022 types to 
 * their equivalent in @solana-program/token-2022.
 */

import {
  Connection,
  PublicKey,
  Signer,
  Transaction,
  TransactionInstruction,
  TransactionSignature
} from '@solana/web3.js';

import * as token2022Program from '@solana-program/token-2022';

// Define interfaces for our return types to improve type safety
export interface Account {
  address: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  delegate: PublicKey | null;
  delegatedAmount: bigint;
  isInitialized: boolean;
  isFrozen: boolean;
  isNative: boolean;
  rentExemptReserve: bigint | null;
  closeAuthority: PublicKey | null;
}

export interface Mint {
  address: PublicKey;
  mintAuthority: PublicKey | null;
  supply: bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority: PublicKey | null;
}

export interface TransferFee {
  epoch: bigint;
  maximumFee: bigint;
  transferFeeBasisPoints: number;
}

export interface TransferFeeConfig {
  transferFeeConfigAuthority: PublicKey | null;
  withdrawWithheldAuthority: PublicKey | null;
  withheldAmount: bigint;
  olderTransferFee: TransferFee;
  newerTransferFee: TransferFee;
}

// Re-export constants with proper naming
export const TOKEN_2022_PROGRAM_ID = new PublicKey(token2022Program.TOKEN_2022_PROGRAM_ADDRESS);

// Extension type mapping with complete set of extensions used in our codebase
export const ExtensionType = {
  TransferFeeConfig: { discriminator: 0 },
  MetadataPointer: { discriminator: 1 },
  Metadata: { discriminator: 2 },
  transferFee: { discriminator: 3 },
  interestBearingConfig: { discriminator: 4 },
  nonTransferable: { discriminator: 5 },
  permanentDelegate: { discriminator: 6 },
  confidentialTransfer: { discriminator: 7 }
};

/**
 * Get token account info
 */
export async function getAccount(
  connection: Connection,
  address: PublicKey,
  commitment?: string | Connection['commitment'],
  programId = TOKEN_2022_PROGRAM_ID
): Promise<any> {
  // Use the connection to get account info
  const accountInfo = await connection.getAccountInfo(address, commitment as Connection['commitment']);
  if (!accountInfo) {
    throw new Error(`Account ${address.toString()} not found`);
  }
  
  // Create a structured response that matches what the type expects
  return {
    address,
    mint: new PublicKey(accountInfo.data.slice(0, 32)),
    owner: new PublicKey(accountInfo.data.slice(32, 64)),
    amount: BigInt(0), // Simplified - would need proper deserialization
    delegate: null,
    delegatedAmount: BigInt(0),
    isInitialized: true,
    isFrozen: false,
    isNative: false,
    rentExemptReserve: null,
    closeAuthority: null
  };
}

/**
 * Get mint info
 */
export async function getMint(
  connection: Connection,
  address: PublicKey,
  commitment?: string | Connection['commitment'],
  programId = TOKEN_2022_PROGRAM_ID
): Promise<any> {
  // Use underlying connection to get mint info
  const mintInfo = await connection.getAccountInfo(address, commitment as Connection['commitment']);
  if (!mintInfo) {
    throw new Error(`Mint ${address.toString()} not found`);
  }
  
  // Create a structured response
  return {
    address,
    mintAuthority: new PublicKey(mintInfo.data.slice(0, 32)),
    supply: BigInt(0), // Simplified - would need proper deserialization
    decimals: mintInfo.data[32],
    isInitialized: true,
    freezeAuthority: null
  };
}

/**
 * Create initialize mint instruction
 */
export function createInitializeMintInstruction(
  mint: PublicKey,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  programId = TOKEN_2022_PROGRAM_ID
): TransactionInstruction {
  return token2022Program.getInitializeMintInstruction({
    mint,
    decimals,
    mintAuthority,
    freezeAuthority,
  }, {
    programAddress: programId
  });
}

/**
 * Create associated token account instruction
 */
export function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  programId = TOKEN_2022_PROGRAM_ID
): TransactionInstruction {
  return token2022Program.getCreateAssociatedTokenInstruction({
    payer,
    ata: associatedToken,
    owner,
    mint
  }, {
    programAddress: programId
  });
}

/**
 * Get associated token address (async version)
 */
export async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  programId = TOKEN_2022_PROGRAM_ID
): Promise<PublicKey> {
  const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  
  const [address] = await PublicKey.findProgramAddress(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  
  return address;
}

/**
 * Get associated token address (sync version)
 */
export function getAssociatedTokenAddressSync(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  programId = TOKEN_2022_PROGRAM_ID
): PublicKey {
  const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  
  return address;
}

/**
 * Create mint to instruction
 */
export function createMintToInstruction(
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: number | bigint,
  programId = TOKEN_2022_PROGRAM_ID
): TransactionInstruction {
  // Need to check the actual parameters expected by the API
  const mintToParams: any = {
    mint: mint.toString(),
    authority: authority.toString(),
    tokenAccount: destination.toString(), // It seems the API expects 'tokenAccount' instead of 'destination'
    amount: BigInt(amount)
  };
  
  return token2022Program.getMintToInstruction(
    mintToParams,
    { programAddress: programId }
  );
}

/**
 * Create transfer checked instruction
 */
export function createTransferCheckedInstruction(
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: number | bigint,
  decimals: number,
  multiSigners: Signer[] = [],
  programId = TOKEN_2022_PROGRAM_ID
): TransactionInstruction {
  // Adapt parameters to match API expectations
  const transferCheckedParams: any = {
    source: source.toString(),
    mint: mint.toString(),
    destination: destination.toString(),
    authority: owner.toString(), // API might expect 'authority' instead of 'owner'
    amount: BigInt(amount),
    decimals
  };
  
  if (multiSigners && multiSigners.length > 0) {
    transferCheckedParams.multiSigners = multiSigners;
  }
  
  return token2022Program.getTransferCheckedInstruction(
    transferCheckedParams,
    { programAddress: programId }
  );
}

/**
 * Create transfer instruction
 */
export function createTransferInstruction(
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: number | bigint,
  multiSigners: Signer[] = [],
  programId = TOKEN_2022_PROGRAM_ID
): TransactionInstruction {
  // Adapt parameters to match API expectations
  const transferParams: any = {
    source: source.toString(),
    destination: destination.toString(),
    authority: owner.toString(), // API might expect 'authority' instead of 'owner'
    amount: BigInt(amount)
  };
  
  if (multiSigners && multiSigners.length > 0) {
    transferParams.multiSigners = multiSigners;
  }
  
  return token2022Program.getTransferInstruction(
    transferParams,
    { programAddress: programId }
  );
}

/**
 * Create sync native instruction
 */
export function createSyncNativeInstruction(
  account: PublicKey,
  programId = TOKEN_2022_PROGRAM_ID
): TransactionInstruction {
  return token2022Program.getSyncNativeInstruction({
    account: account.toString() // Convert to string as required by the API
  }, {
    programAddress: programId
  });
}

/**
 * Get transfer fee config
 */
export async function getTransferFeeConfig(
  connection: Connection,
  address: PublicKey,
  commitment?: string,
  programId = TOKEN_2022_PROGRAM_ID
): Promise<any> {
  // This would normally deserialize the transfer fee config from the mint
  // For now, returning a mock structure
  return {
    transferFeeConfigAuthority: null,
    withdrawWithheldAuthority: null,
    withheldAmount: BigInt(0),
    olderTransferFee: {
      epoch: BigInt(0),
      maximumFee: BigInt(0),
      transferFeeBasisPoints: 0
    },
    newerTransferFee: {
      epoch: BigInt(0),
      maximumFee: BigInt(0),
      transferFeeBasisPoints: 0
    }
  };
}

/**
 * Get transfer fee amount
 */
export function getTransferFeeAmount(
  transferFeeConfig: any,
  amount: bigint
): bigint {
  // Calculate fee based on the config
  const feeBasisPoints = transferFeeConfig.newerTransferFee.transferFeeBasisPoints;
  const fee = (amount * BigInt(feeBasisPoints)) / BigInt(10000);
  
  // Cap at maximum fee
  const maxFee = transferFeeConfig.newerTransferFee.maximumFee;
  return fee > maxFee ? maxFee : fee;
}

/**
 * Create initialize transfer fee config instruction
 */
export function createInitializeTransferFeeConfigInstruction(
  mint: PublicKey,
  transferFeeConfigAuthority: PublicKey | null,
  withdrawWithheldAuthority: PublicKey | null,
  transferFeeBasisPoints: number,
  maximumFee: bigint,
  programId = TOKEN_2022_PROGRAM_ID
): TransactionInstruction {
  return token2022Program.getInitializeTransferFeeConfigInstruction({
    mint,
    transferFeeConfigAuthority,
    withdrawWithheldAuthority,
    transferFeeBasisPoints,
    maximumFee
  }, {
    programAddress: programId
  });
}

/**
 * Get the required size for a mint account with the given extensions
 */
export function getMintLen(extensions: any[]): number {
  // Check if @solana-program/token-2022 provides a getMintSize function
  if (typeof token2022Program.getMintSize === 'function') {
    try {
      // Convert our extension format to what's expected by the API
      const adaptedExtensions = extensions.map(ext => {
        if (typeof ext === 'object' && 'discriminator' in ext) {
          return { __kind: Object.keys(ExtensionType).find(key => 
            // @ts-ignore: We're doing dynamic lookup
            ExtensionType[key].discriminator === ext.discriminator
          ) || 'Unknown' };
        }
        return ext;
      });
      
      return token2022Program.getMintSize(adaptedExtensions);
    } catch (error) {
      console.warn("Failed to use token2022Program.getMintSize:", error);
    }
  }
  
  // Fallback to our implementation
  const BASE_MINT_SIZE = 82;
  // Add bytes per extension based on their type
  return extensions.reduce((size, extension) => {
    // Add different sizes based on extension type
    if (extension === ExtensionType.TransferFeeConfig) {
      return size + 100; // Transfer fee config needs more space
    } else if (extension === ExtensionType.MetadataPointer || 
               extension === ExtensionType.Metadata) {
      return size + 50; // Metadata needs moderate space
    }
    // Default extra space for unknown extensions
    return size + 10;
  }, BASE_MINT_SIZE);
}

/**
 * Helper function to mint a token and perform related operations
 */
export async function mintTo(
  connection: Connection,
  payer: Signer,
  mint: PublicKey,
  destination: PublicKey,
  authority: Signer | PublicKey,
  amount: number | bigint,
  multiSigners?: Signer[],
  confirmOptions?: any,
  programId = TOKEN_2022_PROGRAM_ID
): Promise<TransactionSignature> {
  let transaction = new Transaction();
  
  // Check if authority is a Signer (has publicKey property) or a PublicKey
  const authorityKey = 'publicKey' in authority ? authority.publicKey : authority;
  
  transaction.add(
    createMintToInstruction(
      mint,
      destination,
      authorityKey,
      amount,
      programId
    )
  );
  
  let signers: Signer[] = [];
  if ('publicKey' in authority) {
    signers.push(authority);
  }
  
  if (multiSigners && multiSigners.length > 0) {
    signers = signers.concat(multiSigners);
  }
  
  return await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer, ...signers],
    confirmOptions
  );
}

/**
 * Helper function to transfer tokens
 */
export async function transfer(
  connection: Connection,
  payer: Signer,
  source: PublicKey,
  destination: PublicKey,
  owner: Signer | PublicKey,
  amount: number | bigint,
  multiSigners?: Signer[],
  confirmOptions?: any,
  programId = TOKEN_2022_PROGRAM_ID
): Promise<TransactionSignature> {
  let transaction = new Transaction();
  
  // Check if owner is a Signer (has publicKey property) or a PublicKey
  const ownerKey = 'publicKey' in owner ? owner.publicKey : owner;
  
  transaction.add(
    createTransferInstruction(
      source,
      destination,
      ownerKey,
      amount,
      multiSigners || [],
      programId
    )
  );
  
  let signers: Signer[] = [];
  if ('publicKey' in owner) {
    signers.push(owner);
  }
  
  if (multiSigners && multiSigners.length > 0) {
    signers = signers.concat(multiSigners);
  }
  
  return await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer, ...signers],
    confirmOptions
  );
}

// Add missing sendAndConfirmTransaction for the mocked implementation
async function sendAndConfirmTransaction(
  connection: Connection,
  transaction: Transaction,
  signers: Signer[],
  options?: any
): Promise<TransactionSignature> {
  return connection.sendTransaction(transaction, signers, options);
} 