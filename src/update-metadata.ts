import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplTokenMetadata,
  createV1,
  TokenStandard
} from '@metaplex-foundation/mpl-token-metadata';
import { TokenMetadata, getOrCreateKeypair, TOKEN_NAME, TOKEN_SYMBOL } from './utils';
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
      throw new Error(`Token metadata file not found at ${filePath}`);
    }
    
    const metadataString = fs.readFileSync(filePath, 'utf-8');
    const metadata = JSON.parse(metadataString);
    
    // Basic validation
    if (!metadata || typeof metadata !== 'object') {
      throw new Error('Invalid token metadata: must be an object');
    }
    
    if (!metadata.mintAddress) throw new Error('Token metadata missing mintAddress');
    if (!metadata.authorityAddress) throw new Error('Token metadata missing authorityAddress');
    if (!metadata.totalSupply) throw new Error('Token metadata missing totalSupply');
    
    return metadata as TokenMetadata;
  } catch (error: any) {
    throw new Error(`Failed to load token metadata: ${error.message}`);
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
      console.error(`Error: Mint address mismatch.`);
      console.error(`Provided mint address: ${mintAddress}`);
      console.error(`Metadata mint address: ${tokenMetadata.mintAddress}`);
      console.error(`Ensure you're using the correct mint address and metadata file.`);
      process.exit(1);
    }

    // Set up keypair for authority
    const authorityKeypair = await getOrCreateKeypair(keypairPath);
    
    // Verify authority matches metadata
    if (tokenMetadata.authorityAddress !== authorityKeypair.publicKey.toString()) {
      console.error(`Error: Authority mismatch.`);
      console.error(`Keypair public key: ${authorityKeypair.publicKey.toString()}`);
      console.error(`Expected authority from metadata: ${tokenMetadata.authorityAddress}`);
      console.error(`Use the correct authority keypair or update the metadata file.`);
      process.exit(1);
    }

    // Setup connection and UMI
    const connection = new Connection(rpcUrl);
    const umi = createUmi(rpcUrl).use(mplTokenMetadata());
    
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
    const tx = await createV1(umi, {
      mint: publicKey(mintAddress),
      name: tokenMetadata.name ?? TOKEN_NAME,
      symbol: tokenMetadata.symbol ?? TOKEN_SYMBOL,
      uri: tokenMetadata.uri || `https://metadata.vcoin.example/${mintAddress}`,
      sellerFeeBasisPoints: percentAmount(0),
      decimals: tokenMetadata.decimals,
      tokenStandard: TokenStandard.Fungible,
    });

    await tx.sendAndConfirm(umi);
    console.log('Token metadata updated successfully!');
    
  } catch (error) {
    console.error('Error updating token metadata:');
    if (error instanceof Error) {
      console.error(`${error.message}`);
      // Provide helpful guidance based on common errors
      if (error.message.includes('Invalid public key input')) {
        console.error(`Ensure the mint address is a valid Solana public key.`);
      } else if (error.message.includes('authority')) {
        console.error(`Verify that you're using the correct authority keypair that created the token.`);
      } else if (error.message.includes('network')) {
        console.error(`Check your internet connection and the RPC URL.`);
      }
    } else {
      console.error(`${error}`);
    }
    process.exit(1);
  }
}

/**
 * Main function to update token metadata when script is run directly
 */
export function main() {
  // Check if we have the required arguments
  if (process.argv.length < 4) {
    console.error('Usage: npm run update-metadata <mint-address> <metadata-path> [rpc-url] [keypair-path]');
    console.error('Example: npm run update-metadata 7KVJjSF9ZQ7LihvQUu9N7Gqq9P5thxYkDLeaGAriLuH ./metadata.json');
    process.exit(1);
  }

  const mintAddress = process.argv[2];
  const metadataPath = process.argv[3];
  const rpcUrl = process.argv.length > 4 ? process.argv[4] : 'https://api.devnet.solana.com';
  const keypairPath = process.argv.length > 5 ? process.argv[5] : './keypair.json';

  updateTokenMetadata(mintAddress, metadataPath, rpcUrl, keypairPath);
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
} 