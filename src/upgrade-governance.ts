import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateKeypair, loadTokenMetadata, handleError } from './utils';
import * as os from 'os'; // Add OS module for host information

// Constants
const UPGRADE_GOVERNANCE_PATH = path.resolve(process.cwd(), 'upgrade-governance.json');
const GOVERNANCE_AUDIT_LOG_PATH = path.resolve(process.cwd(), 'governance-audit.log');

// Types
type UpgradeStatus = 'proposed' | 'approved' | 'executed' | 'rejected';

interface UpgradeProposal {
  id: string;
  proposedBy: string;
  proposedAt: string;
  executeAfter: string;
  description: string;
  isEmergency: boolean; // New field to flag emergency proposals
  files: {
    path: string;
    checksum: string;
  }[];
  votes: {
    address: string;
    approved: boolean;
    timestamp: string;
    signature?: string;
    votedBy?: string;
  }[];
  status: UpgradeStatus;
  executedAt?: string;
  rejectedAt?: string;
}

interface UpgradeGovernance {
  mintAddress: string;
  authorityAddress: string;
  threshold: number;
  emergencyThreshold: number; // New field for emergency proposal threshold
  timelock: number; // Time in days before an approved upgrade can be executed
  emergencyTimelock: number; // New field for emergency proposal timelock
  council: string[]; // Array of public keys that can vote on upgrades
  delegations: { [memberAddress: string]: { delegateTo: string; expiresAt: string } }; // Delegations
  proposals: UpgradeProposal[];
  lastModified: string;
  signature?: string;
}

// Audit log entry structure
interface AuditLogEntry {
  timestamp: string;
  action: string;
  actor: string;
  details: string;
  metadata?: Record<string, any>;
}

/**
 * Log an action to the audit log
 * @param action The action being performed
 * @param actor The public key of the actor
 * @param details Details about the action
 * @param metadata Additional metadata
 */
function logAuditAction(
  action: string,
  actor: string,
  details: string,
  metadata?: Record<string, any>
): void {
  try {
    // Create log entry
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      actor,
      details,
      metadata: {
        ...metadata,
        hostname: os.hostname(),
        platform: os.platform(),
        networkInterfaces: Object.keys(os.networkInterfaces()).length
      }
    };
    
    // Format as JSON string with newline
    const logLine = JSON.stringify(entry) + '\n';
    
    // Append to log file
    fs.appendFileSync(GOVERNANCE_AUDIT_LOG_PATH, logLine, {
      encoding: 'utf-8',
      mode: 0o640 // Read/write for owner, read for group
    });
  } catch (error) {
    console.error('Failed to write to audit log:', error);
    // Continue execution even if logging fails
  }
}

/**
 * Initialize upgrade governance
 * @param authorityKeypair Authority keypair
 * @param councilAddresses Array of council member addresses
 * @param threshold Number of votes required to approve an upgrade
 * @param timelock Time in days before an approved upgrade can be executed
 * @param emergencyThreshold Number of votes required for emergency upgrades
 * @param emergencyTimelock Time in days for emergency upgrades
 */
export async function initializeUpgradeGovernance(
  authorityKeypair: Keypair,
  councilAddresses: string[],
  threshold: number,
  timelock: number,
  emergencyThreshold?: number,
  emergencyTimelock?: number
): Promise<void> {
  try {
    // Load token metadata
    const tokenMetadata = loadTokenMetadata(authorityKeypair.publicKey);
    
    // Validate council addresses
    const validatedCouncil: string[] = [];
    for (const address of councilAddresses) {
      try {
        new PublicKey(address);
        validatedCouncil.push(address);
      } catch (error) {
        console.warn(`Skipping invalid council address: ${address}`);
      }
    }
    
    if (validatedCouncil.length === 0) {
      throw new Error('At least one valid council address is required');
    }
    
    // Validate threshold
    if (threshold <= 0 || threshold > validatedCouncil.length) {
      throw new Error(`Threshold must be between 1 and ${validatedCouncil.length}`);
    }
    
    // Validate timelock
    if (timelock < 1) {
      throw new Error('Timelock must be at least 1 day');
    }
    
    // Set emergency values with defaults if not provided
    if (!emergencyThreshold) {
      // Default to 2/3 of council (rounded up) with a minimum of threshold
      emergencyThreshold = Math.max(threshold, Math.ceil(validatedCouncil.length * 2/3));
    }
    
    if (emergencyThreshold > validatedCouncil.length) {
      emergencyThreshold = validatedCouncil.length; // Cannot be more than total council members
    }
    
    if (!emergencyTimelock) {
      // Default to 1 day or 1/3 of regular timelock, whichever is greater
      emergencyTimelock = Math.max(1, Math.ceil(timelock / 3));
    }
    
    // Create governance structure
    const governance: UpgradeGovernance = {
      mintAddress: tokenMetadata.mintAddress,
      authorityAddress: authorityKeypair.publicKey.toString(),
      threshold,
      emergencyThreshold,
      timelock,
      emergencyTimelock,
      council: validatedCouncil,
      delegations: {}, // Initialize empty delegations
      proposals: [],
      lastModified: new Date().toISOString()
    };
    
    // Sign and save
    const message = JSON.stringify(governance, null, 2);
    const signature = crypto.sign('sha256', Buffer.from(message), Buffer.from(authorityKeypair.secretKey.slice(0, 32)));
    
    const governanceWithSignature = {
      ...governance,
      signature: signature.toString('base64')
    };
    
    fs.writeFileSync(
      UPGRADE_GOVERNANCE_PATH,
      JSON.stringify(governanceWithSignature, null, 2),
      { encoding: 'utf-8', mode: 0o640 }
    );
    
    // Log action to audit log
    logAuditAction(
      'INITIALIZE_GOVERNANCE',
      authorityKeypair.publicKey.toString(),
      'Upgrade governance initialized',
      {
        councilMembers: validatedCouncil,
        threshold,
        emergencyThreshold,
        timelock,
        emergencyTimelock
      }
    );
    
    console.log('Upgrade governance initialized successfully');
    console.log(`Council members: ${validatedCouncil.length}`);
    console.log(`Regular approval threshold: ${threshold}`);
    console.log(`Emergency approval threshold: ${emergencyThreshold}`);
    console.log(`Regular timelock period: ${timelock} days`);
    console.log(`Emergency timelock period: ${emergencyTimelock} days`);
    
  } catch (error: any) {
    handleError(`Failed to initialize upgrade governance: ${error.message}`, error);
  }
}

