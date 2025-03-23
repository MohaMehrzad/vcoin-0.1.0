import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  transfer,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import {
  getConnection,
  getOrCreateKeypair,
  loadTokenMetadata,
  tokensToRawAmount,
  rawAmountToTokens,
  VESTING_RELEASE_AMOUNT,
  VESTING_RELEASE_INTERVAL_MONTHS,
} from './utils';

// Define interfaces for our data structures
export interface VestingRelease {
  releaseNumber: number;
  scheduledDate: string;
  amount: string;
  executed: boolean;
  executionDate: string | null;
  transactionId: string | null;
  targetWallet: string;
}

export interface VestingData {
  releases: VestingRelease[];
  totalReleased: number;
  nextReleaseDate: string | null;
  initialized: boolean;
  initializedAt?: string;
  presaleEndDate?: string;
  mintAddress: string;
  totalAmount: string;
}

// Vesting storage file
export const VESTING_DATA_PATH = path.resolve(process.cwd(), 'vesting-data.json');

// Load vesting data
export function loadVestingData(): VestingData {
  if (!fs.existsSync(VESTING_DATA_PATH)) {
    // Initial vesting schedule
    return {
      mintAddress: '',
      totalAmount: '0',
      releases: [],
      totalReleased: 0,
      nextReleaseDate: null,
      initialized: false,
    };
  }
  return JSON.parse(fs.readFileSync(VESTING_DATA_PATH, 'utf-8'));
}

