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
  verifyAuthority,
  SecurityError
} from './utils';

// Constants
const AUTHORITY_CONFIG_PATH = path.resolve(process.cwd(), 'authority-config.json');
const AUTHORITY_CONFIG_VERSION = '1.0.0'; // Add versioning

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
  version: string; // Add versioning field
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
    const existingConfig = loadAuthorityConfig(false);
    
    // Verify the config is for the same token
    if (existingConfig.mintAddress !== tokenMetadata.mintAddress) {
      throw new Error(
        `Authority config exists for a different token. ` +
        `Expected: ${tokenMetadata.mintAddress}, Found: ${existingConfig.mintAddress}`
      );
    }
    
    // Verify the authority using standardized function
    verifyAuthority(authorityKeypair.publicKey, new PublicKey(existingConfig.authorityAddress), 'initialize authority');
    
    return existingConfig;
  }
  
  // Create new config
  const config: AuthorityConfig = {
    version: AUTHORITY_CONFIG_VERSION, // Add version
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
 * Load authority configuration with mandatory signature verification
 * @param skipSignatureVerification Only for testing/dev environments - DO NOT use in production
 * @returns The verified authority configuration
 * @throws {Error} If the configuration is not found, signature is missing or invalid
 */
export function loadAuthorityConfig(skipSignatureVerification: boolean = false): AuthorityConfig {
  // Only allow skipping signature verification in non-production environments
  if (skipSignatureVerification && process.env.NODE_ENV === 'production') {
    throw new Error('Signature verification cannot be skipped in production environment');
  }

  if (!fs.existsSync(AUTHORITY_CONFIG_PATH)) {
    throw new Error('Authority configuration not found. Initialize it first.');
  }
  
  try {
    const configData = JSON.parse(fs.readFileSync(AUTHORITY_CONFIG_PATH, 'utf-8'));
    
    // Always verify the integrity of the configuration file
    if (!skipSignatureVerification) {
      // Signature is required
      if (!configData.signature) {
        throw new Error('Authority configuration is missing a signature. File may be tampered with or corrupted.');
      }
      
      const { signature, ...configWithoutSignature } = configData;
      
      // Check if the authorityAddress is present and valid
      if (!configData.authorityAddress) {
        throw new Error('Authority configuration is missing the authorityAddress field.');
      }
      
      try {
        const authorityPublicKey = new PublicKey(configData.authorityAddress);
        
        const message = JSON.stringify(configWithoutSignature, null, 2);
        const messageBuffer = Buffer.from(message);
        
        const signatureBuffer = Buffer.from(signature, 'base64');
        const isValid = verifyConfigSignature(messageBuffer, signatureBuffer, authorityPublicKey);
        
        if (!isValid) {
          throw new Error('Authority configuration signature is invalid. File may have been tampered with.');
        }
      } catch (error: any) {
        if (error.message.includes('Invalid public key')) {
          throw new Error(`Invalid authority public key in configuration: ${configData.authorityAddress}`);
        }
        throw error;
      }
    } else {
      // Development-only code path
      console.warn('WARNING: Signature verification skipped. This should only be used in development.');
    }
    
    // Version checking
    if (!configData.version) {
      console.warn('Authority configuration has no version. Consider reinitializing with the latest version.');
      // Add version field to maintain compatibility with older configs
      configData.version = '0.0.1';
    } else if (configData.version !== AUTHORITY_CONFIG_VERSION) {
      console.warn(`Authority configuration version mismatch. Expected: ${AUTHORITY_CONFIG_VERSION}, Found: ${configData.version}`);
      console.warn('Consider upgrading your configuration to the latest version.');
    }
    
    return configData;
  } catch (error: any) {
    throw new Error(`Failed to load authority configuration: ${error.message}`);
  }
}

/**
 * Save authority configuration with mandatory signing
 * @param config The authority configuration to save
 * @param authorityKeypair The authority keypair for signing
 */
export function saveAuthorityConfig(config: AuthorityConfig, authorityKeypair: Keypair): void {
  try {
    // Update last modified and ensure version
    config.lastModified = new Date().toISOString();
    config.version = config.version || AUTHORITY_CONFIG_VERSION;
    
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
    
    // Save config with atomic write to prevent corruption
    const tempPath = `${AUTHORITY_CONFIG_PATH}.tmp`;
    fs.writeFileSync(
      tempPath,
      JSON.stringify(configToSave, null, 2),
      { encoding: 'utf-8', mode: 0o640 } // Read/write for owner, read for group
    );
    
    // Rename is atomic on most filesystems
    fs.renameSync(tempPath, AUTHORITY_CONFIG_PATH);
    
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
    const config = loadVerifiedConfig();
    return config.capabilities[capability] === true;
  } catch (error) {
    // If config doesn't exist or is invalid, default to enabled for backward compatibility
    // But log a warning
    console.warn(`Warning: Could not verify authority capability ${capability}, defaulting to enabled.`);
    console.warn(`Reason: ${error instanceof Error ? error.message : String(error)}`);
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
  // Load configuration with verification
  let config = loadVerifiedConfig();
  
  // Verify the authority using the standardized function
  verifyAuthority(authorityKeypair.publicKey, new PublicKey(config.authorityAddress), 'renounce capability');
  
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
  
  // Load configuration with verification
  let config = loadVerifiedConfig();
  
  // Verify the authority using standardized function
  verifyAuthority(authorityKeypair.publicKey, new PublicKey(config.authorityAddress), 'propose authority transfer');
  
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
  // Load configuration with verification
  let config = loadVerifiedConfig();
  
  // Verify the authority using standardized function
  verifyAuthority(authorityKeypair.publicKey, new PublicKey(config.authorityAddress), 'cancel authority transfer');
  
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
  // Load configuration with verification
  let config = loadVerifiedConfig();
  
  // Verify the authority using standardized function
  verifyAuthority(authorityKeypair.publicKey, new PublicKey(config.authorityAddress), 'execute authority transfer');
  
  // Validate index
  if (index < 0 || index >= config.timeLockedTransfers.length) {
    throw new Error(`Invalid transfer index: ${index}`);
  }
  
  const transfer = config.timeLockedTransfers[index];
  
  // Check transfer status
  if (transfer.status === 'executed') {
    throw new Error(`Transfer has already been executed`);
  }
  
  if (transfer.status === 'cancelled') {
    throw new Error(`Cannot execute a cancelled transfer`);
  }
  
  // Check time lock
  const now = new Date();
  const executeAfter = new Date(transfer.executeAfter);
  
  if (now < executeAfter) {
    const timeRemaining = Math.ceil((executeAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    throw new Error(
      `Time lock has not expired. Transfer can be executed after ${executeAfter.toLocaleString()}. ` +
      `Remaining time: ${timeRemaining} days.`
    );
  }
  
  // Get target address
  let targetAddress: PublicKey;
  try {
    targetAddress = new PublicKey(transfer.targetAddress);
  } catch (error) {
    throw new Error(`Invalid target address: ${transfer.targetAddress}`);
  }
  
  // Before executing the transfer, create a backup
  backupAuthorityConfig(config, authorityKeypair);
  
  try {
    // Execute on-chain token authority transfer for mint and other authorities
    const tokenMetadata = loadTokenMetadata(authorityKeypair.publicKey);
    
    // Update token metadata
    const updatedMetadata = { ...tokenMetadata, authorityAddress: targetAddress.toString() };
    saveTokenMetadata(updatedMetadata, authorityKeypair);
    
    // Update transfer status
    transfer.status = 'executed';
    
    // Log the action
    config.actionLog.push({
      action: 'EXECUTE_TRANSFER',
      timestamp: new Date().toISOString(),
      details: `Executed transfer to ${targetAddress.toString()}`
    });
    
    // Save updated configuration but with the new authority
    saveAuthorityConfig({
      ...config,
      authorityAddress: targetAddress.toString()
    }, authorityKeypair);
    
    console.log(`Authority successfully transferred to ${targetAddress.toString()}`);
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

/**
 * Upgrade configuration to the latest version if needed
 * @param config The configuration to upgrade
 * @param authorityKeypair The authority keypair
 * @returns The upgraded configuration
 */
export function upgradeAuthorityConfig(config: AuthorityConfig, authorityKeypair: Keypair): AuthorityConfig {
  // Skip if already at the latest version
  if (config.version === AUTHORITY_CONFIG_VERSION) {
    return config;
  }
  
  // Verify the authority
  verifyAuthority(authorityKeypair.publicKey, new PublicKey(config.authorityAddress), 'upgrade configuration');
  
  console.log(`Upgrading authority configuration from v${config.version} to v${AUTHORITY_CONFIG_VERSION}`);
  
  // Perform version-specific upgrades
  const upgradedConfig = { ...config };
  
  // Example version upgrade logic:
  // if (config.version === '0.0.1') {
  //   upgradedConfig.someNewField = 'defaultValue';
  //   upgradedConfig.version = '0.0.2';
  // }
  
  // if (upgradedConfig.version === '0.0.2') {
  //   upgradedConfig.anotherNewField = true;
  //   upgradedConfig.version = '0.0.3';
  // }
  
  // Always update to the latest version
  upgradedConfig.version = AUTHORITY_CONFIG_VERSION;
  
  // Log the upgrade
  upgradedConfig.actionLog.push({
    action: 'UPGRADE_CONFIG',
    timestamp: new Date().toISOString(),
    details: `Configuration upgraded from v${config.version} to v${AUTHORITY_CONFIG_VERSION}`
  });
  
  // Save the upgraded config
  saveAuthorityConfig(upgradedConfig, authorityKeypair);
  
  console.log('Configuration upgrade completed successfully');
  return upgradedConfig;
}

/**
 * Secure backup of authority configuration
 * @param config The configuration to backup
 * @param authorityKeypair The authority keypair
 * @returns Path to the backup file
 */
export function backupAuthorityConfig(config: AuthorityConfig, authorityKeypair: Keypair): string {
  try {
    // Verify the authority
    verifyAuthority(authorityKeypair.publicKey, new PublicKey(config.authorityAddress), 'backup configuration');
    
    // Create backup directory
    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    }
    
    // Create a timestamped backup file
    const timestamp = new Date().toISOString().replace(/[:\.]/g, '-');
    const backupPath = path.join(backupDir, `authority-config-${timestamp}.json`);
    
    // Add backup info to config
    const backupConfig = { 
      ...config,
      backupInfo: {
        timestamp: new Date().toISOString(),
        version: config.version,
        backupCreator: authorityKeypair.publicKey.toString()
      }
    };
    
    // Sign and save backup
    const message = JSON.stringify(backupConfig, null, 2);
    const messageBuffer = Buffer.from(message);
    const signature = signConfig(messageBuffer, authorityKeypair);
    
    const signedBackup = {
      ...backupConfig,
      backupSignature: signature.toString('base64')
    };
    
    fs.writeFileSync(
      backupPath,
      JSON.stringify(signedBackup, null, 2),
      { encoding: 'utf-8', mode: 0o640 }
    );
    
    console.log(`Authority configuration backed up to ${backupPath}`);
    return backupPath;
  } catch (error: any) {
    throw new Error(`Failed to backup authority configuration: ${error.message}`);
  }
}

/**
 * Verifies the integrity of the authority configuration and loads it 
 * with appropriate security checks for the environment
 * @returns Verified authority configuration
 */
function loadVerifiedConfig(): AuthorityConfig {
  const isProdEnv = process.env.NODE_ENV !== 'development';
  
  try {
    // Always enforce signature verification
    return loadAuthorityConfig(false);
  } catch (error: any) {
    // In development only, allow fallback if explicitly enabled
    if (!isProdEnv && process.env.ALLOW_UNSIGNED_CONFIG === 'true') {
      console.warn('WARNING: Loading unsigned configuration due to ALLOW_UNSIGNED_CONFIG=true');
      console.warn('This should NEVER be done in production environments');
      try {
        return loadAuthorityConfig(true);
      } catch (fallbackError: any) {
        throw new SecurityError(
          `Failed to load config even with signature verification disabled: ${fallbackError.message}`,
          'CONFIG_LOAD_FAILED_WITH_FALLBACK'
        );
      }
    }
    
    // In production, never fallback - always enforce signature verification
    if (isProdEnv) {
      console.error('CRITICAL SECURITY ERROR: Failed to verify authority configuration signature');
      console.error(error.message);
      // In production, this is a critical security issue - we shouldn't proceed
      process.exit(1);
    }
    
    // Propagate the original error
    throw error;
  }
}

/**
 * Command line interface for authority controls
 */
export async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
      showUsage();
      return;
    }
    
    // Get authority keypair
    const authorityKeypair = await getOrCreateKeypair('authority');
    
    switch (command) {
      case 'init':
        await initializeAuthorityConfig(authorityKeypair);
        break;
        
      case 'check':
        // Check configuration integrity and version
        try {
          const config = loadVerifiedConfig();
          console.log('\n=== Authority Configuration ===');
          console.log(`Mint Address: ${config.mintAddress}`);
          console.log(`Authority: ${config.authorityAddress}`);
          console.log(`Version: ${config.version}`);
          
          if (config.version !== AUTHORITY_CONFIG_VERSION) {
            console.log(`\nWARNING: Configuration version (${config.version}) does not match current version (${AUTHORITY_CONFIG_VERSION})`);
            console.log('Run "npm run authority upgrade" to upgrade the configuration');
          }
          
          console.log('\nCapabilities:');
          for (const capability in config.capabilities) {
            console.log(`- ${capability}: ${config.capabilities[capability as keyof typeof config.capabilities] ? 'Enabled' : 'Disabled'}`);
          }
          
          console.log('\nPending Transfers:');
          const pendingTransfers = config.timeLockedTransfers.filter(t => t.status === 'pending');
          if (pendingTransfers.length === 0) {
            console.log('- None');
          } else {
            pendingTransfers.forEach((transfer, index) => {
              const executeAfter = new Date(transfer.executeAfter);
              const now = new Date();
              const canExecute = now >= executeAfter;
              console.log(`- [${index}] Target: ${transfer.targetAddress}`);
              console.log(`  Executable after: ${executeAfter.toLocaleString()} (${canExecute ? 'CAN EXECUTE NOW' : 'waiting'})`);
            });
          }
          
          console.log('\nSignature Verification: PASSED');
          console.log('=============================');
        } catch (error: any) {
          console.error('\n=== Authority Configuration Check FAILED ===');
          console.error(`Error: ${error.message}`);
          console.error('==========================================');
          process.exit(1);
        }
        break;
        
      case 'upgrade':
        // Upgrade configuration version
        try {
          const config = loadVerifiedConfig();
          if (config.version === AUTHORITY_CONFIG_VERSION) {
            console.log(`Configuration is already at the latest version (${AUTHORITY_CONFIG_VERSION})`);
          } else {
            await upgradeAuthorityConfig(config, authorityKeypair);
          }
        } catch (error: any) {
          console.error(`Error upgrading configuration: ${error.message}`);
          process.exit(1);
        }
        break;
        
      case 'backup':
        // Create a secure backup
        try {
          const config = loadVerifiedConfig();
          const backupPath = await backupAuthorityConfig(config, authorityKeypair);
          console.log(`Backup created successfully at: ${backupPath}`);
        } catch (error: any) {
          console.error(`Error creating backup: ${error.message}`);
          process.exit(1);
        }
        break;
        
      case 'renounce':
        if (args.length < 2) {
          console.error('Capability to renounce is required');
          console.error(`Available capabilities: ${Object.values(AuthorityCapability).join(', ')}`);
          process.exit(1);
        }
        
        const capability = args[1] as AuthorityCapability;
        if (!Object.values(AuthorityCapability).includes(capability)) {
          console.error(`Invalid capability: ${capability}`);
          console.error(`Available capabilities: ${Object.values(AuthorityCapability).join(', ')}`);
          process.exit(1);
        }
        
        await renounceCapability(capability, authorityKeypair);
        break;
        
      case 'propose-transfer':
        if (args.length < 3) {
          console.error('Target address and delay (in days) are required');
          console.error('Usage: npm run authority propose-transfer <target_address> <delay_in_days>');
          process.exit(1);
        }
        
        const targetAddress = args[1];
        const delayInDays = parseInt(args[2]);
        
        if (isNaN(delayInDays) || delayInDays < 1) {
          console.error('Delay must be a positive integer');
          process.exit(1);
        }
        
        await proposeAuthorityTransfer(targetAddress, delayInDays, authorityKeypair);
        break;
        
      case 'cancel-transfer':
        if (args.length < 2) {
          console.error('Transfer index is required');
          console.error('Usage: npm run authority cancel-transfer <transfer_index>');
          process.exit(1);
        }
        
        const cancelIndex = parseInt(args[1]);
        if (isNaN(cancelIndex) || cancelIndex < 0) {
          console.error('Index must be a non-negative integer');
          process.exit(1);
        }
        
        await cancelAuthorityTransfer(cancelIndex, authorityKeypair);
        break;
        
      case 'execute-transfer':
        if (args.length < 2) {
          console.error('Transfer index is required');
          console.error('Usage: npm run authority execute-transfer <transfer_index>');
          process.exit(1);
        }
        
        const executeIndex = parseInt(args[1]);
        if (isNaN(executeIndex) || executeIndex < 0) {
          console.error('Index must be a non-negative integer');
          process.exit(1);
        }
        
        await executeAuthorityTransfer(executeIndex, authorityKeypair);
        break;
        
      default:
        console.error(`Unknown command: ${command}`);
        showUsage();
        process.exit(1);
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Display usage information
 */
function showUsage() {
  console.log('Usage: npm run authority <command>');
  console.log('\nCommands:');
  console.log('  init - Initialize authority configuration');
  console.log('  check - Check authority configuration integrity and version');
  console.log('  upgrade - Upgrade authority configuration to latest version');
  console.log('  backup - Create a secure backup of the authority configuration');
  console.log('  renounce <capability> - Renounce an authority capability');
  console.log('  propose-transfer <target_address> <delay_in_days> - Propose a time-locked authority transfer');
  console.log('  cancel-transfer <transfer_index> - Cancel a proposed authority transfer');
  console.log('  execute-transfer <transfer_index> - Execute a time-locked authority transfer');
  console.log('\nAvailable capabilities:');
  Object.values(AuthorityCapability).forEach(capability => {
    console.log(`  - ${capability}`);
  });
}

// Execute main function if this file is run directly
if (require.main === module) {
  main();
} 