/**
 * Load upgrade governance configuration
 */
export function loadUpgradeGovernance(): UpgradeGovernance {
  if (!fs.existsSync(UPGRADE_GOVERNANCE_PATH)) {
    throw new Error('Upgrade governance not initialized');
  }
  
  try {
    const data = fs.readFileSync(UPGRADE_GOVERNANCE_PATH, 'utf-8');
    return JSON.parse(data) as UpgradeGovernance;
  } catch (error: any) {
    throw new Error(`Failed to load upgrade governance: ${error.message}`);
  }
}

/**
 * Save upgrade governance configuration
 */
function saveUpgradeGovernance(governance: UpgradeGovernance, authorityKeypair: Keypair): void {
  try {
    // Update timestamp
    governance.lastModified = new Date().toISOString();
    
    // Remove signature for signing
    const governanceWithoutSignature = { ...governance };
    delete governanceWithoutSignature.signature;
    
    // Sign
    const message = JSON.stringify(governanceWithoutSignature, null, 2);
    const signature = crypto.sign('sha256', Buffer.from(message), Buffer.from(authorityKeypair.secretKey.slice(0, 32)));
    
    // Add signature back
    const governanceWithSignature = {
      ...governanceWithoutSignature,
      signature: signature.toString('base64')
    };
    
    // Save
    fs.writeFileSync(
      UPGRADE_GOVERNANCE_PATH,
      JSON.stringify(governanceWithSignature, null, 2),
      { encoding: 'utf-8', mode: 0o640 }
    );
    
  } catch (error: any) {
    throw new Error(`Failed to save upgrade governance: ${error.message}`);
  }
}

/**
 * Check if an address is a council member
 */
export function isCouncilMember(address: string): boolean {
  try {
    const governance = loadUpgradeGovernance();
    return governance.council.includes(address);
  } catch (error) {
    return false;
  }
}

/**
 * Propose an upgrade
 * @param proposerKeypair Keypair of the proposer
 * @param description Description of the upgrade
 * @param filePaths Paths of files to be upgraded
 * @param executeAfterDays Days after which the upgrade can be executed if approved
 */
export async function proposeUpgrade(
  proposerKeypair: Keypair,
  description: string,
  filePaths: string[],
  executeAfterDays: number = 0
): Promise<void> {
  try {
    const governance = loadUpgradeGovernance();
    
    // Verify proposer is a council member
    const proposerAddress = proposerKeypair.publicKey.toString();
    if (!governance.council.includes(proposerAddress)) {
      throw new Error('Only council members can propose upgrades');
    }
    
    // Validate execute after days
    if (executeAfterDays < governance.timelock) {
      executeAfterDays = governance.timelock;
      console.log(`Execute after days adjusted to minimum timelock of ${governance.timelock} days`);
    }
    
    // Calculate execute after date
    const executeAfter = new Date();
    executeAfter.setDate(executeAfter.getDate() + executeAfterDays);
    
    // Validate and calculate checksums for files
    const files: { path: string; checksum: string }[] = [];
    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');
      
      files.push({
        path: filePath,
        checksum
      });
    }
    
    // Create proposal
    const proposal: UpgradeProposal = {
      id: crypto.randomBytes(16).toString('hex'),
      proposedBy: proposerAddress,
      proposedAt: new Date().toISOString(),
      executeAfter: executeAfter.toISOString(),
      description,
      isEmergency: false,
      files,
      votes: [{
        address: proposerAddress,
        approved: true,
        timestamp: new Date().toISOString()
      }],
      status: 'proposed'
    };
    
    // Add to governance
    governance.proposals.push(proposal);
    
    // Save governance
    saveUpgradeGovernance(governance, proposerKeypair);
    
    // Log action to audit log
    logAuditAction(
      'PROPOSE_UPGRADE',
      proposerAddress,
      `Proposed upgrade: ${description}`,
      {
        proposalId: proposal.id,
        files: files.map(f => f.path),
        executeAfter: executeAfter.toISOString()
      }
    );
    
    console.log(`Upgrade proposal created successfully. ID: ${proposal.id}`);
    console.log(`Description: ${description}`);
    console.log(`Files: ${files.map(f => f.path).join(', ')}`);
    console.log(`Executable after: ${executeAfter.toLocaleString()}`);
    console.log(`Initial approval: 1/${governance.threshold}`);
    
  } catch (error: any) {
    handleError(`Failed to propose upgrade: ${error.message}`, error);
  }
}

/**
 * Propose an emergency upgrade
 * @param proposerKeypair Keypair of the proposer
 * @param description Description of the upgrade
 * @param filePaths Paths of files to be upgraded
 * @param justification Justification for emergency status
 */
