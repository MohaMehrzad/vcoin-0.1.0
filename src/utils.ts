import * as web3 from '@solana/web3.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { createInterface } from 'readline';
import bs58 from 'bs58';
import * as naclModule from 'tweetnacl';
import * as lockfile from 'proper-lockfile';
import * as fsExtra from 'fs-extra';

// Load environment variables
dotenv.config();

/**
 * Solana network configuration settings
 * @constant {string} SOLANA_NETWORK - The Solana network to use (mainnet, testnet, devnet)
 * @constant {string} SOLANA_RPC_URL - The RPC URL for connecting to the Solana network
 */
export const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Validate network config
if (!['mainnet', 'testnet', 'devnet'].includes(SOLANA_NETWORK)) {
  throw new Error(`Invalid Solana network: ${SOLANA_NETWORK}. Must be one of: mainnet, testnet, devnet`);
}

if (!SOLANA_RPC_URL.startsWith('http')) {
  throw new Error(`Invalid Solana RPC URL: ${SOLANA_RPC_URL}. Must be a valid URL.`);
}

/**
 * Token configuration settings
 * @constant {string} TOKEN_NAME - The name of the token
 * @constant {string} TOKEN_SYMBOL - The symbol of the token
 * @constant {number} TOKEN_DECIMALS - The decimal places for the token
 * @constant {bigint} TOKEN_TOTAL_SUPPLY - The total supply of the token
 */
export const TOKEN_NAME = process.env.TOKEN_NAME || 'VCoin';
export const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || 'VCN';
export const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '6');
export const TOKEN_TOTAL_SUPPLY = BigInt(process.env.TOKEN_TOTAL_SUPPLY || '1000000000');

// Validate token config
if (!TOKEN_NAME || TOKEN_NAME.length > 32) {
  throw new Error(`Invalid token name: ${TOKEN_NAME}. Must be non-empty and <= 32 characters`);
}

if (!TOKEN_SYMBOL || TOKEN_SYMBOL.length > 10) {
  throw new Error(`Invalid token symbol: ${TOKEN_SYMBOL}. Must be non-empty and <= 10 characters`);
}

if (TOKEN_DECIMALS < 0 || TOKEN_DECIMALS > 9) {
  throw new Error(`Invalid token decimals: ${TOKEN_DECIMALS}. Must be between 0 and 9`);
}

if (TOKEN_TOTAL_SUPPLY <= BigInt(0)) {
  throw new Error(`Invalid token supply: ${TOKEN_TOTAL_SUPPLY}. Must be greater than 0`);
}

/**
 * Distribution configuration settings
 * @constant {bigint} DEV_ALLOCATION - The allocation for development
 * @constant {bigint} PRESALE_ALLOCATION - The allocation for presale
 * @constant {bigint} AIRDROP_ALLOCATION - The allocation for airdrops
 * @constant {bigint} VESTING_ALLOCATION - The allocation for vesting
 */
export const DEV_ALLOCATION = BigInt(process.env.DEV_ALLOCATION || '500000000');
export const PRESALE_ALLOCATION = BigInt(process.env.PRESALE_ALLOCATION || '100000000');
export const AIRDROP_ALLOCATION = BigInt(process.env.AIRDROP_ALLOCATION || '50000000');
export const VESTING_ALLOCATION = BigInt(process.env.VESTING_ALLOCATION || '350000000');

// Validate distribution config
const totalAllocation = DEV_ALLOCATION + PRESALE_ALLOCATION + AIRDROP_ALLOCATION + VESTING_ALLOCATION;
if (totalAllocation !== TOKEN_TOTAL_SUPPLY) {
  throw new Error(`Total allocation (${totalAllocation}) does not match total supply (${TOKEN_TOTAL_SUPPLY})`);
}

/**
 * Environment-based constants
 * @constant {Date} PRESALE_START_DATE - The start date of the presale
 * @constant {Date} PRESALE_END_DATE - The end date of the presale
 * @constant {number} PRESALE_PRICE_USD - The price of the token in USD during presale
 */
export const PRESALE_START_DATE = new Date(process.env.PRESALE_START_DATE || '2025-04-01');
export const PRESALE_END_DATE = new Date(process.env.PRESALE_END_DATE || '2025-09-30');
export const PRESALE_PRICE_USD = Number(process.env.PRESALE_PRICE_USD || 0.03);

