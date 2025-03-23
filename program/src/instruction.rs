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
    },
    /// Initialize a presale
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The authority
    /// 1. `[writable]` The presale state account
    /// 2. `[]` The mint account
    /// 3. `[writable]` The treasury account
    /// 4. `[]` The system program
    /// 5. `[]` Rent sysvar
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
    /// Buy tokens during presale
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The buyer
    /// 1. `[writable]` The presale state account
    /// 2. `[writable]` The mint account
    /// 3. `[writable]` The buyer's token account
    /// 4. `[signer]` The authority that can mint tokens
    /// 5. `[]` The token program (SPL Token-2022)
    /// 6. `[]` The system program
    /// 7. `[writable]` The treasury account
    /// 8. `[]` The clock sysvar
    BuyTokens {
        /// Amount in USD (as u64 with 6 decimals precision)
        amount_usd: u64,
    },
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
} 