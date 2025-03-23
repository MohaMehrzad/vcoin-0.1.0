import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction,
  SystemProgram
} from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID,
  createSetAuthorityInstruction,
  AuthorityType
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  getConnection,
  getOrCreateKeypair,
  loadTokenMetadata,
  saveTokenMetadata,
  handleError,
  verifyAuthority
} from './utils';

// Constants
const AUTHORITY_CONFIG_PATH = path.resolve(process.cwd(), 'authority-config.json');

// Authority capabilities that can be renounced
export enum AuthorityCapability {
  MINT_TOKENS = 'mintTokens',
  UPDATE_METADATA = 'updateMetadata',
  FREEZE_ACCOUNTS = 'freezeAccounts',
  CLOSE_ACCOUNTS = 'closeAccounts',
  SET_TRANSFER_FEE = 'setTransferFee',
  TRANSFER_AUTHORITY = 'transferAuthority'
}

// Types for authority configuration
interface TimeLockedTransfer {
  targetAddress: string;
  executeAfter: string; // ISO date string
  transactionId?: string;
  status: 'pending' | 'executed' | 'cancelled';
}

interface AuthorityConfig {
  mintAddress: string;
  authorityAddress: string;
  capabilities: {
    [key in AuthorityCapability]: boolean;
  };
  timeLockedTransfers: TimeLockedTransfer[];
  actionLog: {
    action: string;
    timestamp: string;
    transactionId?: string;
    details?: string;
  }[];
  lastModified: string;
  signature?: string;
}

/**
 * Initialize authority configuration for a token
 * @param authorityKeypair The authority keypair
 * @returns The initialized authority configuration
 */
export async function initializeAuthorityConfig(authorityKeypair: Keypair): Promise<AuthorityConfig> {
  // Load token metadata
  const tokenMetadata = loadTokenMetadata(authorityKeypair.publicKey);
  
  // Check if config already exists
  if (fs.existsSync(AUTHORITY_CONFIG_PATH)) {
    const existingConfig = loadAuthorityConfig();
    
    // Verify the config is for the same token
    if (existingConfig.mintAddress !== tokenMetadata.mintAddress) {
      throw new Error(
        `Authority config exists for a different token. ` +
        `Expected: ${tokenMetadata.mintAddress}, Found: ${existingConfig.mintAddress}`
      );
    }
    
    // Verify the authority
    if (existingConfig.authorityAddress !== authorityKeypair.publicKey.toString()) {
      throw new Error(
        `Authority mismatch. ` +
        `Expected: ${existingConfig.authorityAddress}, ` +
        `Found: ${authorityKeypair.publicKey.toString()}`
      );
    }
    
    return existingConfig;
  }
  
  // Create new config
  const config: AuthorityConfig = {
    mintAddress: tokenMetadata.mintAddress,
    authorityAddress: authorityKeypair.publicKey.toString(),
    capabilities: {
      [AuthorityCapability.MINT_TOKENS]: true,
      [AuthorityCapability.UPDATE_METADATA]: true,
      [AuthorityCapability.FREEZE_ACCOUNTS]: true,
      [AuthorityCapability.CLOSE_ACCOUNTS]: true,
      [AuthorityCapability.SET_TRANSFER_FEE]: true,
      [AuthorityCapability.TRANSFER_AUTHORITY]: true
    },
    timeLockedTransfers: [],
    actionLog: [{
      action: 'INITIALIZE_CONFIG',
      timestamp: new Date().toISOString(),
      details: 'Authority configuration initialized'
    }],
    lastModified: new Date().toISOString()
  };
  
  // Save the config
  saveAuthorityConfig(config, authorityKeypair);
  
  console.log(`Authority configuration initialized for token ${tokenMetadata.mintAddress}`);
  return config;
}

/**
 * Load authority configuration
 * @returns The authority configuration
 */