// Validate date settings
if (isNaN(PRESALE_START_DATE.getTime())) {
  throw new Error(`Invalid presale start date: ${process.env.PRESALE_START_DATE}`);
}

if (isNaN(PRESALE_END_DATE.getTime())) {
  throw new Error(`Invalid presale end date: ${process.env.PRESALE_END_DATE}`);
}

if (PRESALE_END_DATE <= PRESALE_START_DATE) {
  throw new Error('Presale end date must be after start date');
}

/**
 * Vesting configuration settings
 * @constant {bigint} VESTING_RELEASE_AMOUNT - The amount of tokens released per interval
 * @constant {number} VESTING_RELEASE_INTERVAL_MONTHS - The interval in months between releases
 */
export const VESTING_RELEASE_AMOUNT = BigInt(process.env.VESTING_RELEASE_AMOUNT || '50000000');
export const VESTING_RELEASE_INTERVAL_MONTHS = parseInt(process.env.VESTING_RELEASE_INTERVAL_MONTHS || '3');

// Validate vesting config
if (VESTING_RELEASE_AMOUNT <= BigInt(0)) {
  throw new Error(`Invalid vesting release amount: ${VESTING_RELEASE_AMOUNT}. Must be greater than 0`);
}

if (VESTING_RELEASE_INTERVAL_MONTHS <= 0) {
  throw new Error(`Invalid vesting interval: ${VESTING_RELEASE_INTERVAL_MONTHS}. Must be greater than 0`);
}

if (VESTING_ALLOCATION % VESTING_RELEASE_AMOUNT !== BigInt(0)) {
  throw new Error(`Vesting allocation (${VESTING_ALLOCATION}) must be divisible by release amount (${VESTING_RELEASE_AMOUNT})`);
}

/**
 * Converts tokens to raw amount with decimals
 * @param {bigint} tokens - The amount of tokens to convert
 * @returns {bigint} The raw amount with decimals
 * @throws {Error} If tokens is negative
 */
export function tokensToRawAmount(tokens: bigint): bigint {
  if (tokens < BigInt(0)) {
    throw new Error(`Token amount must be non-negative: ${tokens}`);
  }
  return tokens * BigInt(10 ** TOKEN_DECIMALS);
}

/**
 * Converts raw amount to tokens
 * @param {bigint} rawAmount - The raw amount with decimals
 * @returns {bigint} The amount of tokens
 * @throws {Error} If rawAmount is negative
 */
export function rawAmountToTokens(rawAmount: bigint): bigint {
  if (rawAmount < BigInt(0)) {
    throw new Error(`Raw amount must be non-negative: ${rawAmount}`);
  }
  return rawAmount / BigInt(10 ** TOKEN_DECIMALS);
}

/**
 * Creates and returns a connection to the Solana network
 * @returns {web3.Connection} A connection to the Solana network
 */
export function getConnection(): web3.Connection {
  return new web3.Connection(SOLANA_RPC_URL, 'confirmed');
}

/**
 * Validates a keypair name for security
 * @param {string} keyName - The name of the keypair
 * @throws {Error} If the keypair name is invalid or contains security violations
 */
function validateKeypairName(keyName: string): void {
  // Check for empty string since we already know it's a string type
  if (!keyName) {
    throw new Error('Keypair name must be a non-empty string');
  }
  
  // Whitelist approach with strict regex - only allows alphanumeric, hyphens, and underscores
  const validNameRegex = /^[a-zA-Z0-9\-_]+$/;
  if (!validNameRegex.test(keyName)) {
    throw new Error(`Invalid keypair name: ${keyName}. Only alphanumeric characters, hyphens, and underscores are allowed.`);
  }
  
  // Use path.normalize and verify the name doesn't try to navigate outside its directory
  const normalizedName = path.normalize(keyName);
  
  // Ensure normalized path doesn't contain any directory traversal
  if (normalizedName !== keyName || 
      normalizedName.includes('/') || 
      normalizedName.includes('\\') || 
      normalizedName.includes('..')) {
    throw new Error(`Security violation: Path traversal attempt detected in keypair name: ${keyName}`);
  }
  
  // Additional check: maximum name length
  const MAX_NAME_LENGTH = 64;
  if (keyName.length > MAX_NAME_LENGTH) {
    throw new Error(`Keypair name too long. Maximum length is ${MAX_NAME_LENGTH} characters.`);
  }
}