export async function proposeEmergencyUpgrade(
  proposerKeypair: Keypair,
  description: string,
  filePaths: string[],
  justification: string
): Promise<void> {
  try {
    const governance = loadUpgradeGovernance();
    
    // Verify proposer is a council member
    const proposerAddress = proposerKeypair.publicKey.toString();
    if (!governance.council.includes(proposerAddress)) {
      throw new Error('Only council members can propose upgrades');
    }
    
    // Calculate execute after date using emergency timelock
    const executeAfter = new Date();
    executeAfter.setDate(executeAfter.getDate() + governance.emergencyTimelock);
    
    // Validate and calculate checksums for files
    const files: { path: string; checksum: string }[] = [];
    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');
      
      files.push({
        path: filePath,
        checksum
      });
    }
    
    // Create proposal with emergency flag
    const proposal: UpgradeProposal = {
      id: crypto.randomBytes(16).toString('hex'),
      proposedBy: proposerAddress,
      proposedAt: new Date().toISOString(),
      executeAfter: executeAfter.toISOString(),
      description: `EMERGENCY: ${description}\n\nJustification: ${justification}`,
      isEmergency: true,
      files,
      votes: [{
        address: proposerAddress,
        approved: true,
        timestamp: new Date().toISOString()
      }],
      status: 'proposed'
    };
    
    // Add to governance
    governance.proposals.push(proposal);
    
    // Save governance
    saveUpgradeGovernance(governance, proposerKeypair);
    
    // Log action to audit log
    logAuditAction(
      'PROPOSE_EMERGENCY_UPGRADE',
      proposerAddress,
      `Proposed emergency upgrade: ${description}`,
      {
        proposalId: proposal.id,
        files: files.map(f => f.path),
        justification,
        executeAfter: executeAfter.toISOString()
      }
    );
    
    console.log(`EMERGENCY upgrade proposal created. ID: ${proposal.id}`);
    console.log(`Description: ${description}`);
    console.log(`Justification: ${justification}`);
    console.log(`Files: ${files.map(f => f.path).join(', ')}`);
    console.log(`Executable after: ${executeAfter.toLocaleString()} (${governance.emergencyTimelock} days)`);
    console.log(`Approval threshold: ${governance.emergencyThreshold} votes required`);
    console.log(`Initial approval: 1/${governance.emergencyThreshold}`);
    
  } catch (error: any) {
    handleError(`Failed to propose emergency upgrade: ${error.message}`, error);
  }
}

/**
 * Check if an address is authorized to vote for a council member
 * (either the council member themselves or a valid delegate)
 * @param governance Governance configuration
 * @param voterAddress Address attempting to vote
 * @returns The council member address they can vote for, or null if unauthorized
 */
function getAuthorizedCouncilMember(governance: UpgradeGovernance, voterAddress: string): string | null {
  // If they're a council member, they can vote as themselves
  if (governance.council.includes(voterAddress)) {
    return voterAddress;
  }
  
  // Check if they're a delegate for any council member
  const now = new Date();
  
  for (const [memberAddress, delegation] of Object.entries(governance.delegations)) {
    if (
      delegation.delegateTo === voterAddress && 
      new Date(delegation.expiresAt) > now
    ) {
      return memberAddress;
    }
  }
  
  // Not authorized to vote
  return null;
}

/**
 * Vote on an upgrade proposal
 * @param voterKeypair Keypair of the voter
 * @param proposalId ID of the proposal
 * @param approved Whether the voter approves the proposal
 */
export async function voteOnProposal(
  voterKeypair: Keypair,
  proposalId: string,
  approved: boolean
): Promise<void> {
  try {
    const governance = loadUpgradeGovernance();
    
    // Verify voter authorization
    const voterAddress = voterKeypair.publicKey.toString();
    
    // This will return either their own address if they're a council member,
    // or the council member address they're a delegate for
    const councilMemberAddress = getAuthorizedCouncilMember(governance, voterAddress);
    
    if (!councilMemberAddress) {
      throw new Error('Only council members or their delegates can vote on upgrades');
    }
    
    // Find proposal
    const proposalIndex = governance.proposals.findIndex(p => p.id === proposalId);
    if (proposalIndex === -1) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }
    
    const proposal = governance.proposals[proposalIndex];
    
    // Check if proposal is still open for voting
    if (proposal.status !== 'proposed') {
      throw new Error(`Proposal is not open for voting (status: ${proposal.status})`);
    }
    
    // Check if this council member has already voted
    const existingVoteIndex = proposal.votes.findIndex(v => v.address === councilMemberAddress);
    
    // Build vote record with delegation info if applicable
    const voteRecord = {
      address: councilMemberAddress,
      approved,
      timestamp: new Date().toISOString(),
      votedBy: voterAddress !== councilMemberAddress ? voterAddress : undefined
    };
    
    if (existingVoteIndex !== -1) {
      // Update existing vote
      proposal.votes[existingVoteIndex] = voteRecord;
      
      console.log(`Vote updated for proposal ${proposalId}`);
      
      // Log action to audit log
      logAuditAction(
        'UPDATE_VOTE',
        voterAddress,
        `Updated vote to ${approved ? 'approve' : 'reject'} for proposal ${proposalId}${
          voterAddress !== councilMemberAddress ? ` as delegate for ${councilMemberAddress}` : ''
        }`,
        {
          proposalId,
          approved,
          isEmergency: proposal.isEmergency,
          onBehalfOf: voterAddress !== councilMemberAddress ? councilMemberAddress : undefined
        }
      );
    } else {
      // Add new vote
      proposal.votes.push(voteRecord);
      
      console.log(`Vote recorded for proposal ${proposalId}`);
      
      // Log action to audit log
      logAuditAction(
        'CAST_VOTE',
        voterAddress,
        `Voted to ${approved ? 'approve' : 'reject'} proposal ${proposalId}${
          voterAddress !== councilMemberAddress ? ` as delegate for ${councilMemberAddress}` : ''
        }`,
        {
          proposalId,
          approved,
          isEmergency: proposal.isEmergency,
          onBehalfOf: voterAddress !== councilMemberAddress ? councilMemberAddress : undefined
        }
      );
    }
    
    // Check if proposal has reached threshold
    const approvalVotes = proposal.votes.filter(v => v.approved).length;
    const rejectionVotes = proposal.votes.filter(v => !v.approved).length;
    
    // Determine the threshold based on whether this is an emergency proposal
    const requiredThreshold = proposal.isEmergency 
      ? governance.emergencyThreshold 
      : governance.threshold;
    
    console.log(`Current votes: ${approvalVotes} approve, ${rejectionVotes} reject`);
    console.log(`Threshold for approval: ${requiredThreshold}`);
    
    // Check for approval
    if (approvalVotes >= requiredThreshold) {
      proposal.status = 'approved';
      console.log(`Proposal ${proposalId} has been approved`);
      
      // Log action to audit log
      logAuditAction(
        'PROPOSAL_APPROVED',
        voterAddress,
        `Proposal ${proposalId} has reached approval threshold`,
        {
          proposalId,
          approvalVotes,
          rejectionVotes,
          threshold: requiredThreshold,
          isEmergency: proposal.isEmergency
        }
      );
    }
    
    // Check for rejection (if more than half of council rejects)
    if (rejectionVotes > governance.council.length / 2) {
      proposal.status = 'rejected';
      proposal.rejectedAt = new Date().toISOString();
      console.log(`Proposal ${proposalId} has been rejected`);
      
      // Log action to audit log
      logAuditAction(
        'PROPOSAL_REJECTED',
        voterAddress,
        `Proposal ${proposalId} has been rejected`,
        {
          proposalId,
          approvalVotes,
          rejectionVotes,
          isEmergency: proposal.isEmergency
        }
      );
    }
    
    // Save governance
    saveUpgradeGovernance(governance, voterKeypair);
    
  } catch (error: any) {
    handleError(`Failed to vote on proposal: ${error.message}`, error);
  }
}