export function loadAuthorityConfig(): AuthorityConfig {
  if (!fs.existsSync(AUTHORITY_CONFIG_PATH)) {
    throw new Error('Authority configuration not found. Initialize it first.');
  }
  
  try {
    const configData = JSON.parse(fs.readFileSync(AUTHORITY_CONFIG_PATH, 'utf-8'));
    
    // Verify signature if present
    if (configData.signature) {
      const { signature, ...configWithoutSignature } = configData;
      const authorityPublicKey = new PublicKey(configData.authorityAddress);
      
      const message = JSON.stringify(configWithoutSignature, null, 2);
      const messageBuffer = Buffer.from(message);
      
      const signatureBuffer = Buffer.from(signature, 'base64');
      const isValid = verifyConfigSignature(messageBuffer, signatureBuffer, authorityPublicKey);
      
      if (!isValid) {
        throw new Error('Authority configuration signature is invalid. File may have been tampered with.');
      }
    } else {
      console.warn('Warning: Authority configuration does not have a signature. It may be tampered with.');
    }
    
    return configData;
  } catch (error: any) {
    throw new Error(`Failed to load authority configuration: ${error.message}`);
  }
}

/**
 * Save authority configuration
 * @param config The authority configuration to save
 * @param authorityKeypair The authority keypair for signing
 */