// Add encryption/decryption functions
/**
 * Encrypts data using AES-256-GCM
 * @param {Buffer} data - The data to encrypt
 * @param {string} password - The password to derive the encryption key from
 * @returns {string} The encrypted data as a hex string with IV and auth tag
 */
function encryptData(data: Buffer, password: string): string {
  // Create a salt for key derivation
  const salt = crypto.randomBytes(16);
  
  // Derive a key from the password
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  
  // Create initialization vector
  const iv = crypto.randomBytes(16);
  
  // Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  // Encrypt data
  const encryptedData = Buffer.concat([
    cipher.update(data),
    cipher.final()
  ]);
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Combine salt, IV, auth tag, and encrypted data
  const result = Buffer.concat([
    salt,
    iv,
    authTag,
    encryptedData
  ]);
  
  return result.toString('hex');
}

/**
 * Decrypts data using AES-256-GCM
 * @param {string} encryptedHex - The encrypted data as a hex string
 * @param {string} password - The password used for encryption
 * @returns {Buffer} The decrypted data
 * @throws {Error} If decryption fails
 */
function decryptData(encryptedHex: string, password: string): Buffer {
  try {
    // Convert hex to buffer
    const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
    
    // Extract salt, IV, auth tag, and encrypted data
    const salt = encryptedBuffer.slice(0, 16);
    const iv = encryptedBuffer.slice(16, 32);
    const authTag = encryptedBuffer.slice(32, 48);
    const encryptedData = encryptedBuffer.slice(48);
    
    // Derive key from password
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    
    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt data
    return Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
  } catch (error: any) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Prompts the user for a password with hidden input
 * @param {string} prompt - The prompt message
 * @returns {Promise<string>} The entered password
 */
async function getPassword(prompt: string): Promise<string> {
  // Use Node.js readline for password input
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Implement hidden input for password
  console.log(prompt);
  process.stdout.write('> ');
  
  // Use a custom stream to suppress output
  (rl as any).output = Object.create(process.stdout);
  (rl as any).output.write = function(_: string): boolean {
    return true;
  };
  
  try {
    const password = await new Promise<string>((resolve) => {
      rl.question('', (answer) => {
        resolve(answer);
      });
    });
    
    process.stdout.write('\n');
    return password;
  } finally {
    rl.close();
  }
}

/**
 * Gets an existing keypair or creates a new one if it doesn't exist
 * @param {string} keyName - The name of the keypair
 * @param {boolean} skipPrompt - Skip password prompt for testing/automation
 * @param {string} password - Optional password (used if skipPrompt is true)
 * @returns {web3.Keypair} The keypair
 * @throws {Error} If the keypair name is invalid or if there's an error loading/creating the keypair
 */
export async function getOrCreateKeypair(
  keyName: string, 
  skipPrompt: boolean = false,
  password?: string
): Promise<web3.Keypair> {
  try {
    // Validate the keypair name
    validateKeypairName(keyName);
    
    const KEYPAIR_PATH = path.resolve(process.cwd(), 'keypairs', `${keyName}.json`);
    let keypair: web3.Keypair;
    
    if (fs.existsSync(KEYPAIR_PATH)) {
      try {
        // Read encrypted keypair file
        const fileContent = fs.readFileSync(KEYPAIR_PATH, 'utf-8');
        const keypairData = JSON.parse(fileContent);
        
        // Check if the keypair is encrypted
        if (keypairData.encrypted) {
          // Get password from user or use provided password
          const decryptionPassword = skipPrompt 
            ? (password || process.env.KEYPAIR_PASSWORD || '') 
            : await getPassword(`Enter password to decrypt ${keyName} keypair:`);
            
          if (!decryptionPassword) {
            throw new Error('Password is required to decrypt keypair');
          }
          
          // Decrypt the keypair data
          const decryptedData = decryptData(keypairData.data, decryptionPassword);
          const secretKey = new Uint8Array(JSON.parse(decryptedData.toString()));
          
          keypair = web3.Keypair.fromSecretKey(secretKey);
        } else {
          // Handle legacy unencrypted keypairs
          console.warn('Warning: Using legacy unencrypted keypair. Consider re-encrypting it.');
          
          // Validate keypair data
          if (!Array.isArray(keypairData) || keypairData.length !== 64) {
            throw new Error(`Invalid keypair data format for ${keyName}`);
          }
          
          keypair = web3.Keypair.fromSecretKey(new Uint8Array(keypairData));
        }
      } catch (error: any) {
        throw new Error(`Failed to load keypair ${keyName}: ${error.message}`);
      }
    } else {
      // Create new keypair
      keypair = web3.Keypair.generate();
      
      try {
        // Create keypairs directory if it doesn't exist
        const keypairsDir = path.dirname(KEYPAIR_PATH);
        if (!fs.existsSync(keypairsDir)) {
          fs.mkdirSync(keypairsDir, { recursive: true, mode: 0o700 }); // Only owner can access
        }
        
        // Get password for encryption
        const encryptionPassword = skipPrompt
          ? (password || process.env.KEYPAIR_PASSWORD || (isProductionEnvironment() ? forceSecurePassword(keyName) : generateRandomPassword()))
          : await getPassword(`Create password to encrypt ${keyName} keypair:`);
          
        if (skipPrompt && !password && !process.env.KEYPAIR_PASSWORD) {
          if (isProductionEnvironment()) {
            console.log(`Secure password required for ${keyName} keypair in production environment.`);
          } else {
            console.log(`Generated random password for ${keyName} keypair encryption.`);
            console.log('WARNING: This is not secure for production use.');
          }
        }
        
        // Encrypt keypair data
        const keypairJson = JSON.stringify(Array.from(keypair.secretKey));
        const encryptedData = encryptData(Buffer.from(keypairJson), encryptionPassword);
        
        // Save encrypted keypair with secure permissions
        fs.writeFileSync(
          KEYPAIR_PATH,
          JSON.stringify({ 
            encrypted: true, 
            data: encryptedData,
            publicKey: keypair.publicKey.toString()
          }),
          { encoding: 'utf-8', mode: 0o600 } // Only owner can read/write
        );
        
        console.log(`\nKeypair ${keyName} created and encrypted.`);
        console.log(`Public key: ${keypair.publicKey.toString()}`);
      } catch (error: any) {
        throw new Error(`Failed to create keypair ${keyName}: ${error.message}`);
      }
    }
    
    return keypair;
  } catch (error: any) {
    throw new Error(`Error with keypair ${keyName}: ${error.message}`);
  }
}

/**
 * Checks if the current environment is production
 * @returns {boolean} True if the environment is production
 */
export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || 
         process.env.SOLANA_NETWORK === 'mainnet' || 
         process.env.SOLANA_NETWORK === 'mainnet-beta';
}

