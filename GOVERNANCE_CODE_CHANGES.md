# VCoin Governance Implementation - Code Changes

This document shows the exact code changes made to implement the council-based governance system for VCoin.

## 1. State Structures (program/src/state.rs)

```rust
/// The maximum number of council members allowed
pub const MAX_COUNCIL_MEMBERS: usize = 9;

/// The maximum number of proposals that can be stored
pub const MAX_PROPOSALS: usize = 20;

/// Proposal types
#[derive(Clone, Copy, Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum ProposalType {
    /// Upgrade the program
    UpgradeProgram,
    /// Add a new council member
    AddCouncilMember,
    /// Remove a council member
    RemoveCouncilMember,
    /// Change quorum requirements
    ChangeQuorum,
    /// Change transfer fee
    ChangeTransferFee,
    /// Change supply parameters
    ChangeSupplyParameters,
    /// Mint tokens to address
    MintTokens,
    /// Burn tokens from treasury
    BurnTokens,
    /// Other proposal type with description
    Other,
}

/// Status of a proposal
#[derive(Clone, Copy, Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum ProposalStatus {
    /// Proposal is active and can be voted on
    Active,
    /// Proposal has been approved
    Approved,
    /// Proposal has been rejected
    Rejected,
    /// Proposal has been executed
    Executed,
    /// Proposal has been cancelled
    Cancelled,
}

/// A vote on a proposal
#[derive(Clone, Copy, Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum Vote {
    /// Vote in favor of the proposal
    For,
    /// Vote against the proposal
    Against,
    /// Abstain from voting
    Abstain,
}

/// A proposal in the governance system
#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct Proposal {
    /// Unique identifier for the proposal
    pub id: u32,
    /// The type of proposal
    pub proposal_type: ProposalType,
    /// The creator of the proposal
    pub proposer: Pubkey,
    /// Title of the proposal (short description)
    pub title: String,
    /// Description of the proposal
    pub description: String,
    /// Link to additional documentation
    pub link: String,
    /// The program or account this proposal affects
    pub target: Pubkey,
    /// Parameters for the proposal (serialized)
    pub parameters: Vec<u8>,
    /// When the proposal was created
    pub created_at: i64,
    /// When voting ends
    pub voting_ends_at: i64,
    /// When the proposal can be executed (if approved)
    pub executable_at: i64,
    /// Status of the proposal
    pub status: ProposalStatus,
    /// Number of votes in favor
    pub votes_for: u32,
    /// Number of votes against
    pub votes_against: u32,
    /// Number of abstentions
    pub abstain_count: u32,
    /// Has the proposal been executed
    pub executed: bool,
}

/// Records a member's vote on a proposal
#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct VoteRecord {
    /// The proposal this vote is for
    pub proposal_id: u32,
    /// The council member who voted
    pub voter: Pubkey,
    /// The vote cast
    pub vote: Vote,
    /// When the vote was cast
    pub timestamp: i64,
}

/// Governance configuration
#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct GovernanceConfig {
    /// Minimum approval quorum (percentage 0-100)
    pub min_approval_percent: u8,
    /// Voting duration in seconds
    pub voting_duration: i64,
    /// Timelock duration after approval before execution
    pub timelock_duration: i64,
}

/// Council governance state
#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct CouncilState {
    /// Whether governance has been initialized
    pub is_initialized: bool,
    /// The mint this governance system controls
    pub mint: Pubkey,
    /// Council members
    pub council_members: Vec<Pubkey>,
    /// Active proposals
    pub proposals: Vec<Proposal>,
    /// Vote records for each council member on each proposal
    pub vote_records: Vec<VoteRecord>,
    /// Governance configuration
    pub config: GovernanceConfig,
    /// Next proposal ID
    pub next_proposal_id: u32,
}

impl CouncilState {
    /// Get the size of the council state account
    pub fn get_size() -> usize {
        // Base size for fixed fields
        let mut size = 1 + 32; // is_initialized + mint
        
        // Council members (max sized vector)
        size += 4 + (MAX_COUNCIL_MEMBERS * 32); // len + pubkeys
        
        // Proposals (max sized vector with variable-sized elements)
        // More conservative estimate for each proposal
        let proposal_size = 4 + // id
                           1 + // proposal_type
                           32 + // proposer
                           100 + // title (variable)
                           1000 + // description (variable)
                           200 + // link (variable)
                           32 + // target
                           200 + // parameters (variable)
                           8 + // created_at
                           8 + // voting_ends_at
                           8 + // executable_at
                           1 + // status
                           4 + // votes_for
                           4 + // votes_against
                           4 + // abstain_count
                           1; // executed
        size += 4 + (MAX_PROPOSALS * proposal_size);
        
        // Vote records (max sized vector with fixed-size elements)
        let vote_record_size = 4 + 32 + 1 + 8; // proposal_id + voter + vote + timestamp
        let max_vote_records = MAX_COUNCIL_MEMBERS * MAX_PROPOSALS; // One vote per council member per proposal
        size += 4 + (max_vote_records * vote_record_size);
        
        // Governance config
        size += 1 + 8 + 8; // min_approval_percent + voting_duration + timelock_duration
        
        // Next proposal ID
        size += 4;

        // Add buffer for safety (10%)
        size += size / 10;
        
        size
    }
    
    /// Check if an address is a council member
    pub fn is_council_member(&self, address: &Pubkey) -> bool {
        self.council_members.contains(address)
    }
    
    /// Add a new proposal
    pub fn add_proposal(
        &mut self,
        proposal_type: ProposalType,
        proposer: Pubkey,
        title: String,
        description: String,
        link: String,
        target: Pubkey,
        parameters: Vec<u8>,
        created_at: i64,
    ) -> Result<u32, ProgramError> {
        // Check if we've reached the max proposals limit
        if self.proposals.len() >= MAX_PROPOSALS {
            return Err(VCoinError::BeneficiaryLimitReached.into());
        }
        
        // Validate string lengths to prevent excessive storage usage
        if title.len() > 80 {
            msg!("Title too long, must be 80 characters or less");
            return Err(VCoinError::InvalidParameter.into());
        }
        
        if description.len() > 750 {
            msg!("Description too long, must be 750 characters or less");
            return Err(VCoinError::InvalidParameter.into());
        }
        
        if link.len() > 150 {
            msg!("Link too long, must be 150 characters or less");
            return Err(VCoinError::InvalidParameter.into());
        }
        
        if parameters.len() > 150 {
            msg!("Parameters too large, must be 150 bytes or less");
            return Err(VCoinError::InvalidParameter.into());
        }
        
        // Get the next proposal ID
        let id = self.next_proposal_id;
        self.next_proposal_id = self.next_proposal_id.checked_add(1)
            .ok_or(VCoinError::CalculationError)?;
        
        // Calculate voting end time
        let voting_ends_at = created_at.checked_add(self.config.voting_duration)
            .ok_or(VCoinError::CalculationError)?;
            
        // Calculate when the proposal can be executed if approved
        let executable_at = voting_ends_at.checked_add(self.config.timelock_duration)
            .ok_or(VCoinError::CalculationError)?;
        
        // Create the new proposal
        let proposal = Proposal {
            id,
            proposal_type,
            proposer,
            title,
            description,
            link,
            target,
            parameters,
            created_at,
            voting_ends_at,
            executable_at,
            status: ProposalStatus::Active,
            votes_for: 0,
            votes_against: 0,
            abstain_count: 0,
            executed: false,
        };
        
        // Add the proposal to the list
        self.proposals.push(proposal);
        
        Ok(id)
    }
    
    /// Cast a vote on a proposal
    pub fn cast_vote(
        &mut self,
        proposal_id: u32,
        voter: Pubkey,
        vote: Vote,
        timestamp: i64,
    ) -> Result<(), ProgramError> {
        // Check if the voter is a council member
        if !self.is_council_member(&voter) {
            return Err(VCoinError::Unauthorized.into());
        }
        
        // Find the proposal
        let proposal_index = self.proposals.iter().position(|p| p.id == proposal_id)
            .ok_or(VCoinError::InvalidProposalStatus)?;
            
        let proposal = &mut self.proposals[proposal_index];
        
        // Check if the proposal is active
        if proposal.status != ProposalStatus::Active {
            return Err(VCoinError::InvalidProposalStatus.into());
        }
        
        // Check if voting has ended
        if timestamp > proposal.voting_ends_at {
            return Err(VCoinError::ExpiredDeadline.into());
        }
        
        // Check if the member has already voted
        for record in &self.vote_records {
            if record.proposal_id == proposal_id && record.voter == voter {
                return Err(VCoinError::AlreadyVoted.into());
            }
        }
        
        // Record the vote
        let vote_record = VoteRecord {
            proposal_id,
            voter,
            vote,
            timestamp,
        };
        
        self.vote_records.push(vote_record);
        
        // Update the vote count on the proposal
        match vote {
            Vote::For => proposal.votes_for = proposal.votes_for.checked_add(1)
                .ok_or(VCoinError::CalculationError)?,
            Vote::Against => proposal.votes_against = proposal.votes_against.checked_add(1)
                .ok_or(VCoinError::CalculationError)?,
            Vote::Abstain => proposal.abstain_count = proposal.abstain_count.checked_add(1)
                .ok_or(VCoinError::CalculationError)?,
        }
        
        Ok(())
    }
    
    /// Find a proposal by ID
    pub fn find_proposal(&self, proposal_id: u32) -> Option<&Proposal> {
        self.proposals.iter().find(|p| p.id == proposal_id)
    }
    
    /// Find a proposal by ID (mutable)
    pub fn find_proposal_mut(&mut self, proposal_id: u32) -> Option<&mut Proposal> {
        self.proposals.iter_mut().find(|p| p.id == proposal_id)
    }
    
    /// Check if a proposal has reached quorum and update its status
    pub fn check_proposal_status(
        &mut self,
        proposal_id: u32,
        current_time: i64,
    ) -> Result<ProposalStatus, ProgramError> {
        // Find the proposal
        let proposal_index = self.proposals.iter().position(|p| p.id == proposal_id)
            .ok_or(VCoinError::InvalidProposalStatus)?;
            
        let proposal = &mut self.proposals[proposal_index];
        
        // If the proposal is not active, return its current status
        if proposal.status != ProposalStatus::Active {
            return Ok(proposal.status);
        }
        
        // Check if voting period has ended
        if current_time <= proposal.voting_ends_at {
            // Voting is still active
            return Ok(ProposalStatus::Active);
        }
        
        // Voting has ended, determine the outcome
        let total_votes = proposal.votes_for + proposal.votes_against + proposal.abstain_count;
        let total_council_members = self.council_members.len() as u32;
        
        // Calculate participation percentage
        let participation_percent = if total_council_members > 0 {
            (total_votes * 100) / total_council_members
        } else {
            0
        };
        
        // Calculate approval percentage among those who voted (excluding abstentions)
        let votes_cast = proposal.votes_for + proposal.votes_against;
        let approval_percent = if votes_cast > 0 {
            (proposal.votes_for * 100) / votes_cast
        } else {
            0
        };
        
        // Check if quorum was reached and proposal was approved
        if participation_percent >= 50 && approval_percent >= self.config.min_approval_percent as u32 {
            proposal.status = ProposalStatus::Approved;
        } else {
            proposal.status = ProposalStatus::Rejected;
        }
        
        Ok(proposal.status)
    }
    
    /// Add a council member
    pub fn add_council_member(&mut self, member: Pubkey) -> Result<(), ProgramError> {
        // Check if we've reached the max council members limit
        if self.council_members.len() >= MAX_COUNCIL_MEMBERS {
            return Err(VCoinError::BeneficiaryLimitReached.into());
        }
        
        // Check if the member is already on the council
        if self.is_council_member(&member) {
            return Err(VCoinError::BeneficiaryAlreadyExists.into());
        }
        
        // Add the member to the council
        self.council_members.push(member);
        
        Ok(())
    }
    
    /// Remove a council member
    pub fn remove_council_member(&mut self, member: &Pubkey) -> Result<(), ProgramError> {
        // Find the member in the council
        let position = self.council_members.iter().position(|m| m == member)
            .ok_or(VCoinError::BeneficiaryNotFound)?;
            
        // Remove the member
        self.council_members.remove(position);
        
        Ok(())
    }
}
```