/**
 * Execute an approved upgrade proposal
 * @param executorKeypair Keypair of the executor
 * @param proposalId ID of the proposal
 */
export async function executeProposal(
  executorKeypair: Keypair,
  proposalId: string
): Promise<void> {
  try {
    const governance = loadUpgradeGovernance();
    
    // Verify executor is a council member
    const executorAddress = executorKeypair.publicKey.toString();
    if (!governance.council.includes(executorAddress)) {
      throw new Error('Only council members can execute upgrades');
    }
    
    // Find proposal
    const proposalIndex = governance.proposals.findIndex(p => p.id === proposalId);
    if (proposalIndex === -1) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }
    
    const proposal = governance.proposals[proposalIndex];
    
    // Check if proposal is approved
    if (proposal.status !== 'approved') {
      throw new Error(`Proposal is not approved (status: ${proposal.status})`);
    }
    
    // Check if execute after date has passed
    const executeAfter = new Date(proposal.executeAfter);
    const now = new Date();
    
    if (now < executeAfter) {
      const timeRemaining = Math.ceil((executeAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      throw new Error(
        `Proposal cannot be executed yet. Executable after ${executeAfter.toLocaleString()} ` +
        `(${timeRemaining} days remaining)`
      );
    }
    
    // Verify file checksums
    for (const file of proposal.files) {
      if (!fs.existsSync(file.path)) {
        throw new Error(`File not found: ${file.path}`);
      }
      
      const fileContent = fs.readFileSync(file.path, 'utf-8');
      const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');
      
      if (checksum !== file.checksum) {
        throw new Error(
          `File checksum mismatch for ${file.path}. ` +
          `Expected: ${file.checksum}, Actual: ${checksum}`
        );
      }
    }
    
    // Mark proposal as executed
    proposal.status = 'executed';
    proposal.executedAt = new Date().toISOString();
    
    // Save governance
    saveUpgradeGovernance(governance, executorKeypair);
    
    // Log action to audit log
    logAuditAction(
      'EXECUTE_PROPOSAL',
      executorAddress,
      `Executed proposal ${proposalId}`,
      {
        proposalId,
        files: proposal.files.map(f => f.path),
        isEmergency: proposal.isEmergency
      }
    );
    
    console.log(`Proposal ${proposalId} has been executed successfully`);
    console.log(`Files verified: ${proposal.files.map(f => f.path).join(', ')}`);
    
  } catch (error: any) {
    handleError(`Failed to execute proposal: ${error.message}`, error);
  }
}

/**
 * List all upgrade proposals
 */
export function listProposals(): void {
  try {
    const governance = loadUpgradeGovernance();
    
    console.log('===== VCoin Upgrade Governance =====');
    console.log(`Mint Address: ${governance.mintAddress}`);
    console.log(`Council: ${governance.council.length} members`);
    console.log(`Regular Threshold: ${governance.threshold} approvals required`);
    console.log(`Emergency Threshold: ${governance.emergencyThreshold} approvals required`);
    console.log(`Regular Timelock: ${governance.timelock} days`);
    console.log(`Emergency Timelock: ${governance.emergencyTimelock} days`);
    console.log('\nProposals:');
    
    if (governance.proposals.length === 0) {
      console.log('No proposals found.');
      return;
    }
    
    // Sort by proposed date, newest first
    const sortedProposals = [...governance.proposals].sort(
      (a, b) => new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime()
    );
    
    for (const proposal of sortedProposals) {
      console.log(`\nID: ${proposal.id}`);
      console.log(`Status: ${proposal.status.toUpperCase()}`);
      console.log(`Type: ${proposal.isEmergency ? 'EMERGENCY' : 'Regular'}`);
      console.log(`Proposed by: ${proposal.proposedBy}`);
      console.log(`Proposed at: ${new Date(proposal.proposedAt).toLocaleString()}`);
      console.log(`Description: ${proposal.description}`);
      
      // Show execution date for executed proposals
      if (proposal.status === 'executed' && proposal.executedAt) {
        console.log(`Executed at: ${new Date(proposal.executedAt).toLocaleString()}`);
      }
      
      // Show rejection date for rejected proposals
      if (proposal.status === 'rejected' && proposal.rejectedAt) {
        console.log(`Rejected at: ${new Date(proposal.rejectedAt).toLocaleString()}`);
      }
      
      // Show executable date for proposed or approved proposals
      if (['proposed', 'approved'].includes(proposal.status)) {
        console.log(`Executable after: ${new Date(proposal.executeAfter).toLocaleString()}`);
      }
      
      // Show files
      console.log('Files:');
      for (const file of proposal.files) {
        console.log(`- ${file.path}`);
      }
      
      // Show votes with delegation info
      const approvalVotes = proposal.votes.filter(v => v.approved).length;
      const rejectionVotes = proposal.votes.filter(v => !v.approved).length;
      const requiredThreshold = proposal.isEmergency 
        ? governance.emergencyThreshold 
        : governance.threshold;
      console.log(`Votes: ${approvalVotes} approve, ${rejectionVotes} reject (threshold: ${requiredThreshold})`);
      
      // If there are votes with delegation, show them
      const votesWithDelegation = proposal.votes.filter(v => v.votedBy);
      if (votesWithDelegation.length > 0) {
        console.log('  Delegated votes:');
        votesWithDelegation.forEach(vote => {
          console.log(`  - ${vote.address} (voted by ${vote.votedBy}): ${vote.approved ? 'Approve' : 'Reject'}`);
        });
      }
    }
    
    console.log('====================================');
    
  } catch (error: any) {
    if (error.message.includes('not initialized')) {
      console.log('Upgrade governance not initialized yet.');
      console.log('Run "npm run upgrade init" to initialize.');
    } else {
      console.error(`Error: ${error.message}`);
    }
  }
}

/**
 * Add a council member
 * @param authorityKeypair Authority keypair
 * @param memberAddress Address of the new council member
 */
export async function addCouncilMember(
  authorityKeypair: Keypair,
  memberAddress: string
): Promise<void> {
  try {
    const governance = loadUpgradeGovernance();
    
    // Verify authority
    if (governance.authorityAddress !== authorityKeypair.publicKey.toString()) {
      throw new Error('Only the authority can modify the council');
    }
    
    // Validate address
    try {
      new PublicKey(memberAddress);
    } catch (error) {
      throw new Error(`Invalid address: ${memberAddress}`);
    }
    
    // Check if already a member
    if (governance.council.includes(memberAddress)) {
      console.log(`${memberAddress} is already a council member`);
      return;
    }
    
    // Add to council
    governance.council.push(memberAddress);
    
    // Save governance
    saveUpgradeGovernance(governance, authorityKeypair);
    
    // Log action to audit log
    logAuditAction(
      'ADD_COUNCIL_MEMBER',
      authorityKeypair.publicKey.toString(),
      `Added ${memberAddress} to council`,
      {
        memberAddress,
        totalMembers: governance.council.length
      }
    );
    
    console.log(`Added ${memberAddress} to the upgrade governance council`);
    console.log(`Council now has ${governance.council.length} members`);
    
  } catch (error: any) {
    handleError(`Failed to add council member: ${error.message}`, error);
  }
}

/**
 * Remove a council member
 * @param authorityKeypair Authority keypair
 * @param memberAddress Address of the council member to remove
 */
export async function removeCouncilMember(
  authorityKeypair: Keypair,
  memberAddress: string
): Promise<void> {
  try {
    const governance = loadUpgradeGovernance();
    
    // Verify authority
    if (governance.authorityAddress !== authorityKeypair.publicKey.toString()) {
      throw new Error('Only the authority can modify the council');
    }
    
    // Check if member exists
    if (!governance.council.includes(memberAddress)) {
      console.log(`${memberAddress} is not a council member`);
      return;
    }
    
    // Check if removing would make threshold impossible
    if (governance.council.length <= governance.threshold) {
      throw new Error(
        `Cannot remove council member. Current threshold (${governance.threshold}) ` +
        `would be impossible to reach with ${governance.council.length - 1} members.`
      );
    }
    
    // Remove from council
    governance.council = governance.council.filter(m => m !== memberAddress);
    
    // Save governance
    saveUpgradeGovernance(governance, authorityKeypair);
    
    // Log action to audit log
    logAuditAction(
      'REMOVE_COUNCIL_MEMBER',
      authorityKeypair.publicKey.toString(),
      `Removed ${memberAddress} from council`,
      {
        memberAddress,
        totalMembers: governance.council.length
      }
    );
    
    console.log(`Removed ${memberAddress} from the upgrade governance council`);
    console.log(`Council now has ${governance.council.length} members`);
    
  } catch (error: any) {
    handleError(`Failed to remove council member: ${error.message}`, error);
  }
}

/**
 * Update the approval threshold
 * @param authorityKeypair Authority keypair
 * @param threshold New threshold
 */
export async function updateThreshold(
  authorityKeypair: Keypair,
  threshold: number
): Promise<void> {
  try {
    const governance = loadUpgradeGovernance();
    
    // Verify authority
    if (governance.authorityAddress !== authorityKeypair.publicKey.toString()) {
      throw new Error('Only the authority can modify the threshold');
    }
    
    // Validate threshold
    if (threshold <= 0 || threshold > governance.council.length) {
      throw new Error(`Threshold must be between 1 and ${governance.council.length}`);
    }
    
    // Update threshold
    const oldThreshold = governance.threshold;
    governance.threshold = threshold;
    
    // Save governance
    saveUpgradeGovernance(governance, authorityKeypair);
    
    // Log action to audit log
    logAuditAction(
      'UPDATE_THRESHOLD',
      authorityKeypair.publicKey.toString(),
      `Updated approval threshold from ${oldThreshold} to ${threshold}`,
      {
        oldThreshold,
        newThreshold: threshold
      }
    );
    
    console.log(`Updated approval threshold to ${threshold}`);
    
  } catch (error: any) {
    handleError(`Failed to update threshold: ${error.message}`, error);
  }
}

/**
 * Update the timelock period
 * @param authorityKeypair Authority keypair
 * @param timelock New timelock period in days
 */
export async function updateTimelock(
  authorityKeypair: Keypair,
  timelock: number
): Promise<void> {
  try {
    const governance = loadUpgradeGovernance();
    
    // Verify authority
    if (governance.authorityAddress !== authorityKeypair.publicKey.toString()) {
      throw new Error('Only the authority can modify the timelock');
    }
    
    // Validate timelock
    if (timelock < 1) {
      throw new Error('Timelock must be at least 1 day');
    }
    
    // Update timelock
    const oldTimelock = governance.timelock;
    governance.timelock = timelock;
    
    // Save governance
    saveUpgradeGovernance(governance, authorityKeypair);
    
    // Log action to audit log
    logAuditAction(
      'UPDATE_TIMELOCK',
      authorityKeypair.publicKey.toString(),
      `Updated timelock period from ${oldTimelock} to ${timelock} days`,
      {
        oldTimelock,
        newTimelock: timelock
      }
    );
    
    console.log(`Updated timelock period to ${timelock} days`);
    
  } catch (error: any) {
    handleError(`Failed to update timelock: ${error.message}`, error);
  }
}

/**
 * Update the emergency approval threshold
 * @param authorityKeypair Authority keypair
 * @param threshold New threshold
 */
export async function updateEmergencyThreshold(
  authorityKeypair: Keypair,
  threshold: number
): Promise<void> {
  try {
    const governance = loadUpgradeGovernance();
    
    // Verify authority
    if (governance.authorityAddress !== authorityKeypair.publicKey.toString()) {
      throw new Error('Only the authority can modify the threshold');
    }
    
    // Validate threshold
    if (threshold <= 0 || threshold > governance.council.length) {
      throw new Error(`Threshold must be between 1 and ${governance.council.length}`);
    }
    
    // Update threshold
    const oldThreshold = governance.emergencyThreshold;
    governance.emergencyThreshold = threshold;
    
    // Save governance
    saveUpgradeGovernance(governance, authorityKeypair);
    
    // Log action to audit log
    logAuditAction(
      'UPDATE_EMERGENCY_THRESHOLD',
      authorityKeypair.publicKey.toString(),
      `Updated emergency threshold from ${oldThreshold} to ${threshold}`,
      {
        oldThreshold,
        newThreshold: threshold
      }
    );
    
    console.log(`Updated emergency approval threshold to ${threshold}`);
    
  } catch (error: any) {
    handleError(`Failed to update emergency threshold: ${error.message}`, error);
  }
}

/**
 * Update the emergency timelock period
 * @param authorityKeypair Authority keypair
 * @param timelock New timelock period in days
 */
export async function updateEmergencyTimelock(
  authorityKeypair: Keypair,
  timelock: number
): Promise<void> {
  try {
    const governance = loadUpgradeGovernance();
    
    // Verify authority
    if (governance.authorityAddress !== authorityKeypair.publicKey.toString()) {
      throw new Error('Only the authority can modify the timelock');
    }
    
    // Validate timelock
    if (timelock < 1) {
      throw new Error('Emergency timelock must be at least 1 day');
    }
    
    // Update timelock
    const oldTimelock = governance.emergencyTimelock;
    governance.emergencyTimelock = timelock;
    
    // Save governance
    saveUpgradeGovernance(governance, authorityKeypair);
    
    // Log action to audit log
    logAuditAction(
      'UPDATE_EMERGENCY_TIMELOCK',
      authorityKeypair.publicKey.toString(),
      `Updated emergency timelock from ${oldTimelock} to ${timelock} days`,
      {
        oldTimelock,
        newTimelock: timelock
      }
    );
    
    console.log(`Updated emergency timelock period to ${timelock} days`);
    
  } catch (error: any) {
    handleError(`Failed to update emergency timelock: ${error.message}`, error);
  }
}

/**
 * Display the governance audit log
 * @param limit Number of entries to display (default: 20)
 */
export function showAuditLog(limit: number = 20): void {
  try {
    if (!fs.existsSync(GOVERNANCE_AUDIT_LOG_PATH)) {
      console.log('No audit log found.');
      return;
    }
    
    // Read log file
    const logData = fs.readFileSync(GOVERNANCE_AUDIT_LOG_PATH, 'utf-8');
    const logLines = logData.trim().split('\n');
    
    // Parse and format entries
    console.log('===== Governance Audit Log =====');
    
    // Get last N entries (most recent first)
    const entries = logLines
      .map(line => {
        try {
          return JSON.parse(line) as AuditLogEntry;
        } catch {
          return null;
        }
      })
      .filter(entry => entry !== null)
      .reverse()
      .slice(0, limit);
    
    if (entries.length === 0) {
      console.log('No valid log entries found.');
      return;
    }
    
    entries.forEach((entry, i) => {
      if (!entry) return;
      
      const date = new Date(entry.timestamp).toLocaleString();
      console.log(`[${date}] ${entry.action} by ${entry.actor}`);
      console.log(`  ${entry.details}`);
      
      if (entry.metadata) {
        // Display relevant metadata without system info
        const { hostname, platform, networkInterfaces, ...relevantMeta } = entry.metadata;
        if (Object.keys(relevantMeta).length > 0) {
          console.log('  Details:');
          Object.entries(relevantMeta).forEach(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
              console.log(`    ${key}: ${JSON.stringify(value)}`);
            } else {
              console.log(`    ${key}: ${value}`);
            }
          });
        }
      }
      
      if (i < entries.length - 1) {
        console.log('-'.repeat(40));
      }
    });
    
    console.log('================================');
    
    // Show total count
    console.log(`\nDisplaying ${entries.length} of ${logLines.length} log entries.`);
    console.log(`Full log available at: ${GOVERNANCE_AUDIT_LOG_PATH}`);
    
  } catch (error: any) {
    console.error(`Error displaying audit log: ${error.message}`);
  }
}

