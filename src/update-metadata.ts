import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplTokenMetadata,
  createV1,
  TokenStandard
} from '@metaplex-foundation/mpl-token-metadata';
import { 
  TokenMetadata, 
  getOrCreateKeypair, 
  TOKEN_NAME, 
  TOKEN_SYMBOL, 
  verifyAuthority, 
  handleError,
  ValidationError,
  SecurityError,
  FileOperationError,
  TransactionError
} from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { publicKey, signerIdentity, createSignerFromKeypair, percentAmount } from '@metaplex-foundation/umi';
import bs58 from 'bs58';

/**
 * Loads token metadata from a file
 * 
 * @param filePath - Path to the metadata file
 * @returns The token metadata object
 */
function loadTokenMetadata(filePath: string): TokenMetadata {
  try {
    if (!fs.existsSync(filePath)) {
      throw new FileOperationError(`Token metadata file not found at ${filePath}`, 'FILE_NOT_FOUND');
    }
    
    const metadataString = fs.readFileSync(filePath, 'utf-8');
    let metadata;
    
    try {
      metadata = JSON.parse(metadataString);
    } catch (error: any) {
      throw new ValidationError(`Invalid JSON in metadata file: ${error.message}`, 'INVALID_JSON');
    }
    
    // Basic validation
    if (!metadata || typeof metadata !== 'object') {
      throw new ValidationError('Invalid token metadata: must be an object', 'INVALID_METADATA_FORMAT');
    }
    
    if (!metadata.mintAddress) throw new ValidationError('Token metadata missing mintAddress', 'MISSING_MINT_ADDRESS');
    if (!metadata.authorityAddress) throw new ValidationError('Token metadata missing authorityAddress', 'MISSING_AUTHORITY');
    if (!metadata.totalSupply) throw new ValidationError('Token metadata missing totalSupply', 'MISSING_TOTAL_SUPPLY');
    
    return metadata as TokenMetadata;
  } catch (error: any) {
    if (error instanceof ValidationError || error instanceof FileOperationError) {
      throw error;
    }
    throw new FileOperationError(`Failed to load token metadata: ${error.message}`, 'METADATA_LOAD_FAILED');
  }
}

/**
 * Updates the metadata for a token
 * 
 * @param mintAddress - The mint address of the token
 * @param metadataPath - Path to the metadata file
 * @param rpcUrl - RPC URL for the Solana connection
 * @param keypairPath - Path to the authority keypair file
 * @returns {Promise<void>}
 */
export async function updateTokenMetadata(
  mintAddress: string,
  metadataPath: string, 
  rpcUrl: string = 'https://api.devnet.solana.com',
  keypairPath: string = './keypair.json'
): Promise<void> {
  try {
    // Load token metadata from file
    const tokenMetadata = loadTokenMetadata(metadataPath);
    
    // Verify mint address matches metadata
    if (tokenMetadata.mintAddress !== mintAddress) {
      throw new ValidationError(
        `Mint address mismatch. Provided: ${mintAddress}, Metadata: ${tokenMetadata.mintAddress}`,
        'MINT_ADDRESS_MISMATCH'
      );
    }

    // Set up keypair for authority
    let authorityKeypair: Keypair;
    try {
      authorityKeypair = await getOrCreateKeypair(keypairPath);
    } catch (error: any) {
      throw new SecurityError(`Failed to load authority keypair: ${error.message}`, 'KEYPAIR_LOAD_FAILED');
    }
    
    // Verify authority matches metadata using standardized function
    try {
      verifyAuthority(authorityKeypair.publicKey, new PublicKey(tokenMetadata.authorityAddress), 'update metadata');
    } catch (error: any) {
      throw new SecurityError(`Authority verification failed: ${error.message}`, 'UNAUTHORIZED');
    }

    // Setup connection and UMI
    let connection: Connection;
    let umi;
    try {
      connection = new Connection(rpcUrl);
      umi = createUmi(rpcUrl).use(mplTokenMetadata());
    } catch (error: any) {
      throw new TransactionError(`Failed to establish connection: ${error.message}`, 'CONNECTION_FAILED');
    }
    
    // Convert Solana keypair to UMI signer
    const umiKeypair = {
      publicKey: publicKey(authorityKeypair.publicKey.toBase58()),
      secretKey: bs58.decode(bs58.encode(authorityKeypair.secretKey)),
    };
    const signer = createSignerFromKeypair(umi, umiKeypair);
    umi.use(signerIdentity(signer));

    console.log(`Updating metadata for token ${tokenMetadata.name} (${tokenMetadata.symbol})`);
    console.log(`Mint address: ${mintAddress}`);
    
    // Create metadata on-chain
    let tx;
    try {
      tx = await createV1(umi, {
        mint: publicKey(mintAddress),
        name: tokenMetadata.name ?? TOKEN_NAME,
        symbol: tokenMetadata.symbol ?? TOKEN_SYMBOL,
        uri: tokenMetadata.uri || `https://metadata.vcoin.example/${mintAddress}`,
        sellerFeeBasisPoints: percentAmount(0),
        decimals: tokenMetadata.decimals,
        tokenStandard: TokenStandard.Fungible,
      });
    } catch (error: any) {
      throw new TransactionError(`Failed to create metadata transaction: ${error.message}`, 'TX_CREATION_FAILED');
    }

    try {
      await tx.sendAndConfirm(umi);
      console.log('Token metadata updated successfully!');
    } catch (error: any) {
      throw new TransactionError(`Failed to send transaction: ${error.message}`, 'TX_SEND_FAILED');
    }
    
  } catch (error: any) {
    handleError(error, false, 'update-metadata');
    process.exit(1);
  }
}

/**
 * Main function to update token metadata when script is run directly
 */
export function main() {
  try {
    // Check if we have the required arguments
    if (process.argv.length < 4) {
      throw new ValidationError(
        'Insufficient arguments. Usage: npm run update-metadata <mint-address> <metadata-path> [rpc-url] [keypair-path]',
        'MISSING_ARGUMENTS'
      );
    }

    const mintAddress = process.argv[2];
    const metadataPath = process.argv[3];
    const rpcUrl = process.argv.length > 4 ? process.argv[4] : 'https://api.devnet.solana.com';
    const keypairPath = process.argv.length > 5 ? process.argv[5] : './keypair.json';

    updateTokenMetadata(mintAddress, metadataPath, rpcUrl, keypairPath);
  } catch (error: any) {
    handleError(error, true, 'update-metadata:main');
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
} 