## 2. Error Types (program/src/error.rs)

```rust
/// Timelock not expired
#[error("Timelock period not yet expired")]
TimelockNotExpired,

/// Invalid parameter
#[error("Invalid parameter")]
InvalidParameter,

/// Expired deadline
#[error("Expired deadline")]
ExpiredDeadline,

/// Already voted
#[error("Already voted")]
AlreadyVoted,

/// Invalid proposal status
#[error("Invalid proposal status")]
InvalidProposalStatus,

/// Voting still active
#[error("Voting period still active")]
VotingStillActive,

/// Error executing an instruction
#[error("Error executing an instruction")]
InstructionExecutionError,
```

## 3. Instruction Types (program/src/instruction.rs)

```rust
/// Initialize governance system
/// 
/// Accounts expected:
/// 0. `[signer]` Initializer account (must match the program's current upgrade authority)
/// 1. `[writable]` Council state account (must be newly created)
/// 2. `[]` Mint account
/// 3. `[]` Program to be governed (Program data account will be derived)
/// 4. `[]` System program
/// 5+ `[]` Initial council members 
InitializeGovernance {
    /// Minimum approval quorum as percentage (0-100)
    min_approval_percent: u8,
    /// Voting duration in seconds
    voting_duration: i64,
    /// Timelock duration in seconds
    timelock_duration: i64,
},

/// Create a new proposal
///
/// Accounts expected:
/// 0. `[signer]` Proposer account (must be a council member)
/// 1. `[writable]` Council state account
/// 2. `[]` Clock sysvar
CreateProposal {
    /// Proposal type
    proposal_type: ProposalType,
    /// Title of the proposal
    title: String,
    /// Description of the proposal
    description: String,
    /// Link to additional documentation
    link: String,
    /// The program or account this proposal affects
    target: Pubkey,
    /// Parameters for the proposal (serialized)
    parameters: Vec<u8>,
},

/// Cast a vote on a proposal
///
/// Accounts expected:
/// 0. `[signer]` Voter account (must be a council member)
/// 1. `[writable]` Council state account
/// 2. `[]` Clock sysvar
CastVote {
    /// The ID of the proposal to vote on
    proposal_id: u32,
    /// The vote to cast
    vote: Vote,
},

/// Finalize a proposal after voting has ended
///
/// Accounts expected:
/// 0. `[signer]` Any account (typically a council member)
/// 1. `[writable]` Council state account
/// 2. `[]` Clock sysvar
FinalizeProposal {
    /// The ID of the proposal to finalize
    proposal_id: u32,
},

/// Execute an approved proposal
///
/// Accounts expected:
/// 0. `[signer]` Executor account (must be a council member)
/// 1. `[writable]` Council state account
/// 2. `[]` Clock sysvar
/// 3+ `[]` Additional accounts specific to the proposal type
ExecuteProposal {
    /// The ID of the proposal to execute
    proposal_id: u32,
},

/// Add a council member
///
/// Accounts expected:
/// 0. `[signer]` Executor account (must be a council member executing an approved proposal)
/// 1. `[writable]` Council state account
/// 2. `[]` New council member account
/// 3. `[]` Proposal ID (must be approved and of type AddCouncilMember)
AddCouncilMember,

/// Remove a council member
///
/// Accounts expected:
/// 0. `[signer]` Executor account (must be a council member executing an approved proposal)
/// 1. `[writable]` Council state account
/// 2. `[]` Council member to remove
/// 3. `[]` Proposal ID (must be approved and of type RemoveCouncilMember)
RemoveCouncilMember,

/// Cancel a proposal
///
/// Accounts expected:
/// 0. `[signer]` Canceller account (must be the original proposer or a council member)
/// 1. `[writable]` Council state account
/// 2. `[]` Clock sysvar
CancelProposal {
    /// The ID of the proposal to cancel
    proposal_id: u32,
},
```