export function saveAuthorityConfig(config: AuthorityConfig, authorityKeypair: Keypair): void {
  try {
    // Update last modified
    config.lastModified = new Date().toISOString();
    
    // Create directory if it doesn't exist
    const configDir = path.dirname(AUTHORITY_CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
    
    // Remove signature for signing
    const configToSign = { ...config };
    delete configToSign.signature;
    
    // Sign the config
    const message = JSON.stringify(configToSign, null, 2);
    const messageBuffer = Buffer.from(message);
    const signature = signConfig(messageBuffer, authorityKeypair);
    
    // Add signature
    const configToSave = {
      ...configToSign,
      signature: signature.toString('base64')
    };
    
    // Save config
    fs.writeFileSync(
      AUTHORITY_CONFIG_PATH,
      JSON.stringify(configToSave, null, 2),
      { encoding: 'utf-8', mode: 0o640 } // Read/write for owner, read for group
    );
    
    console.log(`Authority configuration saved to ${AUTHORITY_CONFIG_PATH}`);
  } catch (error: any) {
    throw new Error(`Failed to save authority configuration: ${error.message}`);
  }
}

/**
 * Sign configuration data
 * @param data Data to sign
 * @param keypair Keypair to sign with
 * @returns Signature buffer
 */
function signConfig(data: Buffer, keypair: Keypair): Buffer {
  return crypto.sign(
    'sha256', 
    data, 
    Buffer.from(keypair.secretKey.slice(0, 32))
  );
}

/**
 * Verify configuration signature
 * @param data Data that was signed
 * @param signature Signature to verify
 * @param publicKey Public key to verify against
 * @returns Whether the signature is valid
 */
function verifyConfigSignature(data: Buffer, signature: Buffer, publicKey: PublicKey): boolean {
  try {
    return crypto.verify(
      'sha256',
      data,
      Buffer.from(publicKey.toBytes()),
      signature
    );
  } catch (error) {
    return false;
  }
}

/**
 * Check if an authority capability is enabled
 * @param capability The capability to check
 * @returns Whether the capability is enabled
 */
export function isAuthorityCapabilityEnabled(capability: AuthorityCapability): boolean {
  try {
    const config = loadAuthorityConfig();
    return config.capabilities[capability] === true;
  } catch (error) {
    // If config doesn't exist, default to enabled for backward compatibility
    return true;
  }
}

/**
 * Renounce an authority capability
 * @param capability The capability to renounce
 * @param authorityKeypair The authority keypair
 */
export async function renounceCapability(
  capability: AuthorityCapability,
  authorityKeypair: Keypair
): Promise<void> {
  // Load configuration
  let config = loadAuthorityConfig();
  
  // Verify the authority
  if (config.authorityAddress !== authorityKeypair.publicKey.toString()) {
    throw new Error(`Only the current authority can renounce capabilities`);
  }
  
  // Check if already renounced
  if (!config.capabilities[capability]) {
    console.log(`Capability ${capability} is already renounced`);
    return;
  }
  
  // Special handling for MINT_TOKENS capability
  if (capability === AuthorityCapability.MINT_TOKENS) {
    // Permanently revoke mint authority on-chain
    console.log('Permanently revoking mint authority on-chain...');
    await revokeMintAuthority(authorityKeypair);
    console.log('Mint authority revoked. This action cannot be undone.');
  }
  
  // Update configuration
  config.capabilities[capability] = false;
  
  // Log the action
  config.actionLog.push({
    action: 'RENOUNCE_CAPABILITY',
    timestamp: new Date().toISOString(),
    details: `Renounced capability: ${capability}`
  });
  
  // Save updated configuration
  saveAuthorityConfig(config, authorityKeypair);
  
  console.log(`Successfully renounced ${capability} capability`);
}

/**
 * Permanently revoke mint authority on-chain
 * @param authorityKeypair The current authority keypair
 */
async function revokeMintAuthority(authorityKeypair: Keypair): Promise<void> {
  const connection = getConnection();
  const tokenMetadata = loadTokenMetadata(authorityKeypair.publicKey);
  const mintAddress = new PublicKey(tokenMetadata.mintAddress);
  
  // Create instruction to set mint authority to null (revoke)
  const revokeInstruction = createSetAuthorityInstruction(
    mintAddress,
    authorityKeypair.publicKey,
    AuthorityType.MintTokens,
    null, // Setting to null permanently revokes the authority
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  
  // Create and sign transaction
  const transaction = new Transaction().add(revokeInstruction);
  
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [authorityKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log(`Mint authority revoked successfully. Transaction: ${signature}`);
    
    // Update token metadata to reflect the change
    const updatedMetadata = { ...tokenMetadata, mintAuthority: null };
    saveTokenMetadata(updatedMetadata, authorityKeypair);
    
  } catch (error: any) {
    throw new Error(`Failed to revoke mint authority: ${error.message}`);
  }
}

/**
 * Propose a time-locked authority transfer
 * @param targetAddress The target authority address
 * @param delayInDays The delay in days before the transfer can be executed
 * @param authorityKeypair The current authority keypair
 */
export async function proposeAuthorityTransfer(
  targetAddress: string,
  delayInDays: number,
  authorityKeypair: Keypair
): Promise<void> {
  // Validate input
  try {
    new PublicKey(targetAddress);
  } catch {
    throw new Error(`Invalid target address: ${targetAddress}`);
  }
  
  if (delayInDays < 1) {
    throw new Error('Delay must be at least 1 day for security reasons');
  }
  
  // Load configuration
  let config = loadAuthorityConfig();
  
  // Verify the authority
  if (config.authorityAddress !== authorityKeypair.publicKey.toString()) {
    throw new Error(`Only the current authority can propose a transfer`);
  }
  
  // Check if capability is enabled
  if (!isAuthorityCapabilityEnabled(AuthorityCapability.TRANSFER_AUTHORITY)) {
    throw new Error(`Authority transfer capability has been renounced`);
  }
  
  // Calculate execution date
  const executeAfter = new Date();
  executeAfter.setDate(executeAfter.getDate() + delayInDays);
  
  // Create transfer proposal
  const transfer: TimeLockedTransfer = {
    targetAddress,
    executeAfter: executeAfter.toISOString(),
    status: 'pending'
  };
  
  // Add to pending transfers
  config.timeLockedTransfers.push(transfer);
  
  // Log the action
  config.actionLog.push({
    action: 'PROPOSE_TRANSFER',
    timestamp: new Date().toISOString(),
    details: `Proposed transfer to ${targetAddress} executable after ${executeAfter.toISOString()}`
  });
  
  // Save updated configuration
  saveAuthorityConfig(config, authorityKeypair);
  
  console.log(`Authority transfer proposed:`);
  console.log(`- Target: ${targetAddress}`);
  console.log(`- Executable after: ${executeAfter.toLocaleString()}`);
  console.log(`- Delay: ${delayInDays} days`);
  console.log('\nThe transfer must be executed after the time lock expires.');
}

/**
 * Cancel a proposed authority transfer
 * @param index The index of the transfer to cancel
 * @param authorityKeypair The authority keypair
 */
export async function cancelAuthorityTransfer(
  index: number,
  authorityKeypair: Keypair
): Promise<void> {
  // Load configuration
  let config = loadAuthorityConfig();
  
  // Verify the authority
  if (config.authorityAddress !== authorityKeypair.publicKey.toString()) {
    throw new Error(`Only the current authority can cancel a transfer`);
  }
  
  // Validate index
  if (index < 0 || index >= config.timeLockedTransfers.length) {
    throw new Error(`Invalid transfer index: ${index}`);
  }
  
  const transfer = config.timeLockedTransfers[index];
  
  // Check if already executed
  if (transfer.status === 'executed') {
    throw new Error(`Cannot cancel an executed transfer`);
  }
  
  // Cancel the transfer
  transfer.status = 'cancelled';
  
  // Log the action
  config.actionLog.push({
    action: 'CANCEL_TRANSFER',
    timestamp: new Date().toISOString(),
    details: `Cancelled transfer to ${transfer.targetAddress}`
  });
  
  // Save updated configuration
  saveAuthorityConfig(config, authorityKeypair);
  
  console.log(`Authority transfer to ${transfer.targetAddress} cancelled`);
}

/**
 * Execute a time-locked authority transfer
 * @param index The index of the transfer to execute
 * @param authorityKeypair The current authority keypair
 */
export async function executeAuthorityTransfer(
  index: number,
  authorityKeypair: Keypair
): Promise<void> {
  // Load configuration
  let config = loadAuthorityConfig();
  
  // Verify the authority
  if (config.authorityAddress !== authorityKeypair.publicKey.toString()) {
    throw new Error(`Only the current authority can execute a transfer`);
  }
  
  // Validate index
  if (index < 0 || index >= config.timeLockedTransfers.length) {
    throw new Error(`Invalid transfer index: ${index}`);
  }
  
  const transfer = config.timeLockedTransfers[index];
  
  // Check status
  if (transfer.status !== 'pending') {
    throw new Error(`Transfer is not pending (status: ${transfer.status})`);
  }
  
  // Check if time lock has expired
  const executeAfter = new Date(transfer.executeAfter);
  const now = new Date();
  
  if (now < executeAfter) {
    const timeRemaining = Math.ceil((executeAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    throw new Error(
      `Time lock has not expired yet. ` +
      `Transfer can be executed after ${executeAfter.toLocaleString()} ` +
      `(${timeRemaining} days remaining)`
    );
  }
  
  // Load token metadata
  const tokenMetadata = loadTokenMetadata(authorityKeypair.publicKey);
  const mintAddress = new PublicKey(tokenMetadata.mintAddress);
  const targetPublicKey = new PublicKey(transfer.targetAddress);
  
  // Execute transfer on-chain
  console.log(`Executing authority transfer to ${transfer.targetAddress}...`);
  
  const connection = getConnection();
  
  try {
    // Create instruction to set new mint authority
    const updateMintAuthorityInstruction = createSetAuthorityInstruction(
      mintAddress,
      authorityKeypair.publicKey,
      AuthorityType.MintTokens,
      targetPublicKey,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create and sign transaction
    const transaction = new Transaction().add(updateMintAuthorityInstruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [authorityKeypair],
      { commitment: 'confirmed' }
    );
    
    // Update transfer status
    transfer.status = 'executed';
    transfer.transactionId = signature;
    
    // Update authority address in config
    config.authorityAddress = transfer.targetAddress;
    
    // Log the action
    config.actionLog.push({
      action: 'EXECUTE_TRANSFER',
      timestamp: new Date().toISOString(),
      transactionId: signature,
      details: `Transferred authority to ${transfer.targetAddress}`
    });
    
    // Save updated configuration
    saveAuthorityConfig(config, authorityKeypair);
    
    // Update token metadata
    tokenMetadata.authorityAddress = transfer.targetAddress;
    saveTokenMetadata(tokenMetadata, authorityKeypair);
    
    console.log(`Authority successfully transferred to ${transfer.targetAddress}`);
    console.log(`Transaction ID: ${signature}`);
    console.log(`\nNOTE: The new authority must initialize their keypair to manage the token.`);
    
  } catch (error: any) {
    throw new Error(`Failed to execute authority transfer: ${error.message}`);
  }
}

/**
 * List all authority actions and status
 */
export function listAuthorityStatus(): void {
  try {
    const config = loadAuthorityConfig();
    
    console.log('===== VCoin Authority Status =====');
    console.log(`Mint Address: ${config.mintAddress}`);
    console.log(`Current Authority: ${config.authorityAddress}`);
    console.log('\nCapabilities:');
    
    for (const [capability, enabled] of Object.entries(config.capabilities)) {
      console.log(`- ${capability}: ${enabled ? 'Enabled' : 'Renounced'}`);
    }
    
    console.log('\nPending Transfers:');
    const pendingTransfers = config.timeLockedTransfers.filter(t => t.status === 'pending');
    
    if (pendingTransfers.length === 0) {
      console.log('No pending transfers');
    } else {
      pendingTransfers.forEach((transfer, index) => {
        const executeAfter = new Date(transfer.executeAfter);
        const now = new Date();
        const daysRemaining = Math.ceil((executeAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        console.log(`[${index}] Target: ${transfer.targetAddress}`);
        console.log(`    Executable after: ${executeAfter.toLocaleString()}`);
        console.log(`    Time remaining: ${daysRemaining > 0 ? `${daysRemaining} days` : 'Ready to execute'}`);
      });
    }
    
    console.log('\nRecent Actions:');
    // Show last 5 actions
    const recentActions = config.actionLog.slice(-5).reverse();
    
    recentActions.forEach(action => {
      const timestamp = new Date(action.timestamp).toLocaleString();
      console.log(`- ${timestamp}: ${action.action} - ${action.details || ''}`);
      if (action.transactionId) {
        console.log(`  Transaction: ${action.transactionId}`);
      }
    });
    
    console.log('==================================');
  } catch (error: any) {
    if (error.message.includes('not found')) {
      console.log('Authority configuration not initialized yet.');
      console.log('Run "npm run authority init" to initialize.');
    } else {
      console.error(`Error: ${error.message}`);
    }
  }
}

// Main function for CLI
export async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  try {
    switch (command) {
      case 'init':
        const authorityKeypair = await getOrCreateKeypair('authority');
        await initializeAuthorityConfig(authorityKeypair);
        break;
        
      case 'status':
        listAuthorityStatus();
        break;
        
      case 'renounce':
        if (args.length < 2) {
          console.error('Usage: npm run authority renounce <capability>');
          console.error('Available capabilities:');
          Object.values(AuthorityCapability).forEach(cap => console.error(`- ${cap}`));
          process.exit(1);
        }
        
        const capability = args[1] as AuthorityCapability;
        if (!Object.values(AuthorityCapability).includes(capability)) {
          console.error(`Invalid capability: ${capability}`);
          console.error('Available capabilities:');
          Object.values(AuthorityCapability).forEach(cap => console.error(`- ${cap}`));
          process.exit(1);
        }
        
        const keypairForRenounce = await getOrCreateKeypair('authority');
        await renounceCapability(capability, keypairForRenounce);
        break;
        
      case 'propose-transfer':
        if (args.length < 3) {
          console.error('Usage: npm run authority propose-transfer <target_address> <delay_days>');
          process.exit(1);
        }
        
        const targetAddress = args[1];
        const delayDays = parseInt(args[2]);
        
        if (isNaN(delayDays) || delayDays <= 0) {
          console.error('Delay must be a positive number of days');
          process.exit(1);
        }
        
        const keypairForProposal = await getOrCreateKeypair('authority');
        await proposeAuthorityTransfer(targetAddress, delayDays, keypairForProposal);
        break;
        
      case 'cancel-transfer':
        if (args.length < 2) {
          console.error('Usage: npm run authority cancel-transfer <index>');
          process.exit(1);
        }
        
        const cancelIndex = parseInt(args[1]);
        
        if (isNaN(cancelIndex) || cancelIndex < 0) {
          console.error('Index must be a non-negative number');
          process.exit(1);
        }
        
        const keypairForCancel = await getOrCreateKeypair('authority');
        await cancelAuthorityTransfer(cancelIndex, keypairForCancel);
        break;
        
      case 'execute-transfer':
        if (args.length < 2) {
          console.error('Usage: npm run authority execute-transfer <index>');
          process.exit(1);
        }
        
        const executeIndex = parseInt(args[1]);
        
        if (isNaN(executeIndex) || executeIndex < 0) {
          console.error('Index must be a non-negative number');
          process.exit(1);
        }
        
        const keypairForExecute = await getOrCreateKeypair('authority');
        await executeAuthorityTransfer(executeIndex, keypairForExecute);
        break;
        
      default:
        console.log('VCoin Authority Management');
        console.log('Available commands:');
        console.log('  npm run authority init - Initialize authority configuration');
        console.log('  npm run authority status - Check authority status');
        console.log('  npm run authority renounce <capability> - Renounce an authority capability');
        console.log('  npm run authority propose-transfer <target_address> <delay_days> - Propose a time-locked authority transfer');
        console.log('  npm run authority cancel-transfer <index> - Cancel a proposed transfer');
        console.log('  npm run authority execute-transfer <index> - Execute a time-locked transfer');
        break;
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Execute main function if this file is run directly
if (require.main === module) {
  main();
} 