/**
 * Delegate voting rights to another address
 * @param councilKeypair Keypair of the council member
 * @param delegateAddress Address to delegate to
 * @param durationDays Number of days the delegation is valid for
 */
export async function delegateVoting(
  councilKeypair: Keypair,
  delegateAddress: string,
  durationDays: number
): Promise<void> {
  try {
    // Load governance
    const governance = loadUpgradeGovernance();
    
    // Verify council membership
    const councilAddress = councilKeypair.publicKey.toString();
    if (!governance.council.includes(councilAddress)) {
      throw new Error('Only council members can delegate their voting rights');
    }
    
    // Validate delegateAddress
    try {
      new PublicKey(delegateAddress);
    } catch (error) {
      throw new Error(`Invalid delegate address: ${delegateAddress}`);
    }
    
    // Validate not delegating to self
    if (councilAddress === delegateAddress) {
      throw new Error('Cannot delegate voting rights to yourself');
    }
    
    // Validate duration
    if (durationDays <= 0 || durationDays > 90) {
      throw new Error('Delegation duration must be between 1 and 90 days');
    }
    
    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    
    // Create or update delegation
    governance.delegations[councilAddress] = {
      delegateTo: delegateAddress,
      expiresAt: expiresAt.toISOString()
    };
    
    // Save governance
    saveUpgradeGovernance(governance, councilKeypair);
    
    // Log action to audit log
    logAuditAction(
      'DELEGATE_VOTING',
      councilAddress,
      `Delegated voting rights to ${delegateAddress}`,
      {
        delegateTo: delegateAddress,
        expiresAt: expiresAt.toISOString(),
        durationDays
      }
    );
    
    console.log(`Voting rights delegated successfully:`);
    console.log(`- From: ${councilAddress}`);
    console.log(`- To: ${delegateAddress}`);
    console.log(`- Expires: ${expiresAt.toLocaleString()} (${durationDays} days)`);
    
  } catch (error: any) {
    handleError(`Failed to delegate voting rights: ${error.message}`, error);
  }
}