/**
 * Forces secure password through environment variables or interactive prompt
 * @param {string} keyName - The name of the keypair
 * @returns {string} Secure password from environment or throws an error
 * @throws {Error} If no secure password is provided in production
 */
function forceSecurePassword(keyName: string): string {
  const envVar = `KEYPAIR_PASSWORD_${keyName.toUpperCase()}`;
  const fallbackVar = 'KEYPAIR_PASSWORD';
  
  // Try to get a specific password for this key first
  const specificPassword = process.env[envVar];
  if (specificPassword && specificPassword.length >= 16) {
    return specificPassword;
  }
  
  // Try the fallback password
  const fallbackPassword = process.env[fallbackVar];
  if (fallbackPassword && fallbackPassword.length >= 16) {
    return fallbackPassword;
  }
  
  // If we reach here, no secure password was found
  throw new Error(
    `Production environment requires a secure password for ${keyName} keypair.\n` +
    `Please set ${envVar} or ${fallbackVar} environment variable with a strong password (minimum 16 characters).`
  );
}

/**
 * Generates a cryptographically secure random password with high entropy
 * @param {number} length - The length of the password (min 16)
 * @returns {string} A secure random password
 */
function generateRandomPassword(length: number = 24): string {
  // Enforce minimum length
  const actualLength = Math.max(length, 16);
  
  // Define character sets for different types of characters
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?';
  
  // Ensure we use all character types for better entropy
  let password = '';
  
  // Add at least one character from each set
  password += lowercase[crypto.randomInt(0, lowercase.length)];
  password += uppercase[crypto.randomInt(0, uppercase.length)];
  password += numbers[crypto.randomInt(0, numbers.length)];
  password += symbols[crypto.randomInt(0, symbols.length)];
  
  // Fill the rest with random characters from all sets
  const charset = lowercase + uppercase + numbers + symbols;
  
  // Generate remaining characters
  for (let i = password.length; i < actualLength; i++) {
    const randomBytes = crypto.randomBytes(4);
    const randomIndex = randomBytes.readUInt32BE(0) % charset.length;
    password += charset[randomIndex];
  }
  
  // Shuffle the password characters to avoid predictable patterns
  return shuffleString(password);
}