// Save vesting data
export function saveVestingData(data: VestingData): void {
  fs.writeFileSync(VESTING_DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// Initialize vesting schedule based on presale end date
export async function initializeVesting(): Promise<VestingData> {
  // Check if presale data exists
  const PRESALE_DATA_PATH = path.resolve(process.cwd(), 'presale-data.json');
  if (!fs.existsSync(PRESALE_DATA_PATH)) {
    throw new Error('Presale data not found. Run presale first.');
  }
  
  const presaleData = JSON.parse(fs.readFileSync(PRESALE_DATA_PATH, 'utf-8'));
  
  if (!presaleData.endTime) {
    throw new Error('Presale has not ended yet. End presale first.');
  }
  
  const presaleEndDate = new Date(presaleData.endTime);
  let vestingData = loadVestingData();
  
  if (vestingData.initialized) {
    console.log('Vesting schedule already initialized.');
    return vestingData;
  }
  
  // Create vesting schedule
  const firstReleaseDate = new Date(presaleEndDate);
  
  // Schedule releases every VESTING_RELEASE_INTERVAL_MONTHS months
  const totalReleases = Number(VESTING_RELEASE_AMOUNT) === 0 ? 0 : Number(VESTING_RELEASE_AMOUNT) * 7; // 7 releases of 50M each
  const schedule: VestingRelease[] = [];
  
  for (let i = 0; i < 7; i++) {
    const releaseDate = new Date(firstReleaseDate);
    releaseDate.setMonth(releaseDate.getMonth() + i * VESTING_RELEASE_INTERVAL_MONTHS);
    
    schedule.push({
      releaseNumber: i + 1,
      scheduledDate: releaseDate.toISOString(),
      amount: VESTING_RELEASE_AMOUNT.toString(),
      executed: false,
      executionDate: null,
      transactionId: null,
      targetWallet: '',
    });
  }
  
  vestingData = {
    releases: schedule,
    totalReleased: 0,
    nextReleaseDate: schedule[0].scheduledDate,
    initialized: true,
    initializedAt: new Date().toISOString(),
    presaleEndDate: presaleEndDate.toISOString(),
    mintAddress: '',
    totalAmount: '',
  };
  
  saveVestingData(vestingData);
  console.log('Vesting schedule initialized successfully.');
  return vestingData;
}

/**
 * Executes a vesting release
 * @param {number} releaseNumber - The number of the release to execute
 * @returns {Promise<string>} The transaction signature
 * @throws {Error} If the release number is invalid or if there's an error executing the release
 */
export async function executeRelease(releaseNumber: number): Promise<string> {
  try {
    // Load vesting data
    const vestingData = loadVestingData();
    
    if (!vestingData.initialized) {
      throw new Error('Vesting schedule not initialized. Run "npm run vesting init" first.');
    }
    
    if (releaseNumber < 1 || releaseNumber > vestingData.releases.length) {
      throw new Error(`Invalid release number: ${releaseNumber}. Valid range: 1-${vestingData.releases.length}`);
    }
    
    const release = vestingData.releases[releaseNumber - 1];
    
    if (release.executed) {
      throw new Error(`Release #${releaseNumber} has already been executed on ${new Date(release.executionDate || '').toLocaleString()}`);
    }
    
    const now = new Date();
    const scheduledDate = new Date(release.scheduledDate);
    
    if (now < scheduledDate) {
      throw new Error(`Release #${releaseNumber} is scheduled for ${scheduledDate.toLocaleString()}`);
    }
    
    // Initialize connection
    const connection = getConnection();
    
    // Get keypairs
    const vestingWalletKeypair = await getOrCreateKeypair('vesting_wallet');
    
    // Get target wallet public key
    const targetWalletPublicKey = new PublicKey(release.targetWallet);
    
    // Get vesting token account
    const mintAddress = new PublicKey(vestingData.mintAddress);
    
    const vestingTokenAccount = await createAssociatedTokenAccountIdempotent(
      connection,
      vestingWalletKeypair,
      mintAddress,
      targetWalletPublicKey,
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    
    // Verify vesting wallet has sufficient balance first
    console.log(`Checking vesting wallet balance...`);
    try {
      const vestingAccount = await connection.getAccountInfo(vestingTokenAccount);
      
      // Check if account exists
      if (!vestingAccount) {
        throw new Error('Vesting token account not found');
      }
      
      // Convert release amount to raw tokens
      const releaseAmount = BigInt(release.amount);
      const rawAmount = tokensToRawAmount(releaseAmount);
      
      // Check if balance is sufficient
      if (BigInt(vestingAccount.lamports) < BigInt(rawAmount)) {
        throw new Error(
          `Insufficient balance in vesting wallet. ` +
          `Required: ${releaseAmount} VCN, Available: ${rawAmountToTokens(BigInt(vestingAccount.lamports))} VCN`
        );
      }
      
      console.log(`Vesting wallet has sufficient balance: ${rawAmountToTokens(BigInt(vestingAccount.lamports))} VCN`);
    } catch (error: any) {
      if (error.message.includes('TokenAccountNotFoundError')) {
        throw new Error(`Vesting token account not found. Please check the vesting setup.`);
      }
      throw error;
    }
    
    // Get target token account
    let targetTokenAccount: PublicKey;
    try {
      targetTokenAccount = await createAssociatedTokenAccountIdempotent(
        connection,
        vestingWalletKeypair,
        mintAddress,
        targetWalletPublicKey,
        { commitment: 'confirmed' },
        TOKEN_2022_PROGRAM_ID
      );
      
      // Check if target token account exists
      await connection.getAccountInfo(targetTokenAccount);
    } catch (error: any) {
      if (error.message.includes('TokenAccountNotFoundError')) {
        console.log(`Creating token account for target wallet...`);
        
        // Create token account for target wallet
        await createAssociatedTokenAccountIdempotent(
          connection,
          vestingWalletKeypair,
          mintAddress,
          targetWalletPublicKey,
          { commitment: 'confirmed' },
          TOKEN_2022_PROGRAM_ID
        );
        
        targetTokenAccount = await createAssociatedTokenAccountIdempotent(
          connection,
          vestingWalletKeypair,
          mintAddress,
          targetWalletPublicKey,
          { commitment: 'confirmed' },
          TOKEN_2022_PROGRAM_ID
        );
      } else {
        throw error;
      }
    }
    
    // Convert release amount to raw tokens
    const releaseAmount = BigInt(release.amount);
    const rawAmount = tokensToRawAmount(releaseAmount);
    
    console.log(`Executing release #${releaseNumber}: ${releaseAmount} VCN to ${release.targetWallet}`);
    
    // Transfer tokens
    const signature = await transfer(
      connection,
      vestingWalletKeypair,
      vestingTokenAccount,
      targetTokenAccount,
      vestingWalletKeypair.publicKey,
      BigInt(rawAmount),
      [],
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    
    // Update vesting data
    release.executed = true;
    release.executionDate = now.toISOString();
    release.transactionId = signature;
    
    vestingData.totalReleased += Number(releaseAmount);
    
    // Update next release date
    const nextReleaseIndex = vestingData.releases.findIndex((r: VestingRelease) => !r.executed);
    if (nextReleaseIndex !== -1) {
      vestingData.nextReleaseDate = vestingData.releases[nextReleaseIndex].scheduledDate;
    } else {
      vestingData.nextReleaseDate = null;
    }
    
    // Save updated vesting data
    saveVestingData(vestingData);
    
    console.log(`Release executed successfully. Transaction ID: ${signature}`);
    console.log(`Vesting progress: ${vestingData.totalReleased} / ${vestingData.totalAmount} VCN released`);
    
    return signature;
  } catch (error: any) {
    throw new Error(`Failed to execute release: ${error.message}`);
  }
}

// Check vesting status
export function checkVestingStatus(): void {
  console.log('\n===== VCoin Vesting Status =====');
  
  try {
    const vestingData = loadVestingData();
    
    if (!vestingData.initialized) {
      console.log('Vesting schedule has not been initialized yet.');
      console.log('Run npm run vesting init to set up the vesting schedule.');
      return;
    }
    
    console.log(`Initialized: ${vestingData.initialized}`);
    console.log(`Initialized at: ${vestingData.initializedAt}`);
    console.log(`Presale end date: ${vestingData.presaleEndDate}`);
    console.log(`Total released: ${vestingData.totalReleased} VCN`);
    console.log(`Next release date: ${vestingData.nextReleaseDate || 'All releases completed'}`);
    console.log('\nRelease Schedule:');
    
    vestingData.releases.forEach((release: VestingRelease, index: number) => {
      console.log(`[${index + 1}] ${new Date(release.scheduledDate).toISOString()} - ${release.amount} VCN - ${release.executed ? 'Executed' : 'Pending'}`);
    });
    
    console.log('================================');
  } catch (error) {
    console.error('Error checking vesting status:', error);
  }
}

/**
 * Display usage information
 */
function showUsage(): void {
  console.log('Available commands:');
  console.log('  npm run vesting init - Initialize vesting schedule');
  console.log('  npm run vesting release <release_index> - Execute a vesting release');
  console.log('  npm run vesting status - Check vesting status');
}

// Command line interface
export async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command) {
      showUsage();
      return;
    }
    
    switch (command) {
      case 'init':
        await initializeVesting();
        break;
      case 'release':
        if (args.length < 2) {
          console.error('Usage: npm run vesting release <release_index>');
          process.exit(1);
        }
        const releaseNumber = parseInt(args[1], 10);
        if (isNaN(releaseNumber)) {
          console.error('Error: Release number must be a valid integer');
          process.exit(1);
        }
        await executeRelease(releaseNumber);
        break;
      case 'status':
        checkVestingStatus();
        break;
      default:
        showUsage();
        break;
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Only execute if this file is run directly
if (require.main === module) {
  main();
} 