/**
 * Revoke a voting delegation
 * @param councilKeypair Keypair of the council member
 */
export async function revokeDelegation(
  councilKeypair: Keypair
): Promise<void> {
  try {
    // Load governance
    const governance = loadUpgradeGovernance();
    
    // Verify council membership
    const councilAddress = councilKeypair.publicKey.toString();
    if (!governance.council.includes(councilAddress)) {
      throw new Error('Only council members can revoke their delegations');
    }
    
    // Check if delegation exists
    if (!governance.delegations[councilAddress]) {
      console.log('No active delegation found');
      return;
    }
    
    // Record the delegate for logging
    const delegateTo = governance.delegations[councilAddress].delegateTo;
    
    // Remove delegation
    delete governance.delegations[councilAddress];
    
    // Save governance
    saveUpgradeGovernance(governance, councilKeypair);
    
    // Log action to audit log
    logAuditAction(
      'REVOKE_DELEGATION',
      councilAddress,
      `Revoked voting delegation from ${delegateTo}`,
      {
        delegateTo
      }
    );
    
    console.log(`Voting delegation revoked successfully`);
    console.log(`- Delegate: ${delegateTo} can no longer vote on behalf of ${councilAddress}`);
    
  } catch (error: any) {
    handleError(`Failed to revoke delegation: ${error.message}`, error);
  }
}