/**
 * Shuffles a string using Fisher-Yates algorithm
 * @param {string} str - The string to shuffle
 * @returns {string} Shuffled string
 */
function shuffleString(str: string): string {
  const array = str.split('');
  
  // Generate secure random numbers for shuffling
  for (let i = array.length - 1; i > 0; i--) {
    const randomBytes = crypto.randomBytes(4);
    const j = randomBytes.readUInt32BE(0) % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  
  return array.join('');
}

/**
 * Token metadata interface
 * @interface TokenMetadata
 */
export interface TokenMetadata {
  mintAddress: string;
  authorityAddress: string;
  authorityTokenAccount: string;
  totalSupply: string;
  decimals: number;
  name?: string;
  symbol?: string;
  programId?: string;
  network?: string;
  allocations?: {
    development: {
      amount: string;
      wallet: string;
      tokenAccount: string;
      txId: string;
    };
    presale: {
      amount: string;
      wallet: string;
      tokenAccount: string;
      txId: string;
    };
    airdrop: {
      amount: string;
      wallet: string;
      tokenAccount: string;
      txId: string;
    };
    vesting: {
      amount: string;
      wallet: string;
      tokenAccount: string;
      txId: string;
    };
  };
  metadataAddress?: string;
  metadataTx?: string;
  [key: string]: any;
}

/**
 * Validates token metadata structure
 * @param {any} data - The data to validate
 * @returns {TokenMetadata} The validated token metadata
 * @throws {Error} If the data is invalid
 */
function validateTokenMetadata(data: any): TokenMetadata {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid token metadata: must be an object');
  }
  
  // Required fields
  if (!data.mintAddress) throw new Error('Token metadata missing mintAddress');
  if (!data.authorityAddress) throw new Error('Token metadata missing authorityAddress');
  if (!data.totalSupply) throw new Error('Token metadata missing totalSupply');
  
  // Validate addresses
  try {
    new web3.PublicKey(data.mintAddress);
    new web3.PublicKey(data.authorityAddress);
  } catch (error: any) {
    throw new Error(`Invalid public key in token metadata: ${error.message}`);
  }
  
  // Validate supply
  try {
    BigInt(data.totalSupply);
  } catch (error: any) {
    throw new Error(`Invalid totalSupply in token metadata: ${error.message}`);
  }
  
  return data as TokenMetadata;
}

/**
 * Signs data with a keypair's private key
 * @param {Buffer} data - The data to sign
 * @param {web3.Keypair} keypair - The keypair to sign with
 * @returns {string} The signature as a base58 string
 */
export function signData(data: Buffer, keypair: web3.Keypair): string {
  // Create a message for signing from the data hash
  const messageHash = createHash('sha256').update(data).digest();
  
  // Sign the message hash with the keypair's private key
  const signature = naclModule.sign.detached(messageHash, keypair.secretKey);
  
  // Return the signature as a base58 string
  return bs58.encode(Buffer.from(signature));
}

/**
 * Verifies data against a signature using a public key
 * @param {Buffer} data - The data to verify
 * @param {string} signature - The signature as a base58 string
 * @param {web3.PublicKey} publicKey - The public key to verify against
 * @returns {boolean} True if the signature is valid, false otherwise
 */
