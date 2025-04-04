use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
    sysvar,
};
use spl_token_2022::ID as TOKEN_2022_PROGRAM_ID;
use borsh::{BorshDeserialize, BorshSerialize, to_vec};

/// Instruction types supported by the program
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum VCoinInstruction {
    /// Initialize Token
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[]` The mint account
    /// 2. `[]` The token program
    /// 3. `[]` The system program
    /// 4. `[]` The rent sysvar
    /// 5. `[]` The metadata account
    InitializeToken {
        /// Name of the token
        name: String,
        /// Symbol of the token
        symbol: String,
        /// Decimals of the token
        decimals: u8,
        /// Initial supply
        initial_supply: u64,
        /// Transfer fee basis points (optional, default 500 = 5%)
        transfer_fee_basis_points: Option<u16>,
        /// Maximum fee rate as percentage of the transfer amount (optional, default 1)
        maximum_fee_rate: Option<u8>,
    },
    /// Initialize a presale
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The presale state account
    /// 2. `[]` The mint account
    /// 3. `[writable]` The development treasury account (receives 50% of funds immediately)
    /// 4. `[writable]` The locked treasury account (holds 50% for potential refunds)
    /// 5. `[]` The system program
    /// 6. `[]` Rent sysvar
    InitializePresale {
        /// Start time of the presale
        start_time: i64,
        /// End time of the presale
        end_time: i64,
        /// Token price in USD (as u64 with 6 decimals precision)
        token_price: u64,
        /// Hard cap for the presale
        hard_cap: u64,
        /// Soft cap for the presale
        soft_cap: u64,
        /// Minimum purchase amount in USD (as u64 with 6 decimals precision)
        min_purchase: u64,
        /// Maximum purchase amount in USD (as u64 with 6 decimals precision)
        max_purchase: u64,
    },
    /// Buy tokens during presale using stablecoins
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The buyer
    /// 1. `[writable]` The presale state account
    /// 2. `[writable]` The mint account
    /// 3. `[writable]` The buyer's token account
    /// 4. `[signer]` The authority that can mint tokens
    /// 5. `[]` The token program (SPL Token-2022)
    /// 6. `[writable]` The buyer's stablecoin token account (source)
    /// 7. `[writable]` The development treasury stablecoin account (receives 50%)
    /// 8. `[writable]` The locked treasury stablecoin account (receives 50%)
    /// 9. `[]` The stablecoin token program
    /// 10. `[]` The stablecoin mint account
    /// 11. `[]` The clock sysvar
    BuyTokensWithStablecoin {
        /// Amount in stablecoin token units
        amount: u64,
    },
    /// Add supported stablecoin to presale
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The presale state account
    /// 2. `[]` The stablecoin mint to add
    AddSupportedStablecoin,
    /// Mark token as launched and set refund availability
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The presale state account
    /// 2. `[]` The clock sysvar
    LaunchToken,
    /// Claim refund after the refund availability date (3 months post-launch)
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The buyer claiming refund
    /// 1. `[writable]` The presale state account
    /// 2. `[writable]` The buyer's stablecoin token account (destination)
    /// 3. `[writable]` The locked treasury stablecoin account (source)
    /// 4. `[]` The locked treasury authority (PDA)
    /// 5. `[]` The stablecoin token program
    /// 6. `[]` The stablecoin mint
    /// 7. `[]` The clock sysvar
    ClaimRefund,
    /// Withdraw remaining locked funds after refund period ends
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The presale state account
    /// 2. `[writable]` The locked treasury stablecoin account (source)
    /// 3. `[writable]` The destination treasury stablecoin account
    /// 4. `[]` The locked treasury authority (PDA)
    /// 5. `[]` The stablecoin token program
    /// 6. `[]` The stablecoin mint
    /// 7. `[]` The clock sysvar
    WithdrawLockedFunds,
    /// Initialize vesting
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The vesting state account
    /// 2. `[]` The mint account
    /// 3. `[]` The system program
    /// 4. `[]` Rent sysvar
    InitializeVesting {
        /// Total tokens to be vested
        total_tokens: u64,
        /// Vesting start timestamp
        start_time: i64,
        /// Release interval in seconds
        release_interval: i64,
        /// Number of releases
        num_releases: u8,
    },
    /// Add vesting beneficiary
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The vesting state account
    AddVestingBeneficiary {
        /// Beneficiary public key
        beneficiary: Pubkey,
        /// Amount of tokens for this beneficiary
        amount: u64,
    },
    /// Release vested tokens
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The vesting state account
    /// 2. `[writable]` The mint account
    /// 3. `[writable]` The beneficiary's token account
    /// 4. `[]` The token program (SPL Token-2022)
    /// 5. `[]` The clock sysvar
    ReleaseVestedTokens {
        /// Beneficiary public key
        beneficiary: Pubkey,
    },
    /// Update token metadata
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The metadata account (custom program storage)
    /// 2. `[]` The mint account
    /// 3. `[]` The token program (SPL Token-2022)
    UpdateTokenMetadata {
        /// New name (optional)
        name: Option<String>,
        /// New symbol (optional)
        symbol: Option<String>,
        /// New URI (optional)
        uri: Option<String>,
    },
    /// Set transfer fee
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The fee authority
    /// 1. `[writable]` The mint account
    /// 2. `[]` The token program (SPL Token-2022)
    SetTransferFee {
        /// Transfer fee basis points
        transfer_fee_basis_points: u16,
        /// Maximum fee
        maximum_fee: u64,
    },
    /// End presale
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The presale state account
    EndPresale,
    /// Initialize Autonomous Supply Controller
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The initializer (temporary authority, just for setup)
    /// 1. `[writable]` The controller state account
    /// 2. `[]` The mint account
    /// 3. `[]` The price oracle account
    /// 4. `[]` The system program
    /// 5. `[]` The token program
    /// 6. `[]` The rent sysvar
    InitializeAutonomousController {
        /// Initial token price (with 6 decimals precision)
        initial_price: u64,
        /// Maximum token supply (with appropriate decimals)
        max_supply: u64,
    },
    /// Update Price from Oracle
    /// 
    /// Accounts expected:
    /// 0. `[]` The controller state account
    /// 1. `[]` The primary price oracle account
    /// 2. `[]` The clock sysvar
    /// 3. `[]` (Optional) The backup price oracle account
    UpdateOraclePrice,
    /// Execute Autonomous Mint
    /// 
    /// Accounts expected:
    /// 0. `[writable]` The controller state account
    /// 1. `[writable]` The mint account
    /// 2. `[]` The mint authority PDA
    /// 3. `[writable]` The destination account to receive newly minted tokens
    /// 4. `[]` The token program
    /// 5. `[]` The clock sysvar
    /// 6. `[]` The price oracle account
    ExecuteAutonomousMint,
    /// Execute Autonomous Burn
    /// 
    /// Accounts expected:
    /// 0. `[writable]` The controller state account
    /// 1. `[writable]` The mint account
    /// 2. `[]` The mint authority PDA
    /// 3. `[writable]` The burn treasury token account to burn tokens from (must be owned by burn treasury PDA)
    /// 4. `[]` The burn treasury PDA (derived from mint)
    /// 5. `[]` The token program
    /// 6. `[]` The clock sysvar
    /// 7. `[]` The price oracle account
    ExecuteAutonomousBurn,
    /// Permanently Disable Program Upgrades
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The current upgrade authority
    /// 1. `[]` The program account for this program
    /// 2. `[]` The program data account for this program
    /// 3. `[]` The system program
    /// 4. `[]` The BPF Upgradeable Loader program
    PermanentlyDisableUpgrades,
    /// Deposit tokens to burn treasury
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The depositor (token holder)
    /// 1. `[writable]` The depositor's token account
    /// 2. `[writable]` The burn treasury token account
    /// 3. `[]` The controller state account
    /// 4. `[]` The mint account
    /// 5. `[]` The token program
    DepositToBurnTreasury {
        /// Amount of tokens to deposit
        amount: u64,
    },
    /// Initialize Burn Treasury
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The payer for account creation
    /// 1. `[]` The controller state account
    /// 2. `[]` The mint account
    /// 3. `[]` The burn treasury PDA
    /// 4. `[writable]` The burn treasury token account (to be created)
    /// 5. `[]` The token program
    /// 6. `[]` The system program
    /// 7. `[]` The rent sysvar
    InitializeBurnTreasury,
    /// Expand Presale Account
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The presale state account
    /// 2. `[]` The system program
    /// 3. `[]` The rent sysvar
    ExpandPresaleAccount {
        /// Additional number of buyers to allocate space for
        additional_buyers: u32,
    },
    /// Initialize Upgrade Timelock
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The current upgrade authority
    /// 1. `[writable]` The timelock state account (PDA)
    /// 2. `[]` The program account for this program
    /// 3. `[]` The program data account for this program
    /// 4. `[]` The system program
    /// 5. `[]` The BPF Upgradeable Loader program
    InitializeUpgradeTimelock {
        /// Timelock duration in seconds (default 7 days)
        timelock_duration: i64,
    },
    /// Propose Program Upgrade
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The current upgrade authority
    /// 1. `[writable]` The timelock state account (PDA)
    /// 2. `[]` The program account for this program
    /// 3. `[]` The program data account for this program
    /// 4. `[]` The BPF Upgradeable Loader program
    /// 5. `[]` The clock sysvar
    ProposeUpgrade,
    /// Execute Program Upgrade
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The current upgrade authority
    /// 1. `[writable]` The timelock state account (PDA)
    /// 2. `[writable]` The program account for this program
    /// 3. `[writable]` The program data account for this program
    /// 4. `[writable]` The buffer account containing the new program
    /// 5. `[]` The BPF Upgradeable Loader program
    /// 6. `[]` The clock sysvar
    /// 7. `[]` Rent sysvar
    ExecuteUpgrade {
        /// Buffer account containing the new program
        buffer: Pubkey,
    },
    /// Claim Refund from Development Treasury
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The buyer claiming refund
    /// 1. `[writable]` The presale state account
    /// 2. `[writable]` The buyer's stablecoin token account (destination)
    /// 3. `[writable]` The development treasury stablecoin account (source)
    /// 4. `[signer]` The authority (presale owner who must approve dev refunds)
    /// 5. `[]` The stablecoin token program
    /// 6. `[]` The stablecoin mint
    /// 7. `[]` The clock sysvar
    ClaimDevFundRefund,
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
}

/// Parameters for initializing a token
#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct InitializeTokenParams {
    /// Authority that can manage the token
    pub authority: Pubkey,
    /// The mint account
    pub mint: Pubkey,
    /// Metadata account
    pub metadata: Pubkey,
    /// Name of the token
    pub name: String,
    /// Symbol of the token
    pub symbol: String,
    /// Number of decimals
    pub decimals: u8,
    /// Initial supply
    pub initial_supply: u64,
    /// Transfer fee basis points (optional, default 500 = 5%)
    pub transfer_fee_basis_points: Option<u16>,
    /// Maximum fee rate as percentage of the transfer amount (optional, default 1)
    pub maximum_fee_rate: Option<u8>,
}

/// Parameters for initializing a presale
#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct InitializePresaleParams {
    /// Authority that can manage the presale
    pub authority: Pubkey,
    /// The presale state account
    pub presale: Pubkey,
    /// The mint account
    pub mint: Pubkey,
    /// The treasury account
    pub treasury: Pubkey,
    /// Start time of the presale
    pub start_time: i64,
    /// End time of the presale
    pub end_time: i64,
    /// Token price in USD (as u64 with 6 decimals precision)
    pub token_price: u64,
    /// Hard cap for the presale
    pub hard_cap: u64,
    /// Soft cap for the presale
    pub soft_cap: u64,
    /// Minimum purchase amount in USD (as u64 with 6 decimals precision)
    pub min_purchase: u64,
    /// Maximum purchase amount in USD (as u64 with 6 decimals precision)
    pub max_purchase: u64,
}

/// Parameters for buying tokens
#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct BuyTokensParams {
    /// The buyer's public key
    pub buyer: Pubkey,
    /// The presale state account
    pub presale: Pubkey,
    /// The mint account
    pub mint: Pubkey,
    /// The buyer's token account
    pub buyer_token_account: Pubkey,
    /// Authority that can mint tokens
    pub authority: Pubkey,
    /// The treasury account
    pub treasury: Pubkey,
    /// Amount in USD (as u64 with 6 decimals precision)
    pub amount_usd: u64,
}

/// Parameters for initializing vesting
#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct InitializeVestingParams {
    /// Authority that can manage vesting
    pub authority: Pubkey,
    /// The vesting state account
    pub vesting: Pubkey,
    /// The mint account
    pub mint: Pubkey,
    /// Total tokens to be vested
    pub total_tokens: u64,
    /// Vesting start timestamp
    pub start_time: i64,
    /// Release interval in seconds
    pub release_interval: i64,
    /// Number of releases
    pub num_releases: u8,
}

impl VCoinInstruction {
    /// Creates a new InitializeToken instruction
    pub fn initialize_token(
        program_id: &Pubkey,
        params: &InitializeTokenParams,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::InitializeToken {
            name: params.name.clone(),
            symbol: params.symbol.clone(),
            decimals: params.decimals,
            initial_supply: params.initial_supply,
            transfer_fee_basis_points: params.transfer_fee_basis_points,
            maximum_fee_rate: params.maximum_fee_rate,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(params.authority, true),      // Authority (signer)
            AccountMeta::new(params.mint, false),                  // Mint account
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false), // Token program
            AccountMeta::new_readonly(system_program::id(), false),  // System program
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false), // Rent sysvar
            AccountMeta::new(params.metadata, false),               // Metadata account
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new InitializePresale instruction
    pub fn initialize_presale(
        program_id: &Pubkey,
        params: &InitializePresaleParams,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::InitializePresale {
            start_time: params.start_time,
            end_time: params.end_time,
            token_price: params.token_price,
            hard_cap: params.hard_cap,
            soft_cap: params.soft_cap,
            min_purchase: params.min_purchase,
            max_purchase: params.max_purchase,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(params.authority, true),      // Authority (signer)
            AccountMeta::new(params.presale, false),               // Presale state account
            AccountMeta::new_readonly(params.mint, false),         // Mint account
            AccountMeta::new(params.treasury, false),              // Treasury account
            AccountMeta::new_readonly(system_program::id(), false), // System program
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false), // Rent sysvar
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new BuyTokens instruction
    pub fn buy_tokens(
        program_id: &Pubkey,
        params: &BuyTokensParams,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::BuyTokens {
            amount_usd: params.amount_usd,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new(params.buyer, true),                  // Buyer (signer)
            AccountMeta::new(params.presale, false),               // Presale state account
            AccountMeta::new(params.mint, false),                  // Mint account
            AccountMeta::new(params.buyer_token_account, false),   // Buyer's token account
            AccountMeta::new(params.authority, true),              // Authority (signer)
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false), // Token program
            AccountMeta::new_readonly(system_program::id(), false), // System program
            AccountMeta::new(params.treasury, false),              // Treasury account
            AccountMeta::new_readonly(sysvar::clock::id(), false),  // Clock sysvar
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new InitializeVesting instruction
    pub fn initialize_vesting(
        program_id: &Pubkey,
        params: &InitializeVestingParams,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::InitializeVesting {
            total_tokens: params.total_tokens,
            start_time: params.start_time,
            release_interval: params.release_interval,
            num_releases: params.num_releases,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(params.authority, true),      // Authority (signer)
            AccountMeta::new(params.vesting, false),               // Vesting state account
            AccountMeta::new_readonly(params.mint, false),         // Mint account
            AccountMeta::new_readonly(system_program::id(), false), // System program
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false), // Rent sysvar
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new AddVestingBeneficiary instruction
    pub fn add_vesting_beneficiary(
        program_id: &Pubkey,
        authority: &Pubkey,
        vesting: &Pubkey,
        beneficiary: &Pubkey,
        amount: u64,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::AddVestingBeneficiary {
            beneficiary: *beneficiary,
            amount,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(*authority, true),          // Authority (signer)
            AccountMeta::new(*vesting, false),                    // Vesting state account
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new ReleaseVestedTokens instruction
    pub fn release_vested_tokens(
        program_id: &Pubkey,
        authority: &Pubkey,
        vesting: &Pubkey,
        mint: &Pubkey,
        beneficiary: &Pubkey,
        beneficiary_token_account: &Pubkey,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::ReleaseVestedTokens {
            beneficiary: *beneficiary,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(*authority, true),           // Authority (signer)
            AccountMeta::new(*vesting, false),                     // Vesting state account
            AccountMeta::new(*mint, false),                        // Mint account
            AccountMeta::new(*beneficiary_token_account, false),   // Beneficiary's token account
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false), // Token program
            AccountMeta::new_readonly(sysvar::clock::id(), false), // Clock sysvar
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new UpdateTokenMetadata instruction
    pub fn update_token_metadata(
        program_id: &Pubkey,
        authority: &Pubkey,
        metadata: &Pubkey,
        mint: &Pubkey,
        name: Option<String>,
        symbol: Option<String>,
        uri: Option<String>,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::UpdateTokenMetadata {
            name,
            symbol,
            uri,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(*authority, true),           // Authority (signer)
            AccountMeta::new(*metadata, false),                    // Metadata account
            AccountMeta::new_readonly(*mint, false),               // Mint account
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false), // Token program
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new SetTransferFee instruction
    pub fn set_transfer_fee(
        program_id: &Pubkey,
        fee_authority: &Pubkey,
        mint: &Pubkey,
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::SetTransferFee {
            transfer_fee_basis_points,
            maximum_fee,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(*fee_authority, true),      // Fee authority (signer)
            AccountMeta::new(*mint, false),                       // Mint account
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false), // Token program
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new EndPresale instruction
    pub fn end_presale(
        program_id: &Pubkey,
        authority: &Pubkey,
        presale: &Pubkey,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::EndPresale;
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(*authority, true),           // Authority (signer)
            AccountMeta::new(*presale, false),                     // Presale state account
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new InitializeAutonomousController instruction
    pub fn initialize_autonomous_controller(
        program_id: &Pubkey,
        initial_price: u64,
        max_supply: u64,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::InitializeAutonomousController {
            initial_price,
            max_supply,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(Pubkey::default(), true), // Temporary authority (signer)
            AccountMeta::new(Pubkey::default(), false),          // Controller state account
            AccountMeta::new_readonly(Pubkey::default(), false), // Mint account
            AccountMeta::new_readonly(Pubkey::default(), false), // Price oracle account
            AccountMeta::new_readonly(system_program::id(), false), // System program
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false), // Token program
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false), // Rent sysvar
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new UpdateOraclePrice instruction
    pub fn update_oracle_price(
        program_id: &Pubkey,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::UpdateOraclePrice;
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(Pubkey::default(), false), // Controller state account
            AccountMeta::new_readonly(Pubkey::default(), false), // Primary price oracle account
            AccountMeta::new_readonly(sysvar::clock::id(), false), // Clock sysvar
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new ExecuteAutonomousMint instruction
    pub fn execute_autonomous_mint(
        program_id: &Pubkey,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::ExecuteAutonomousMint;
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new(Pubkey::default(), false),          // Controller state account
            AccountMeta::new(Pubkey::default(), false),          // Mint account
            AccountMeta::new_readonly(Pubkey::default(), false), // Mint authority PDA
            AccountMeta::new(Pubkey::default(), false),          // Destination account
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false), // Token program
            AccountMeta::new_readonly(sysvar::clock::id(), false), // Clock sysvar
            AccountMeta::new_readonly(Pubkey::default(), false), // Price oracle account
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new ExecuteAutonomousBurn instruction
    pub fn execute_autonomous_burn(
        program_id: &Pubkey,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::ExecuteAutonomousBurn;
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new(Pubkey::default(), false),          // Controller state account
            AccountMeta::new(Pubkey::default(), false),          // Mint account
            AccountMeta::new_readonly(Pubkey::default(), false), // Mint authority PDA
            AccountMeta::new(Pubkey::default(), false),          // Burn treasury token account
            AccountMeta::new_readonly(Pubkey::default(), false), // Burn treasury PDA
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false), // Token program
            AccountMeta::new_readonly(sysvar::clock::id(), false), // Clock sysvar
            AccountMeta::new_readonly(Pubkey::default(), false), // Price oracle account
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new PermanentlyDisableUpgrades instruction
    pub fn permanently_disable_upgrades(
        program_id: &Pubkey,
        current_upgrade_authority: &Pubkey,
        program_account: &Pubkey,
        program_data_account: &Pubkey,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::PermanentlyDisableUpgrades;
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(*current_upgrade_authority, true), // Current upgrade authority (signer)
            AccountMeta::new_readonly(*program_account, false),            // Program account
            AccountMeta::new_readonly(*program_data_account, false),         // Program data account
            AccountMeta::new_readonly(system_program::id(), false),            // System program
            AccountMeta::new_readonly(solana_program::bpf_loader::id(), false), // BPF Upgradeable Loader program
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new DepositToBurnTreasury instruction
    pub fn deposit_to_burn_treasury(
        program_id: &Pubkey,
        depositor: &Pubkey,
        depositor_token_account: &Pubkey,
        burn_treasury_token_account: &Pubkey,
        controller_state_account: &Pubkey,
        mint: &Pubkey,
        amount: u64,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::DepositToBurnTreasury {
            amount,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new(depositor, true),                  // Depositor (signer)
            AccountMeta::new(depositor_token_account, false),   // Depositor's token account
            AccountMeta::new(burn_treasury_token_account, false), // Burn treasury token account
            AccountMeta::new(controller_state_account, false),    // Controller state account
            AccountMeta::new(mint, false),                        // Mint account
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false), // Token program
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new InitializeBurnTreasury instruction
    pub fn initialize_burn_treasury(
        program_id: &Pubkey,
        payer: &Pubkey,
        controller_state_account: &Pubkey,
        mint: &Pubkey,
        burn_treasury_token_account: &Pubkey,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::InitializeBurnTreasury;
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new(payer, true),                  // Payer (signer)
            AccountMeta::new(controller_state_account, false),    // Controller state account
            AccountMeta::new(mint, false),                        // Mint account
            AccountMeta::new(burn_treasury_token_account, false), // Burn treasury token account
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false), // Token program
            AccountMeta::new_readonly(system_program::id(), false), // System program
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false), // Rent sysvar
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new ExpandPresaleAccount instruction
    pub fn expand_presale_account(
        program_id: &Pubkey,
        authority: &Pubkey,
        presale: &Pubkey,
        additional_buyers: u32,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::ExpandPresaleAccount {
            additional_buyers,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(*authority, true),           // Authority (signer)
            AccountMeta::new(*presale, false),                     // Presale state account
            AccountMeta::new_readonly(system_program::id(), false), // System program
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false), // Rent sysvar
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new InitializeUpgradeTimelock instruction
    pub fn initialize_upgrade_timelock(
        program_id: &Pubkey,
        current_upgrade_authority: &Pubkey,
        program_account: &Pubkey,
        program_data_account: &Pubkey,
        timelock_duration: i64,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::InitializeUpgradeTimelock {
            timelock_duration,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(*current_upgrade_authority, true), // Current upgrade authority (signer)
            AccountMeta::new(Pubkey::default(), false),          // Timelock state account (PDA)
            AccountMeta::new_readonly(*program_account, false),            // Program account
            AccountMeta::new_readonly(*program_data_account, false),         // Program data account
            AccountMeta::new_readonly(system_program::id(), false),            // System program
            AccountMeta::new_readonly(solana_program::bpf_loader::id(), false), // BPF Upgradeable Loader program
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new ProposeUpgrade instruction
    pub fn propose_upgrade(
        program_id: &Pubkey,
        current_upgrade_authority: &Pubkey,
        program_account: &Pubkey,
        program_data_account: &Pubkey,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::ProposeUpgrade;
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(*current_upgrade_authority, true), // Current upgrade authority (signer)
            AccountMeta::new(Pubkey::default(), false),          // Timelock state account (PDA)
            AccountMeta::new_readonly(*program_account, false),            // Program account
            AccountMeta::new_readonly(*program_data_account, false),         // Program data account
            AccountMeta::new_readonly(solana_program::bpf_loader::id(), false), // BPF Upgradeable Loader program
            AccountMeta::new_readonly(sysvar::clock::id(), false), // Clock sysvar
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }

    /// Creates a new ExecuteUpgrade instruction
    pub fn execute_upgrade(
        program_id: &Pubkey,
        current_upgrade_authority: &Pubkey,
        program_account: &Pubkey,
        program_data_account: &Pubkey,
        buffer: &Pubkey,
    ) -> Result<Instruction, std::io::Error> {
        let instr = Self::ExecuteUpgrade {
            buffer: *buffer,
        };
        let data = to_vec(&instr)?;

        let accounts = vec![
            AccountMeta::new_readonly(*current_upgrade_authority, true), // Current upgrade authority (signer)
            AccountMeta::new(Pubkey::default(), false),          // Timelock state account (PDA)
            AccountMeta::new(*program_account, false),            // Program account
            AccountMeta::new(*program_data_account, false),         // Program data account
            AccountMeta::new(*buffer, false),                        // Buffer account
            AccountMeta::new_readonly(solana_program::bpf_loader::id(), false), // BPF Upgradeable Loader program
            AccountMeta::new_readonly(sysvar::clock::id(), false), // Clock sysvar
            AccountMeta::new_readonly(system_program::id(), false), // Rent sysvar
        ];

        Ok(Instruction {
            program_id: *program_id,
            accounts,
            data,
        })
    }
} 