/**
 * List all active delegations
 */
export function listDelegations(): void {
  try {
    const governance = loadUpgradeGovernance();
    
    console.log('===== Active Voting Delegations =====');
    
    const now = new Date();
    const activeDelegations = Object.entries(governance.delegations)
      .filter(([_, delegation]) => new Date(delegation.expiresAt) > now);
    
    if (activeDelegations.length === 0) {
      console.log('No active delegations found.');
      return;
    }
    
    // Sort by expiration date (most recent first)
    activeDelegations.sort((a, b) => {
      return new Date(b[1].expiresAt).getTime() - new Date(a[1].expiresAt).getTime();
    });
    
    activeDelegations.forEach(([memberAddress, delegation]) => {
      const expiresAt = new Date(delegation.expiresAt);
      const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`Council Member: ${memberAddress}`);
      console.log(`Delegated To: ${delegation.delegateTo}`);
      console.log(`Expires: ${expiresAt.toLocaleString()} (${daysRemaining} days remaining)`);
      console.log('-'.repeat(40));
    });
    
    console.log('===================================');
    
  } catch (error: any) {
    if (error.message.includes('not initialized')) {
      console.log('Upgrade governance not initialized yet.');
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
        {
          if (args.length < 4) {
            console.error('Usage: npm run upgrade init <council_addresses> <threshold> <timelock> [emergency_threshold] [emergency_timelock]');
            console.error('Example: npm run upgrade init "addr1,addr2,addr3" 2 7 3 1');
            process.exit(1);
          }
          
          const councilAddresses = args[1].split(',');
          const threshold = parseInt(args[2]);
          const timelock = parseInt(args[3]);
          const emergencyThreshold = args[4] ? parseInt(args[4]) : undefined;
          const emergencyTimelock = args[5] ? parseInt(args[5]) : undefined;
          
          const authorityKeypair = await getOrCreateKeypair('authority');
          await initializeUpgradeGovernance(
            authorityKeypair, 
            councilAddresses, 
            threshold, 
            timelock, 
            emergencyThreshold, 
            emergencyTimelock
          );
        }
        break;
        
      case 'propose':
        {
          if (args.length < 4) {
            console.error('Usage: npm run upgrade propose <description> <file_paths> [execute_after_days]');
            console.error('Example: npm run upgrade propose "Fix security bug" "src/file1.ts,src/file2.ts" 7');
            process.exit(1);
          }
          
          const description = args[1];
          const filePaths = args[2].split(',');
          const executeAfterDays = args[3] ? parseInt(args[3]) : undefined;
          
          // Get keypair (can be any council member)
          const keypairName = args[4] || 'authority';
          const proposerKeypair = await getOrCreateKeypair(keypairName);
          
          await proposeUpgrade(proposerKeypair, description, filePaths, executeAfterDays);
        }
        break;
        
      case 'propose-emergency':
        {
          if (args.length < 4) {
            console.error('Usage: npm run upgrade propose-emergency <description> <file_paths> <justification> [keypair_name]');
            console.error('Example: npm run upgrade propose-emergency "Critical security fix" "src/file1.ts,src/file2.ts" "Vulnerability found in production"');
            process.exit(1);
          }
          
          const description = args[1];
          const filePaths = args[2].split(',');
          const justification = args[3];
          
          // Get keypair (can be any council member)
          const keypairName = args[4] || 'authority';
          const proposerKeypair = await getOrCreateKeypair(keypairName);
          
          await proposeEmergencyUpgrade(proposerKeypair, description, filePaths, justification);
        }
        break;
        
      case 'vote':
        {
          if (args.length < 3) {
            console.error('Usage: npm run upgrade vote <proposal_id> <approve|reject> [keypair_name]');
            process.exit(1);
          }
          
          const proposalId = args[1];
          const voteStr = args[2].toLowerCase();
          
          if (voteStr !== 'approve' && voteStr !== 'reject') {
            console.error('Vote must be either "approve" or "reject"');
            process.exit(1);
          }
          
          const approved = voteStr === 'approve';
          
          // Get keypair (can be any council member)
          const keypairName = args[3] || 'authority';
          const voterKeypair = await getOrCreateKeypair(keypairName);
          
          await voteOnProposal(voterKeypair, proposalId, approved);
        }
        break;
        
      case 'execute':
        {
          if (args.length < 2) {
            console.error('Usage: npm run upgrade execute <proposal_id> [keypair_name]');
            process.exit(1);
          }
          
          const proposalId = args[1];
          
          // Get keypair (can be any council member)
          const keypairName = args[2] || 'authority';
          const executorKeypair = await getOrCreateKeypair(keypairName);
          
          await executeProposal(executorKeypair, proposalId);
        }
        break;
        
      case 'list':
        listProposals();
        break;
        
      case 'add-member':
        {
          if (args.length < 2) {
            console.error('Usage: npm run upgrade add-member <member_address>');
            process.exit(1);
          }
          
          const memberAddress = args[1];
          const authorityKeypair = await getOrCreateKeypair('authority');
          
          await addCouncilMember(authorityKeypair, memberAddress);
        }
        break;
        
      case 'remove-member':
        {
          if (args.length < 2) {
            console.error('Usage: npm run upgrade remove-member <member_address>');
            process.exit(1);
          }
          
          const memberAddress = args[1];
          const authorityKeypair = await getOrCreateKeypair('authority');
          
          await removeCouncilMember(authorityKeypair, memberAddress);
        }
        break;
        
      case 'update-threshold':
        {
          if (args.length < 2) {
            console.error('Usage: npm run upgrade update-threshold <threshold>');
            process.exit(1);
          }
          
          const threshold = parseInt(args[1]);
          const authorityKeypair = await getOrCreateKeypair('authority');
          
          await updateThreshold(authorityKeypair, threshold);
        }
        break;
        
      case 'update-timelock':
        {
          if (args.length < 2) {
            console.error('Usage: npm run upgrade update-timelock <timelock_days>');
            process.exit(1);
          }
          
          const timelock = parseInt(args[1]);
          const authorityKeypair = await getOrCreateKeypair('authority');
          
          await updateTimelock(authorityKeypair, timelock);
        }
        break;
        
      case 'update-emergency-threshold':
        {
          if (args.length < 2) {
            console.error('Usage: npm run upgrade update-emergency-threshold <threshold>');
            process.exit(1);
          }
          
          const threshold = parseInt(args[1]);
          const authorityKeypair = await getOrCreateKeypair('authority');
          
          await updateEmergencyThreshold(authorityKeypair, threshold);
        }
        break;
        
      case 'update-emergency-timelock':
        {
          if (args.length < 2) {
            console.error('Usage: npm run upgrade update-emergency-timelock <timelock_days>');
            process.exit(1);
          }
          
          const timelock = parseInt(args[1]);
          const authorityKeypair = await getOrCreateKeypair('authority');
          
          await updateEmergencyTimelock(authorityKeypair, timelock);
        }
        break;
        
      case 'audit':
        {
          const limit = args[1] ? parseInt(args[1]) : 20;
          showAuditLog(limit);
        }
        break;
        
      case 'delegate':
        {
          if (args.length < 3) {
            console.error('Usage: npm run upgrade delegate <delegate_address> <duration_days> [keypair_name]');
            console.error('Example: npm run upgrade delegate Abc123XYZ 30 council-member1');
            process.exit(1);
          }
          
          const delegateAddress = args[1];
          const durationDays = parseInt(args[2]);
          
          if (isNaN(durationDays) || durationDays <= 0) {
            console.error('Duration must be a positive number of days');
            process.exit(1);
          }
          
          // Get keypair (must be a council member)
          const keypairName = args[3] || 'authority';
          const councilKeypair = await getOrCreateKeypair(keypairName);
          
          await delegateVoting(councilKeypair, delegateAddress, durationDays);
        }
        break;
        
      case 'revoke-delegation':
        {
          // Get keypair (must be a council member)
          const keypairName = args[1] || 'authority';
          const councilKeypair = await getOrCreateKeypair(keypairName);
          
          await revokeDelegation(councilKeypair);
        }
        break;
        
      case 'list-delegations':
        listDelegations();
        break;
        
      default:
        console.log('VCoin Upgrade Governance');
        console.log('Available commands:');
        console.log('  npm run upgrade init <council_addresses> <threshold> <timelock> [emergency_threshold] [emergency_timelock] - Initialize upgrade governance');
        console.log('  npm run upgrade list - List all upgrade proposals');
        console.log('  npm run upgrade propose <description> <file_paths> [execute_after_days] - Propose an upgrade');
        console.log('  npm run upgrade propose-emergency <description> <file_paths> <justification> - Propose an emergency upgrade');
        console.log('  npm run upgrade vote <proposal_id> <approve|reject> [keypair_name] - Vote on a proposal');
        console.log('  npm run upgrade execute <proposal_id> [keypair_name] - Execute an approved proposal');
        console.log('  npm run upgrade add-member <member_address> - Add a council member');
        console.log('  npm run upgrade remove-member <member_address> - Remove a council member');
        console.log('  npm run upgrade update-threshold <threshold> - Update the approval threshold');
        console.log('  npm run upgrade update-timelock <timelock_days> - Update the timelock period');
        console.log('  npm run upgrade update-emergency-threshold <threshold> - Update the emergency approval threshold');
        console.log('  npm run upgrade update-emergency-timelock <timelock_days> - Update the emergency timelock period');
        console.log('  npm run upgrade audit [limit] - Show governance audit log (default: last 20 entries)');
        console.log('  npm run upgrade delegate <delegate_address> <duration_days> [keypair_name] - Delegate voting rights');
        console.log('  npm run upgrade revoke-delegation [keypair_name] - Revoke a voting delegation');
        console.log('  npm run upgrade list-delegations - List all active delegations');
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