export function verifySignature(data: Buffer, signature: string, publicKey: web3.PublicKey): boolean {
  try {
    // Decode the signature from base58
    const signatureBytes = bs58.decode(signature);
    
    // Get the message hash
    const messageHash = createHash('sha256').update(data).digest();
    
    // Convert public key to the format needed for verification
    const publicKeyBytes = publicKey.toBytes();
    
    // Verify the signature
    return naclModule.sign.detached.verify(
      messageHash,
      signatureBytes,
      publicKeyBytes
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Saves token metadata to a file with digital signature
 * @param {TokenMetadata} tokenData - The token metadata to save
 * @param {web3.Keypair} authorityKeypair - The authority keypair for signing
 * @throws {Error} If there's an error saving the metadata
 */
export function saveTokenMetadata(tokenData: TokenMetadata, authorityKeypair: web3.Keypair): void {
  try {
    const TOKEN_METADATA_PATH = path.resolve(process.cwd(), 'token-metadata.json');
    
    // Remove any existing signature or security fields
    const metadataWithoutSignature = { ...tokenData };
    delete metadataWithoutSignature.signature;
    delete metadataWithoutSignature.checksum;
    delete metadataWithoutSignature.authorityPublicKey;
    
    // Prepare metadata for signing
    const metadataString = JSON.stringify(metadataWithoutSignature, null, 2);
    const metadataBuffer = Buffer.from(metadataString);
    
    // Sign the metadata
    const signature = signData(metadataBuffer, authorityKeypair);
    
    // Add security fields
    const secureMetadata = {
      ...metadataWithoutSignature,
      authorityPublicKey: authorityKeypair.publicKey.toString(),
      signature: signature,
      lastModified: new Date().toISOString()
    };
    
    fs.writeFileSync(
      TOKEN_METADATA_PATH, 
      JSON.stringify(secureMetadata, null, 2), 
      { encoding: 'utf-8', mode: 0o640 } // Read/write for owner, read for group
    );
    
    console.log(`Token metadata saved to ${TOKEN_METADATA_PATH}`);
  } catch (error: any) {
    throw new Error(`Failed to save token metadata: ${error.message}`);
  }
}

/**
 * Loads and verifies token metadata from a file
 * @param {web3.PublicKey} expectedAuthority - Optional expected authority public key for verification
 * @returns {TokenMetadata} The verified token metadata
 * @throws {Error} If there's an error loading the metadata or if the metadata signature is invalid
 */
export function loadTokenMetadata(expectedAuthority?: web3.PublicKey): TokenMetadata {
  try {
    const TOKEN_METADATA_PATH = path.resolve(process.cwd(), 'token-metadata.json');
    
    if (!fs.existsSync(TOKEN_METADATA_PATH)) {
      throw new Error('Token metadata file not found. Create a token first using "npm run create-token"');
    }
    
    const metadataString = fs.readFileSync(TOKEN_METADATA_PATH, 'utf-8');
    const metadata = JSON.parse(metadataString) as TokenMetadata;
    
    // Handle legacy metadata without signatures
    if (!metadata.signature) {
      console.warn('Warning: Using legacy metadata without digital signature. Consider re-signing it.');
      return metadata;
    }
    
    // Verify the authority if specified
    if (expectedAuthority) {
      const authorityPublicKey = new web3.PublicKey(metadata.authorityPublicKey);
      
      if (!authorityPublicKey.equals(expectedAuthority)) {
        throw new Error('Metadata was not signed by the expected authority');
      }
    }
    
    // Extract fields for verification
    const { signature, authorityPublicKey } = metadata;
    
    // Remove signature and authority fields for verification
    const metadataForVerification = { ...metadata };
    delete metadataForVerification.signature;
    delete metadataForVerification.authorityPublicKey;
    delete metadataForVerification.lastModified;
    
    // Verify the signature
    const metadataBuffer = Buffer.from(JSON.stringify(metadataForVerification, null, 2));
    const publicKey = new web3.PublicKey(authorityPublicKey);
    
    if (!verifySignature(metadataBuffer, signature, publicKey)) {
      throw new Error('Token metadata signature is invalid. File may have been tampered with.');
    }
    
    return metadata;
  } catch (error: any) {
    throw new Error(`Failed to load token metadata: ${error.message}`);
  }
}

/**
 * Verify if a public key is equal to an authority or another public key
 * This ensures that authority checks are consistently implemented across modules
 * 
 * @param {web3.PublicKey} publicKey - The public key to verify
 * @param {web3.PublicKey} expectedAuthority - The expected authority public key
 * @param {string} context - Optional context for error messages
 * @returns {boolean} True if the keys match, throws an error otherwise
 * @throws {Error} If the public key doesn't match the expected authority
 */
export function verifyAuthority(
  publicKey: web3.PublicKey, 
  expectedAuthority: web3.PublicKey,
  context: string = 'operation'
): boolean {
  if (!publicKey.equals(expectedAuthority)) {
    throw new Error(`Unauthorized ${context}: the provided public key does not match the authorized key`);
  }
  return true;
}

/**
 * Custom error classes for better error handling and logging
 */

// Base VCoinError class
export class VCoinError extends Error {
  code: string;
  
  constructor(message: string, code: string = 'GENERAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Security related errors
export class SecurityError extends VCoinError {
  constructor(message: string, code: string = 'SECURITY_VIOLATION') {
    super(message, code);
  }
}

// Authentication errors
export class AuthorizationError extends VCoinError {
  constructor(message: string, code: string = 'UNAUTHORIZED') {
    super(message, code);
  }
}

// Input validation errors
export class ValidationError extends VCoinError {
  constructor(message: string, code: string = 'VALIDATION_FAILED') {
    super(message, code);
  }
}

// File operation errors
export class FileOperationError extends VCoinError {
  constructor(message: string, code: string = 'FILE_OPERATION_FAILED') {
    super(message, code);
  }
}

// Balance errors
export class BalanceError extends VCoinError {
  constructor(message: string, code: string = 'INSUFFICIENT_BALANCE') {
    super(message, code);
  }
}

// Transaction errors
export class TransactionError extends VCoinError {
  constructor(message: string, code: string = 'TRANSACTION_FAILED') {
    super(message, code);
  }
}

/**
 * Standardized error handler that provides consistent behavior across all modules
 * @param {Error} error - The error to handle
 * @param {boolean} shouldExit - Whether to exit the process
 * @param {string} context - Additional context about where the error occurred
 * @returns {never|void} - Never returns if shouldExit is true
 */
export function handleError(
  error: Error | string,
  shouldExit: boolean = false,
  context: string = ''
): void {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorObject = typeof error === 'string' ? new VCoinError(error) : error;
  
  // Add context to the error message if provided
  const fullMessage = context ? `[${context}] ${errorMessage}` : errorMessage;
  
  // Different logging based on environment
  const environment = process.env.NODE_ENV === 'development' ? 'development' : 'production';
  
  if (environment === 'production') {
    // In production, log minimal information
    console.error(`Error: ${fullMessage}`);
    
    // Log additional info only for non-VCoinErrors
    if (!(errorObject instanceof VCoinError)) {
      console.error(`Type: Unexpected ${errorObject.name || 'Error'}`);
    }
  } else {
    // In development, log full error details
    console.error('---------------------------------------------------');
    console.error(`Error: ${fullMessage}`);
    
    if (errorObject instanceof VCoinError) {
      console.error(`Code: ${errorObject.code}`);
      console.error(`Type: ${errorObject.name}`);
    }
    
    console.error('Stack trace:');
    console.error(errorObject.stack);
    console.error('---------------------------------------------------');
  }
  
  // Exit the process if requested
  if (shouldExit) {
    process.exit(1);
  }
}

/**
 * Safe file operations with locking to prevent race conditions
 */

/**
 * Safely reads a JSON file with locking to prevent race conditions
 * 
 * @param {string} filePath - Path to the file to read
 * @param {Object} defaultValue - Default value if file doesn't exist
 * @param {Object} options - Additional options for locking
 * @returns {Promise<any>} - The file content
 */
export async function safeReadJSON<T>(
  filePath: string, 
  defaultValue: T, 
  options: { ensureDir?: boolean, retries?: number } = {}
): Promise<T> {
  const { ensureDir = true, retries = 5 } = options;
  
  // Create directory if it doesn't exist
  if (ensureDir) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fsExtra.mkdirSync(dir, { recursive: true, mode: 0o750 }); // Read/write/execute for owner, read/execute for group
    }
  }
  
  // Return default value if file doesn't exist
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  
  try {
    // Acquire a lock for reading
    await lockfile.lock(filePath, { 
      retries, 
      retryWait: 100, 
      stale: 30000 
    });
    
    try {
      const content = await fsExtra.readJSON(filePath);
      return content as T;
    } finally {
      // Always release the lock
      await lockfile.unlock(filePath);
    }
  } catch (error: any) {
    console.error(`Error reading file with lock: ${filePath}`, error);
    
    // If locking fails, try to read without locking as fallback
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
      } catch (readError) {
        console.error(`Fallback read also failed: ${filePath}`, readError);
      }
    }
    
    // Return default value if everything fails
    return defaultValue;
  }
}

/**
 * Safely writes a JSON file with locking to prevent race conditions
 * 
 * @param {string} filePath - Path to the file to write
 * @param {any} data - Data to write
 * @param {Object} options - Additional options for locking
 * @returns {Promise<void>}
 */
export async function safeWriteJSON(
  filePath: string, 
  data: any, 
  options: { 
    ensureDir?: boolean, 
    retries?: number, 
    atomic?: boolean,
    pretty?: boolean
  } = {}
): Promise<void> {
  const { 
    ensureDir = true, 
    retries = 5, 
    atomic = true,
    pretty = true 
  } = options;
  
  // Create directory if it doesn't exist
  if (ensureDir) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fsExtra.mkdirSync(dir, { recursive: true, mode: 0o750 }); // Read/write/execute for owner, read/execute for group
    }
  }
  
  try {
    // Acquire a lock for writing
    await lockfile.lock(filePath, { 
      retries, 
      retryWait: 100, 
      stale: 30000 
    });
    
    try {
      // Write the file atomically to prevent partial writes
      if (atomic) {
        await fsExtra.writeJSON(
          filePath, 
          data, 
          { 
            spaces: pretty ? 2 : 0,
            encoding: 'utf-8',
            mode: 0o640, // Read/write for owner, read for group
            flag: 'w' 
          }
        );
      } else {
        // Direct write if atomic is not required
        fs.writeFileSync(
          filePath,
          JSON.stringify(data, null, pretty ? 2 : 0),
          { encoding: 'utf-8', mode: 0o640 } // Read/write for owner, read for group
        );
      }
    } finally {
      // Always release the lock
      await lockfile.unlock(filePath);
    }
  } catch (error: any) {
    console.error(`Error writing file with lock: ${filePath}`, error);
    
    // If locking fails, try to write without locking as fallback
    // Note: This is not thread-safe, but better than nothing
    try {
      if (atomic) {
        await fsExtra.writeJSON(filePath, data, { spaces: pretty ? 2 : 0 });
      } else {
        fs.writeFileSync(filePath, JSON.stringify(data, null, pretty ? 2 : 0), 'utf-8');
      }
    } catch (writeError) {
      console.error(`Fallback write also failed: ${filePath}`, writeError);
      throw writeError; // Re-throw to indicate failure
    }
  }
}