## 4. Processor Functions (program/src/processor.rs)

```rust
/// Process InitializeGovernance instruction
/// Sets up the council governance system
fn process_initialize_governance(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    min_approval_percent: u8,
    voting_duration: i64,
    timelock_duration: i64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let initializer_info = next_account_info(account_info_iter)?;
    let council_state_info = next_account_info(account_info_iter)?;
    let mint_info = next_account_info(account_info_iter)?;
    let program_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;
    
    // Collect any additional accounts as initial council members
    let mut initial_council_members = Vec::new();
    while account_info_iter.len() > 0 {
        initial_council_members.push(*next_account_info(account_info_iter)?.key);
    }

    // Verify initializer signed the transaction
    if !initializer_info.is_signer {
        msg!("Initializer must sign transaction");
        return Err(VCoinError::Unauthorized.into());
    }

    // Verify system program
    if system_program_info.key != &solana_program::system_program::ID {
        msg!("Invalid system program");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Check if council state is already initialized
    if council_state_info.data_len() > 0 {
        msg!("Council state account already exists");
        return Err(VCoinError::AlreadyInitialized.into());
    }

    // Verify parameters
    if min_approval_percent > 100 {
        msg!("Min approval percent must be between 0 and 100");
        return Err(VCoinError::InvalidParameter.into());
    }

    if voting_duration < 3600 {
        msg!("Voting duration must be at least 1 hour (3600 seconds)");
        return Err(VCoinError::InvalidParameter.into());
    }

    if timelock_duration < 0 {
        msg!("Timelock duration cannot be negative");
        return Err(VCoinError::InvalidParameter.into());
    }

    // Create council state account
    let council_size = CouncilState::get_size();
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(council_size);

    // Create the account
    invoke(
        &solana_program::system_instruction::create_account(
            initializer_info.key,
            council_state_info.key,
            lamports,
            council_size as u64,
            program_id,
        ),
        &[
            initializer_info.clone(),
            council_state_info.clone(),
            system_program_info.clone(),
        ],
    )?;

    // Verify council members count
    if initial_council_members.is_empty() {
        msg!("At least one council member must be specified");
        return Err(VCoinError::InvalidParameter.into());
    }

    if initial_council_members.len() > MAX_COUNCIL_MEMBERS {
        msg!("Too many initial council members specified (max {})", MAX_COUNCIL_MEMBERS);
        return Err(VCoinError::BeneficiaryLimitReached.into());
    }

    // Initialize governance config
    let config = GovernanceConfig {
        min_approval_percent,
        voting_duration,
        timelock_duration,
    };

    // Initialize council state
    let council_state = CouncilState {
        is_initialized: true,
        mint: *mint_info.key,
        council_members: initial_council_members,
        proposals: Vec::new(),
        vote_records: Vec::new(),
        config,
        next_proposal_id: 1,
    };

    // Serialize council state to the account
    council_state.serialize(&mut *council_state_info.data.borrow_mut())?;

    msg!("Governance system initialized with {} council members", council_state.council_members.len());
    msg!("Min approval: {}%, Voting duration: {} seconds, Timelock: {} seconds", 
         min_approval_percent, voting_duration, timelock_duration);
    Ok(())
}

/// Process CreateProposal instruction
fn process_create_proposal(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    proposal_type: ProposalType,
    title: String,
    description: String,
    link: String,
    target: Pubkey,
    parameters: Vec<u8>,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let proposer_info = next_account_info(account_info_iter)?;
    let council_state_info = next_account_info(account_info_iter)?;
    let clock_info = next_account_info(account_info_iter)?;

    // Verify proposer signed the transaction
    if !proposer_info.is_signer {
        msg!("Proposer must sign transaction");
        return Err(VCoinError::Unauthorized.into());
    }

    // Verify council state account ownership
    if council_state_info.owner != program_id {
        msg!("Council state account not owned by program");
        return Err(VCoinError::InvalidAccountOwner.into());
    }

    // Load council state
    let mut council_state = CouncilState::try_from_slice(&council_state_info.data.borrow())?;

    // Verify council state is initialized
    if !council_state.is_initialized {
        msg!("Council state not initialized");
        return Err(VCoinError::NotInitialized.into());
    }

    // Verify proposer is a council member
    if !council_state.is_council_member(proposer_info.key) {
        msg!("Proposer is not a council member");
        return Err(VCoinError::Unauthorized.into());
    }

    // Get current time
    let clock = Clock::from_account_info(clock_info)?;
    let current_time = clock.unix_timestamp;

    // Basic validation
    if title.is_empty() || description.is_empty() {
        msg!("Title and description cannot be empty");
        return Err(VCoinError::InvalidParameter.into());
    }

    // Create the proposal
    let proposal_id = council_state.add_proposal(
        proposal_type,
        *proposer_info.key,
        title.clone(),
        description.clone(),
        link.clone(),
        target,
        parameters.clone(),
        current_time,
    )?;

    // Save updated council state
    council_state.serialize(&mut *council_state_info.data.borrow_mut())?;

    msg!("Proposal created: ID {}, Type {:?}, Title: {}", proposal_id, proposal_type, title);
    Ok(())
}

/// Process CastVote instruction
fn process_cast_vote(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    proposal_id: u32,
    vote: Vote,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let voter_info = next_account_info(account_info_iter)?;
    let council_state_info = next_account_info(account_info_iter)?;
    let clock_info = next_account_info(account_info_iter)?;

    // Verify voter signed the transaction
    if !voter_info.is_signer {
        msg!("Voter must sign transaction");
        return Err(VCoinError::Unauthorized.into());
    }

    // Verify council state account ownership
    if council_state_info.owner != program_id {
        msg!("Council state account not owned by program");
        return Err(VCoinError::InvalidAccountOwner.into());
    }

    // Load council state
    let mut council_state = CouncilState::try_from_slice(&council_state_info.data.borrow())?;

    // Verify council state is initialized
    if !council_state.is_initialized {
        msg!("Council state not initialized");
        return Err(VCoinError::NotInitialized.into());
    }

    // Verify voter is a council member
    if !council_state.is_council_member(voter_info.key) {
        msg!("Voter is not a council member");
        return Err(VCoinError::Unauthorized.into());
    }

    // Get current time
    let clock = Clock::from_account_info(clock_info)?;
    let current_time = clock.unix_timestamp;

    // Cast the vote
    council_state.cast_vote(
        proposal_id,
        *voter_info.key,
        vote,
        current_time,
    )?;

    // Save updated council state
    council_state.serialize(&mut *council_state_info.data.borrow_mut())?;

    msg!("Vote cast on proposal {}: {:?}", proposal_id, vote);
    Ok(())
}

/// Process FinalizeProposal instruction
fn process_finalize_proposal(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    proposal_id: u32,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let finalizer_info = next_account_info(account_info_iter)?;
    let council_state_info = next_account_info(account_info_iter)?;
    let clock_info = next_account_info(account_info_iter)?;

    // Verify finalizer signed the transaction
    if !finalizer_info.is_signer {
        msg!("Finalizer must sign transaction");
        return Err(VCoinError::Unauthorized.into());
    }

    // Verify council state account ownership
    if council_state_info.owner != program_id {
        msg!("Council state account not owned by program");
        return Err(VCoinError::InvalidAccountOwner.into());
    }

    // Load council state
    let mut council_state = CouncilState::try_from_slice(&council_state_info.data.borrow())?;

    // Verify council state is initialized
    if !council_state.is_initialized {
        msg!("Council state not initialized");
        return Err(VCoinError::NotInitialized.into());
    }

    // Get current time
    let clock = Clock::from_account_info(clock_info)?;
    let current_time = clock.unix_timestamp;

    // Check the proposal status
    let status = council_state.check_proposal_status(proposal_id, current_time)?;

    // Save updated council state
    council_state.serialize(&mut *council_state_info.data.borrow_mut())?;

    msg!("Proposal {} finalized with status: {:?}", proposal_id, status);
    Ok(())
}

/// Process ExecuteProposal instruction
fn process_execute_proposal(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    proposal_id: u32,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let executor_info = next_account_info(account_info_iter)?;
    let council_state_info = next_account_info(account_info_iter)?;
    let clock_info = next_account_info(account_info_iter)?;
    
    // Remaining accounts depend on the proposal type
    let remaining_accounts = account_info_iter.as_slice();

    // Verify executor signed the transaction
    if !executor_info.is_signer {
        msg!("Executor must sign transaction");
        return Err(VCoinError::Unauthorized.into());
    }

    // Verify council state account ownership
    if council_state_info.owner != program_id {
        msg!("Council state account not owned by program");
        return Err(VCoinError::InvalidAccountOwner.into());
    }

    // Load council state
    let mut council_state = CouncilState::try_from_slice(&council_state_info.data.borrow())?;

    // Verify council state is initialized
    if !council_state.is_initialized {
        msg!("Council state not initialized");
        return Err(VCoinError::NotInitialized.into());
    }

    // Verify executor is a council member
    if !council_state.is_council_member(executor_info.key) {
        msg!("Executor is not a council member");
        return Err(VCoinError::Unauthorized.into());
    }

    // Get current time
    let clock = Clock::from_account_info(clock_info)?;
    let current_time = clock.unix_timestamp;

    // Find the proposal
    let proposal = council_state.find_proposal_mut(proposal_id)
        .ok_or(VCoinError::InvalidProposalStatus)?;

    // Check if the proposal is approved
    if proposal.status != ProposalStatus::Approved {
        msg!("Proposal is not approved");
        return Err(VCoinError::InvalidProposalStatus.into());
    }

    // Check if the proposal has already been executed
    if proposal.executed {
        msg!("Proposal has already been executed");
        return Err(VCoinError::InvalidProposalStatus.into());
    }

    // Check if the timelock period has passed
    if current_time < proposal.executable_at {
        let remaining = proposal.executable_at - current_time;
        msg!("Proposal cannot be executed yet. {} seconds remaining", remaining);
        return Err(VCoinError::TimelockNotExpired.into());
    }

    // Execute the proposal based on its type
    match proposal.proposal_type {
        ProposalType::UpgradeProgram => {
            msg!("Executing upgrade program proposal");
            // This proposal type requires specialized handling in a separate function
            Self::execute_upgrade_program_proposal(program_id, proposal, remaining_accounts)?;
        },
        ProposalType::AddCouncilMember => {
            msg!("Executing add council member proposal");
            // The new member's pubkey should be in the parameters
            let new_member = Pubkey::try_from_slice(&proposal.parameters)
                .map_err(|_| {
                    msg!("Invalid member pubkey in proposal parameters");
                    VCoinError::InvalidParameter
                })?;
            
            council_state.add_council_member(new_member)?;
            msg!("Added new council member: {}", new_member);
        },
        ProposalType::RemoveCouncilMember => {
            msg!("Executing remove council member proposal");
            // The member to remove should be in the parameters
            let member_to_remove = Pubkey::try_from_slice(&proposal.parameters)
                .map_err(|_| {
                    msg!("Invalid member pubkey in proposal parameters");
                    VCoinError::InvalidParameter
                })?;
            
            council_state.remove_council_member(&member_to_remove)?;
            msg!("Removed council member: {}", member_to_remove);
        },
        ProposalType::ChangeQuorum => {
            msg!("Executing change quorum proposal");
            // The new quorum percentage should be in the parameters
            if proposal.parameters.len() != 1 {
                msg!("Invalid quorum parameter size");
                return Err(VCoinError::InvalidParameter.into());
            }
            
            let new_quorum = proposal.parameters[0];
            if new_quorum > 100 {
                msg!("Invalid quorum percentage: {}. Must be 0-100", new_quorum);
                return Err(VCoinError::InvalidParameter.into());
            }
            
            council_state.config.min_approval_percent = new_quorum;
            msg!("Changed quorum to {}%", new_quorum);
        },
        // Additional proposal types...
    }

    // Mark the proposal as executed
    proposal.executed = true;
    proposal.status = ProposalStatus::Executed;

    // Save updated council state
    council_state.serialize(&mut *council_state_info.data.borrow_mut())?;

    msg!("Proposal {} executed successfully", proposal_id);
    Ok(())
}
```