/**
 * Safely updates a JSON file with locking to prevent race conditions
 * This reads the file, applies the update function, and then writes it back
 * 
 * @param {string} filePath - Path to the file to update
 * @param {Function} updateFn - Function that transforms the data
 * @param {any} defaultValue - Default value if file doesn't exist
 * @param {Object} options - Additional options for locking
 * @returns {Promise<T>} - The updated data
 */
export async function safeUpdateJSON<T>(
  filePath: string, 
  updateFn: (data: T) => T, 
  defaultValue: T,
  options: {
    ensureDir?: boolean, 
    retries?: number,
    atomic?: boolean,
    pretty?: boolean
  } = {}
): Promise<T> {
  const { 
    ensureDir = true, 
    retries = 5, 
    atomic = true,
    pretty = true 
  } = options;
  
  // Create directory if it doesn't exist
  if (ensureDir) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fsExtra.mkdirSync(dir, { recursive: true });
    }
  }
  
  try {
    // Acquire a lock for reading and writing
    await lockfile.lock(filePath, { 
      retries, 
      retryWait: 100, 
      stale: 30000 
    });
    
    try {
      // Read current data or use default
      let data: T;
      if (fs.existsSync(filePath)) {
        try {
          data = await fsExtra.readJSON(filePath) as T;
        } catch (readError) {
          console.warn(`Error reading file for update: ${filePath}`, readError);
          data = defaultValue;
        }
      } else {
        data = defaultValue;
      }
      
      // Apply update function to transform data
      const updatedData = updateFn(data);
      
      // Write updated data back to file
      if (atomic) {
        await fsExtra.writeJSON(
          filePath, 
          updatedData, 
          { 
            spaces: pretty ? 2 : 0,
            encoding: 'utf-8',
            mode: 0o640, // Read/write for owner, read for group
            flag: 'w' 
          }
        );
      } else {
        fs.writeFileSync(
          filePath,
          JSON.stringify(updatedData, null, pretty ? 2 : 0),
          { encoding: 'utf-8', mode: 0o640 }
        );
      }
      
      return updatedData;
    } finally {
      // Always release the lock
      await lockfile.unlock(filePath);
    }
  } catch (error: any) {
    console.error(`Error updating file with lock: ${filePath}`, error);
    throw new Error(`Failed to update file safely: ${error.message}`);
  }
} 