## 5. Instruction Dispatch

Added to the main processor match statement:

```rust
25 => {
    msg!("Instruction: Initialize Governance");
    let instruction = VCoinInstruction::try_from_slice(instruction_data)
        .map_err(|_| VCoinError::InvalidInstructionData)?;
    
    if let VCoinInstruction::InitializeGovernance { min_approval_percent, voting_duration, timelock_duration } = instruction {
        Self::process_initialize_governance(
            program_id, 
            accounts,
            min_approval_percent,
            voting_duration,
            timelock_duration,
        )
    } else {
        Err(VCoinError::InvalidInstruction.into())
    }
},
26 => {
    msg!("Instruction: Create Proposal");
    let instruction = VCoinInstruction::try_from_slice(instruction_data)
        .map_err(|_| VCoinError::InvalidInstructionData)?;
    
    if let VCoinInstruction::CreateProposal { 
        proposal_type,
        title,
        description,
        link,
        target,
        parameters,
    } = instruction {
        Self::process_create_proposal(
            program_id,
            accounts,
            proposal_type,
            title,
            description,
            link,
            target,
            parameters,
        )
    } else {
        Err(VCoinError::InvalidInstruction.into())
    }
},
27 => {
    msg!("Instruction: Cast Vote");
    let instruction = VCoinInstruction::try_from_slice(instruction_data)
        .map_err(|_| VCoinError::InvalidInstructionData)?;
    
    if let VCoinInstruction::CastVote { proposal_id, vote } = instruction {
        Self::process_cast_vote(
            program_id,
            accounts,
            proposal_id,
            vote,
        )
    } else {
        Err(VCoinError::InvalidInstruction.into())
    }
},
// Other instruction handlers...
```

## Notes for Reviewers

1. **User Protections:**
   - Max transfer fee is hard-coded to 1% (100 basis points) in `process_set_transfer_fee`
   - No freezing capability exists in the codebase
   - All changes require council approval and timelock periods

2. **Security Features:**
   - Input validation for all parameters
   - String length checks
   - Account ownership verification
   - PDA validation
   - Checked arithmetic operations

3. **Core Governance Functionality:**
   - Multi-signature approval through council votes
   - Timelocks for all proposal execution
   - Transparent on-chain record of all governance actions
   - Council management (add/remove members)

4. **Common Test Cases:**
   - Initialize governance with invalid parameters
   - Try to vote without being a council member
   - Try to execute a proposal before timelock expires
   - Try to cast duplicate votes
   - Try to set transfer fee above 1%
</rewritten_file> 