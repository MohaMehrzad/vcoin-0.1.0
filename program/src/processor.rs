use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use spl_token_2022::instruction::{initialize_mint, mint_to};
use spl_token_2022::extension::{
    transfer_fee::instruction::{initialize_transfer_fee_config, set_transfer_fee},
};
use spl_token_2022::ID as TOKEN_2022_PROGRAM_ID;
use spl_token_2022::state::Mint;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_associated_token_account::instruction::create_associated_token_account;
use std::str::FromStr;
use pyth_sdk_solana::state::{ProductAccount, PriceAccount};
// Import Switchboard V2 SDK
use switchboard_v2::{AggregatorAccountData, SwitchboardDecimal};

use crate::{
    error::VCoinError,
    instruction::VCoinInstruction,
    state::{PresaleState, TokenMetadata, VestingState, VestingBeneficiary, AutonomousSupplyController, UpgradeTimelock},
};

// Add at the top of the file after existing imports:
use std::cell::RefCell;
use std::rc::Rc;

/// Parameters for initializing a presale
pub struct InitializePresaleParams {
    pub start_time: i64,
    pub end_time: i64,
    pub token_price: u64,
    pub hard_cap: u64,
    pub soft_cap: u64,
    pub min_purchase: u64,
    pub max_purchase: u64,
}

/// Parameters for initializing a vesting account
pub struct InitializeVestingParams {
    pub total_tokens: u64,
    pub start_time: i64,
    pub release_interval: i64,
    pub num_releases: u8,
}

/// Program state handler.
pub struct Processor;

// Define constants for clarity and consistency
/// USD price precision (6 decimals for microUSD)
pub const USD_DECIMALS: u32 = 6;

// Oracle freshness thresholds (in seconds)
pub mod oracle_freshness {
    // Standard freshness for price updates (3 hours)
    pub const STANDARD_FRESHNESS: i64 = 10_800; // 3 hours in seconds
    
    // Strict freshness for economic decisions (mint/burn) (1 hour)
    pub const STRICT_FRESHNESS: i64 = 3_600; // 1 hour in seconds
    
    // Maximum staleness after which data is considered completely invalid (24 hours)
    pub const MAX_STALENESS: i64 = 86_400; // 24 hours in seconds
    
    // Transaction processing timeout (5 minutes)
    pub const TRANSACTION_TIMEOUT: i64 = 300; // 5 minutes in seconds
    
    // Refund processing window (30 days)
    pub const REFUND_WINDOW: i64 = 30 * 24 * 60 * 60; // 30 days in seconds
    
    // Dev fund refund delay (1 year)
    pub const DEV_FUND_REFUND_DELAY: i64 = 365 * 24 * 60 * 60; // 1 year in seconds
}

// Add constants for security limits
/// Maximum price change percentage allowed in a single update (50% = 5000 basis points)
pub const MAX_PRICE_CHANGE_BPS: u64 = 5000;

/// Maximum confidence interval as percentage of price (5% = 500 basis points)
pub const MAX_CONFIDENCE_INTERVAL_BPS: u64 = 500;

/// Add reentrancy guard to protect against reentrancy attacks
pub struct ReentrancyGuard {
    locked: Rc<RefCell<bool>>,
}

impl ReentrancyGuard {
    pub fn new() -> Self {
        Self {
            locked: Rc::new(RefCell::new(false)),
        }
    }

    pub fn lock<F, T>(&self, func: F) -> Result<T, ProgramError>
    where
        F: FnOnce() -> Result<T, ProgramError>,
    {
        // Check if already locked (reentrant call)
        if *self.locked.borrow() {
            msg!("Reentrancy detected!");
            return Err(VCoinError::ReentrancyDetected.into());
        }
        
        // Lock
        *self.locked.borrow_mut() = true;
        
        // Execute function
        let result = func();
        
        // Unlock even if function failed
        *self.locked.borrow_mut() = false;
        
        result
    }
}

// Initialize a static reentrancy guard
lazy_static::lazy_static! {
    static ref REENTRANCY_GUARD: ReentrancyGuard = ReentrancyGuard::new();
}

impl Processor {
    /// Process a VCoin instruction
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        if instruction_data.is_empty() {
            return Err(VCoinError::InvalidInstructionData.into());
        }

        // Use the reentrancy guard for all sensitive instructions
        let instruction_tag = instruction_data[0];
        match instruction_tag {
            0 => {
                msg!("Instruction: Initialize Token");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::InitializeToken { name, symbol, decimals, initial_supply, transfer_fee_basis_points, maximum_fee_rate } = instruction {
                    Self::process_initialize_token(
                        program_id, 
                        accounts,
                        name,
                        symbol,
                        decimals,
                        initial_supply,
                        transfer_fee_basis_points,
                        maximum_fee_rate,
                    )
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            1 => {
                msg!("Instruction: Initialize Presale");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::InitializePresale { start_time, end_time, token_price, hard_cap, soft_cap, min_purchase, max_purchase } = instruction {
                    let params = InitializePresaleParams {
                        start_time,
                        end_time,
                        token_price,
                        hard_cap,
                        soft_cap,
                        min_purchase,
                        max_purchase,
                    };
                    Self::process_initialize_presale(program_id, accounts, params)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            2 => {
                msg!("Instruction: Buy Tokens With Stablecoin");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::BuyTokensWithStablecoin { amount } = instruction {
                    // Apply reentrancy protection to token purchase
                    REENTRANCY_GUARD.lock(|| {
                        Self::process_buy_tokens_with_stablecoin(program_id, accounts, amount)
                    })?
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            3 => {
                msg!("Instruction: Add Supported Stablecoin");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::AddSupportedStablecoin = instruction {
                    Self::process_add_supported_stablecoin(program_id, accounts)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            4 => {
                msg!("Instruction: Launch Token");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::LaunchToken = instruction {
                    Self::process_launch_token(program_id, accounts)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            5 => {
                msg!("Instruction: Claim Refund");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ClaimRefund = instruction {
                    // Apply reentrancy protection to refund claim
                    REENTRANCY_GUARD.lock(|| {
                        Self::process_claim_refund(program_id, accounts)
                    })?
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            6 => {
                msg!("Instruction: Withdraw Locked Funds");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::WithdrawLockedFunds = instruction {
                    // Apply reentrancy protection to locked funds withdrawal
                    REENTRANCY_GUARD.lock(|| {
                        Self::process_withdraw_locked_funds(program_id, accounts)
                    })?
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            7 => {
                msg!("Instruction: Initialize Vesting");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::InitializeVesting { total_tokens, start_time, release_interval, num_releases } = instruction {
                    let params = InitializeVestingParams {
                        total_tokens,
                        start_time,
                        release_interval,
                        num_releases,
                    };
                    Self::process_initialize_vesting(program_id, accounts, params)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            8 => {
                msg!("Instruction: Add Vesting Beneficiary");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::AddVestingBeneficiary { beneficiary, amount } = instruction {
                    Self::process_add_vesting_beneficiary(program_id, accounts, beneficiary, amount)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            9 => {
                msg!("Instruction: Release Vested Tokens");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ReleaseVestedTokens { beneficiary } = instruction {
                    // Apply reentrancy protection to token release
                    REENTRANCY_GUARD.lock(|| {
                        Self::process_release_vested_tokens(program_id, accounts, beneficiary)
                    })?
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            10 => {
                msg!("Instruction: Update Token Metadata");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::UpdateTokenMetadata { name, symbol, uri } = instruction {
                    Self::process_update_token_metadata(program_id, accounts, name, symbol, uri)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            11 => {
                msg!("Instruction: Set Transfer Fee");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::SetTransferFee { transfer_fee_basis_points, maximum_fee } = instruction {
                    Self::process_set_transfer_fee(program_id, accounts, transfer_fee_basis_points, maximum_fee)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            12 => {
                msg!("Instruction: End Presale");
                Self::process_end_presale(program_id, accounts)
            },
            13 => {
                msg!("Instruction: Initialize Autonomous Controller");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::InitializeAutonomousController { initial_price, max_supply } = instruction {
                    // Apply reentrancy protection
                    REENTRANCY_GUARD.lock(|| {
                        Self::process_initialize_autonomous_controller(
                            program_id,
                            accounts,
                            initial_price,
                            max_supply,
                        )
                    })?
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            14 => {
                msg!("Instruction: Update Oracle Price");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::UpdateOraclePrice = instruction {
                    // Apply reentrancy protection
                    REENTRANCY_GUARD.lock(|| {
                        Self::process_update_oracle_price(
                            program_id,
                            accounts,
                        )
                    })?
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            15 => {
                msg!("Instruction: Execute Autonomous Mint");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ExecuteAutonomousMint = instruction {
                    // Apply reentrancy protection to autonomous mint
                    REENTRANCY_GUARD.lock(|| {
                        Self::process_execute_autonomous_mint(program_id, accounts)
                    })?
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            16 => {
                msg!("Instruction: Execute Autonomous Burn");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ExecuteAutonomousBurn = instruction {
                    // Apply reentrancy protection to autonomous burn
                    REENTRANCY_GUARD.lock(|| {
                        Self::process_execute_autonomous_burn(program_id, accounts)
                    })?
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            17 => {
                msg!("Instruction: Permanently Disable Upgrades");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::PermanentlyDisableUpgrades = instruction {
                    Self::process_permanently_disable_upgrades(
                        program_id,
                        accounts,
                    )
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            18 => {
                msg!("Instruction: Deposit To Burn Treasury");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::DepositToBurnTreasury { amount } = instruction {
                    Self::process_deposit_to_burn_treasury(program_id, accounts, amount)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            19 => {
                msg!("Instruction: Initialize Burn Treasury");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::InitializeBurnTreasury = instruction {
                    Self::process_initialize_burn_treasury(program_id, accounts)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            20 => {
                msg!("Instruction: Expand Presale Account");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ExpandPresaleAccount { additional_buyers } = instruction {
                    Self::process_expand_presale_account(program_id, accounts, additional_buyers)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            21 => {
                msg!("Instruction: Initialize Upgrade Timelock");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::InitializeUpgradeTimelock { timelock_duration } = instruction {
                    Self::process_initialize_upgrade_timelock(program_id, accounts, timelock_duration)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            22 => {
                msg!("Instruction: Propose Upgrade");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ProposeUpgrade = instruction {
                    Self::process_propose_upgrade(program_id, accounts)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            23 => {
                msg!("Instruction: Execute Upgrade");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ExecuteUpgrade { buffer } = instruction {
                    Self::process_execute_upgrade(program_id, accounts, buffer)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            24 => {
                msg!("Instruction: Claim Dev Fund Refund");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ClaimDevFundRefund = instruction {
                    // Apply reentrancy protection to refund claim
                    REENTRANCY_GUARD.lock(|| {
                        Self::process_claim_dev_fund_refund(program_id, accounts)
                    })?
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            _ => {
                msg!("Instruction: Unknown");
                Err(VCoinError::InvalidInstruction.into())
            }
        }
    }

    /// Process SetTransferFee instruction with a hard 5% limit
    pub fn process_set_transfer_fee(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let fee_authority_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        
        // Verify token program is Token-2022
        if *token_program_info.key != TOKEN_2022_PROGRAM_ID {
            return Err(VCoinError::InvalidAccountOwner.into());
        }
        
        // Verify fee authority is a signer
        if !fee_authority_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }
        
        // Validate the transfer fee basis points (max 1% = 100 basis points)
        if transfer_fee_basis_points > 100 {
            msg!("Transfer fee cannot exceed 1% (100 basis points), attempted: {}", transfer_fee_basis_points);
            return Err(VCoinError::InvalidFeeAmount.into());
        }

        // Call the SPL Token-2022 program to set the transfer fee
        invoke(
            &set_transfer_fee(
                token_program_info.key,
                mint_info.key,
                fee_authority_info.key,
                transfer_fee_basis_points,
                maximum_fee,
            )?,
            &[
                mint_info.clone(),
                fee_authority_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        msg!("Transfer fee set to {} basis points, maximum fee {} units", 
             transfer_fee_basis_points, maximum_fee);
        Ok(())
    }

    /// Process ExpandPresaleAccount instruction
    /// Allows expanding the presale account to accommodate more buyers
    fn process_expand_presale_account(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        additional_buyers: u32,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let presale_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;

        // Verify authority signed the transaction
        if !authority_info.is_signer {
            msg!("Authority must sign transaction");
            return Err(VCoinError::Unauthorized.into());
        }

        // Verify presale account ownership
        if presale_info.owner != program_id {
            msg!("Presale account not owned by program");
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Load presale state
        let mut presale_state = PresaleState::try_from_slice(&presale_info.data.borrow())?;

        // Verify presale is initialized
        if !presale_state.is_initialized {
            msg!("Presale not initialized");
            return Err(VCoinError::NotInitialized.into());
        }

        // Verify authority is presale owner
        if presale_state.authority != *authority_info.key {
            msg!("Only the presale authority can expand the account");
            return Err(VCoinError::Unauthorized.into());
        }

        // Calculate the current account size
        let current_size = presale_info.data_len();

        // Calculate the new size needed
        let total_buyers = presale_state.num_buyers.checked_add(additional_buyers)
            .ok_or(VCoinError::CalculationError)?;
        
        // Safety check for extremely large buyer numbers
        if total_buyers > 5_000_000 {
            msg!("Expansion would exceed maximum supported buyers (5,000,000)");
            return Err(VCoinError::InvalidPresaleParameters.into());
        }
        
        let new_size = PresaleState::get_size_for_buyers(total_buyers as usize);
        
        msg!("Expanding presale account from {} to {} bytes to support {} more buyers", 
             current_size, new_size, additional_buyers);

        // Resize the account
        if new_size > current_size {
            // Calculate the additional lamports needed for rent-exemption
            let rent = Rent::from_account_info(rent_info)?;
            let current_minimum_balance = rent.minimum_balance(current_size);
            let new_minimum_balance = rent.minimum_balance(new_size);
            
            let lamports_needed = new_minimum_balance.checked_sub(current_minimum_balance)
                .ok_or(VCoinError::CalculationError)?;
            
            if lamports_needed > 0 {
                msg!("Transferring {} lamports to fund account expansion", lamports_needed);
                
                // Transfer the additional lamports
                invoke(
                    &solana_program::system_instruction::transfer(
                        authority_info.key,
                        presale_info.key,
                        lamports_needed,
                    ),
                    &[
                        authority_info.clone(),
                        presale_info.clone(),
                        system_program_info.clone(),
                    ],
                )?;
            }
            
            // Resize the account data
            presale_info.realloc(new_size, false)?;
        }

        // Save updated presale state
        presale_state.serialize(&mut *presale_info.data.borrow_mut())?;

        msg!("Presale account successfully expanded to accommodate {} total buyers", total_buyers);
        Ok(())
    }

    /// Process LaunchToken instruction
    fn process_launch_token(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let presale_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Verify authority signed the transaction
        if !authority_info.is_signer {
            msg!("Authority must sign transaction");
            return Err(VCoinError::Unauthorized.into());
        }

        // Load presale state
        let mut presale_state = PresaleState::try_from_slice(&presale_info.data.borrow())?;

        // Verify presale account ownership
        if presale_info.owner != program_id {
            msg!("Presale account not owned by program");
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Verify authority is presale owner
        if presale_state.authority != *authority_info.key {
            msg!("Caller is not the presale authority");
            return Err(VCoinError::Unauthorized.into());
        }

        // Verify presale is initialized
        if !presale_state.is_initialized {
            msg!("Presale is not initialized");
            return Err(VCoinError::NotInitialized.into());
        }

        // Verify presale has ended
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;
        
        if current_time < presale_state.end_time {
            msg!("Presale has not ended yet");
            return Err(VCoinError::PresaleNotEnded.into());
        }

        // Verify token hasn't already been launched
        if presale_state.token_launched {
            msg!("Token has already been launched");
            return Err(VCoinError::TokenAlreadyLaunched.into());
        }

        // Set token as launched and calculate refund dates
        presale_state.token_launched = true;
        presale_state.launch_timestamp = current_time;
        
        // Calculate standard refund availability: launch + 3 months (use constant)
        let seconds_in_three_months = 90 * 24 * 60 * 60;
        presale_state.refund_available_timestamp = current_time
            .checked_add(seconds_in_three_months)
            .ok_or(VCoinError::CalculationError)?;
            
        // Calculate standard refund period end using our new constant
        presale_state.refund_period_end_timestamp = presale_state.refund_available_timestamp
            .checked_add(oracle_freshness::REFUND_WINDOW)
            .ok_or(VCoinError::CalculationError)?;
        
        // Calculate dev fund refund availability using our new constant
        presale_state.dev_refund_available_timestamp = current_time
            .checked_add(oracle_freshness::DEV_FUND_REFUND_DELAY)
            .ok_or(VCoinError::CalculationError)?;
            
        // Calculate dev fund refund period end using our constant
        presale_state.dev_refund_period_end_timestamp = presale_state.dev_refund_available_timestamp
            .checked_add(oracle_freshness::REFUND_WINDOW)
            .ok_or(VCoinError::CalculationError)?;
        
        // Set whether dev funds are refundable (only if softcap wasn't reached)
        presale_state.dev_funds_refundable = !presale_state.soft_cap_reached;
        
        // If softcap was reached, all funds are released for development
        if presale_state.soft_cap_reached {
            msg!("Soft cap was reached - all funds released for development");
        } else {
            msg!("Soft cap was not reached - additional refunds will be available after 1 year");
        }

        // Save updated presale state
        presale_state.serialize(&mut *presale_info.data.borrow_mut())?;

        msg!("Token successfully launched");
        Ok(())
    }

    /// Process UpdateOraclePrice instruction with thorough ownership verification
    fn process_update_oracle_price(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let controller_info = next_account_info(account_info_iter)?;
        let primary_oracle_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;
        
        // Optional backup oracles (may be multiple)
        let mut backup_oracle_infos = Vec::new();
        while account_info_iter.len() > 0 {
            backup_oracle_infos.push(next_account_info(account_info_iter)?);
        }

        // Verify controller account ownership
        if controller_info.owner != program_id {
            msg!("Controller account not owned by program");
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Load controller state
        let mut controller_state = AutonomousSupplyController::try_from_slice(&controller_info.data.borrow())?;

        // Verify controller is initialized
        if !controller_state.is_initialized {
            msg!("Controller not initialized");
            return Err(VCoinError::NotInitialized.into());
        }

        // Get current timestamp
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Define known oracle program IDs
        let pyth_program_id = Pubkey::from_str("FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH").unwrap_or_default(); // Pyth mainnet
        let pyth_devnet_id = Pubkey::from_str("gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s").unwrap_or_default(); // Pyth devnet
        let switchboard_program_id = Pubkey::from_str("DtmE9D2CSB4L5D6A15mraeEjrGMm6auWVzgaD8hK2tZM").unwrap_or_default(); // Switchboard mainnet
        let switchboard_devnet_id = Pubkey::from_str("7azgmy1pFXHikv36q1zZASvFq5vFa39TT9NweVugKKTU").unwrap_or_default(); // Switchboard devnet

        // Track oracle success
        let mut successful_oracles = 0;
        let mut total_price: u128 = 0;
        let mut price_count = 0;
        let mut final_price: u64 = 0;
        let mut final_confidence: u64 = 0;
        let mut newest_publish_time: i64 = 0;
        let mut used_backup = false;

        // Try to parse primary oracle first
        if primary_oracle_info.owner == &pyth_program_id || primary_oracle_info.owner == &pyth_devnet_id {
            msg!("Using Pyth oracle for primary price data");
            
            match Self::try_get_pyth_price(primary_oracle_info, current_time) {
                Ok((price, confidence, publish_time)) => {
                    msg!("Successfully got price from Pyth: {} USD", 
                         price as f64 / 10f64.powi(USD_DECIMALS as i32));
                    
                    total_price = total_price.checked_add(price as u128)
                        .ok_or_else(|| {
                            msg!("Arithmetic overflow in price aggregation");
                            VCoinError::CalculationError
                        })?;
                    price_count += 1;
                    successful_oracles += 1;
                    newest_publish_time = publish_time;
                    final_price = price;
                    final_confidence = confidence;
                }
                Err(err) => {
                    msg!("Failed to get price from primary Pyth oracle: {:?}", err);
                    // Continue to backup oracles
                }
            }
        } else if primary_oracle_info.owner == &switchboard_program_id || primary_oracle_info.owner == &switchboard_devnet_id {
            msg!("Using Switchboard oracle for primary price data");
            
            match Self::try_get_switchboard_price(primary_oracle_info, current_time) {
                Ok((price, confidence, publish_time)) => {
                    msg!("Successfully got price from Switchboard: {} USD", 
                         price as f64 / 10f64.powi(USD_DECIMALS as i32));
                    
                    total_price = total_price.checked_add(price as u128)
                        .ok_or_else(|| {
                            msg!("Arithmetic overflow in price aggregation");
                            VCoinError::CalculationError
                        })?;
                    price_count += 1;
                    successful_oracles += 1;
                    newest_publish_time = publish_time;
                    final_price = price;
                    final_confidence = confidence;
                }
                Err(err) => {
                    msg!("Failed to get price from primary Switchboard oracle: {:?}", err);
                    // Continue to backup oracles
                }
            }
        } else {
            msg!("Primary oracle not owned by a recognized oracle provider");
            msg!("Expected either Pyth or Switchboard");
            msg!("Found: {}", primary_oracle_info.owner);
            // Continue to try backup oracles
        }

        // If primary oracle failed, try the backup oracles
        if successful_oracles == 0 && !backup_oracle_infos.is_empty() {
            msg!("Primary oracle failed, trying {} backup oracles", backup_oracle_infos.len());
            used_backup = true;
            
            for (i, oracle_info) in backup_oracle_infos.iter().enumerate() {
                if oracle_info.owner == &pyth_program_id || oracle_info.owner == &pyth_devnet_id {
                    msg!("Trying backup Pyth oracle #{}", i + 1);
                    
                    match Self::try_get_pyth_price(oracle_info, current_time) {
                        Ok((price, confidence, publish_time)) => {
                            msg!("Successfully got price from backup Pyth oracle: {} USD", 
                                 price as f64 / 10f64.powi(USD_DECIMALS as i32));
                            
                            total_price = total_price.checked_add(price as u128)
                                .ok_or_else(|| {
                                    msg!("Arithmetic overflow in price aggregation");
                                    VCoinError::CalculationError
                                })?;
                            price_count += 1;
                            successful_oracles += 1;
                            
                            if publish_time > newest_publish_time {
                                newest_publish_time = publish_time;
                                final_price = price;
                                final_confidence = confidence;
                            }
                            
                            // Continue checking other oracles for aggregation
                        }
                        Err(err) => {
                            msg!("Failed to get price from backup Pyth oracle #{}: {:?}", i + 1, err);
                            // Continue to next backup
                        }
                    }
                } else if oracle_info.owner == &switchboard_program_id || oracle_info.owner == &switchboard_devnet_id {
                    msg!("Trying backup Switchboard oracle #{}", i + 1);
                    
                    match Self::try_get_switchboard_price(oracle_info, current_time) {
                        Ok((price, confidence, publish_time)) => {
                            msg!("Successfully got price from backup Switchboard oracle: {} USD", 
                                 price as f64 / 10f64.powi(USD_DECIMALS as i32));
                            
                            total_price = total_price.checked_add(price as u128)
                                .ok_or_else(|| {
                                    msg!("Arithmetic overflow in price aggregation");
                                    VCoinError::CalculationError
                                })?;
                            price_count += 1;
                            successful_oracles += 1;
                            
                            if publish_time > newest_publish_time {
                                newest_publish_time = publish_time;
                                final_price = price;
                                final_confidence = confidence;
                            }
                            
                            // Continue checking other oracles for aggregation
                        }
                        Err(err) => {
                            msg!("Failed to get price from backup Switchboard oracle #{}: {:?}", i + 1, err);
                            // Continue to next backup
                        }
                    }
                } else {
                    msg!("Backup oracle #{} not owned by a recognized oracle provider: {}", 
                         i + 1, oracle_info.owner);
                    // Continue to next backup
                }
            }
        }

        // If we have multiple valid oracle prices, calculate median or average
        if price_count > 1 {
            // Calculate the average price from all valid oracles
            let average_price = total_price.checked_div(price_count as u128)
                .ok_or(VCoinError::CalculationError)?;
                
            if average_price > u64::MAX as u128 {
                msg!("Average price exceeds u64 max value");
                return Err(VCoinError::CalculationError.into());
            }
            
            final_price = average_price as u64;
            msg!("Using average price from {} oracles: {} USD", 
                 price_count, final_price as f64 / 10f64.powi(USD_DECIMALS as i32));
        }

        // Verify we successfully got a price
        if successful_oracles == 0 || final_price == 0 {
            msg!("No valid price obtained from any oracles");
            return Err(VCoinError::InvalidOracleData.into());
        }
        
        // Check for price manipulation (excessive change)
        if controller_state.current_price > 0 {
            let prev_price = controller_state.current_price;
            
            // Calculate the percentage change in basis points (10000 = 100%)
            let change_bps = if final_price > prev_price {
                // Price increased
                final_price.checked_sub(prev_price)
                    .ok_or_else(|| {
                        msg!("Arithmetic underflow in price change calculation");
                        VCoinError::CalculationError
                    })?
                    .checked_mul(10000)
                    .ok_or_else(|| {
                        msg!("Arithmetic overflow in price change calculation");
                        VCoinError::CalculationError
                    })?
                    .checked_div(prev_price)
                    .ok_or_else(|| {
                        msg!("Division by zero in price change calculation");
                        VCoinError::CalculationError
                    })?
            } else {
                // Price decreased
                prev_price.checked_sub(final_price)
                    .ok_or_else(|| {
                        msg!("Arithmetic underflow in price change calculation");
                        VCoinError::CalculationError
                    })?
                    .checked_mul(10000)
                    .ok_or_else(|| {
                        msg!("Arithmetic overflow in price change calculation");
                        VCoinError::CalculationError
                    })?
                    .checked_div(prev_price)
                    .ok_or_else(|| {
                        msg!("Division by zero in price change calculation");
                        VCoinError::CalculationError
                    })?
            };
            
            // Check if change exceeds limit
            if change_bps > MAX_PRICE_CHANGE_BPS {
                msg!("Excessive price change detected: {}% (max allowed: {}%)", 
                     change_bps as f64 / 100.0, 
                     MAX_PRICE_CHANGE_BPS as f64 / 100.0);
                return Err(VCoinError::ExcessivePriceChange.into());
            }
            
            msg!("Price change: {}% from previous ${} to new ${}", 
                 (change_bps as f64 / 100.0),
                 (prev_price as f64 / 10f64.powi(USD_DECIMALS as i32)),
                 (final_price as f64 / 10f64.powi(USD_DECIMALS as i32)));
        }
        
        // Update controller state with the new price
        controller_state.current_price = final_price;
        controller_state.last_price_update = current_time;
        
        // If it's a new year, update the year start price
        let year_start_timestamp = controller_state.year_start_timestamp;
        let seconds_in_year = 365 * 24 * 60 * 60; // 365 days
        
        if current_time >= year_start_timestamp + seconds_in_year {
            msg!("Updating year start price for new year period");
            controller_state.year_start_price = final_price;
            controller_state.year_start_timestamp = current_time;
        }
        
        // Save updated controller state
        controller_state.serialize(&mut *controller_info.data.borrow_mut())?;
        
        msg!("Oracle price successfully updated to {} USD (confidence: {} USD)", 
             (final_price as f64 / 10f64.powi(USD_DECIMALS as i32)),
             (final_confidence as f64 / 10f64.powi(USD_DECIMALS as i32)));
        Ok(())
    }

    /// Helper method to try getting a price from a Pyth oracle
    fn try_get_pyth_price(
        oracle_info: &AccountInfo,
        current_time: i64,
    ) -> Result<(u64, u64, i64), ProgramError> {
        match PriceAccount::load(oracle_info) {
            Ok(price_account) => {
                // Verify price account is valid
                if !price_account.is_valid() {
                    msg!("Pyth price account invalid status");
                    return Err(VCoinError::InvalidOracleData.into());
                }

                // Get price and confidence
                let pyth_price = price_account.get_current_price()
                    .ok_or(VCoinError::InvalidOracleData)?;
                
                // Pyth prices can be negative, but we don't accept negative prices
                if pyth_price < 0 {
                    msg!("Negative price from Pyth: {}", pyth_price);
                    return Err(VCoinError::InvalidOracleData.into());
                }
                
                // Get confidence interval
                let pyth_confidence = price_account.get_current_conf()
                    .ok_or(VCoinError::InvalidOracleData)?;
                
                // Check confidence relative to price (reject if too uncertain)
                let confidence_bps = (pyth_confidence as u64)
                    .checked_mul(10000)
                    .and_then(|v| v.checked_div(pyth_price as u64))
                    .unwrap_or(u64::MAX);
                
                if confidence_bps > MAX_CONFIDENCE_INTERVAL_BPS {
                    msg!("Price confidence interval too large: {}% of price", 
                         confidence_bps as f64 / 100.0);
                    return Err(VCoinError::LowConfidencePriceData.into());
                }
                
                // Check for freshness (prices must be recent)
                let publish_time = price_account.timestamp;
                let time_since_update = current_time.checked_sub(publish_time)
                    .unwrap_or_else(|| {
                        // If timestamp is in the future (should not happen normally), 
                        // treat as just published (0 seconds old)
                        msg!("Warning: Oracle timestamp is in the future");
                        0
                    });
                
                if time_since_update > oracle_freshness::MAX_STALENESS {
                    msg!("Oracle data critically stale: {} seconds old", time_since_update);
                    return Err(VCoinError::CriticallyStaleOracleData.into());
                } else if time_since_update > oracle_freshness::STANDARD_FRESHNESS {
                    msg!("Oracle data moderately stale: {} seconds old", time_since_update);
                    // Warning only, still usable but not for critical operations
                }
                
                // Convert price to u64 with USD_DECIMALS (6) precision
                // Pyth prices are stored as fixed-point values with expo determining the scale
                let exponent = price_account.expo;
                let scale_factor = 10u64.pow((USD_DECIMALS as i32 - exponent) as u32);
                
                let price = (pyth_price as u64).checked_mul(scale_factor)
                    .ok_or_else(|| {
                        msg!("Arithmetic overflow in Pyth price conversion");
                        VCoinError::CalculationError
                    })?;
                
                let confidence = (pyth_confidence as u64).checked_mul(scale_factor)
                    .ok_or_else(|| {
                        msg!("Arithmetic overflow in Pyth confidence conversion");
                        VCoinError::CalculationError
                    })?;
                
                Ok((price, confidence, publish_time))
            }
            Err(err) => {
                msg!("Failed to parse Pyth price account: {}", err);
                Err(VCoinError::InvalidOracleData.into())
            }
        }
    }

    /// Helper method to try getting a price from a Switchboard oracle
    fn try_get_switchboard_price(
        oracle_info: &AccountInfo,
        current_time: i64,
    ) -> Result<(u64, u64, i64), ProgramError> {
        match AggregatorAccountData::new(oracle_info) {
            Ok(aggregator) => {
                // Get latest Switchboard result
                let sb_result = aggregator.get_result()
                    .map_err(|_| VCoinError::InvalidOracleData)?;
                    
                // Check if the value is negative
                if sb_result.is_negative() {
                    msg!("Negative price from Switchboard");
                    return Err(VCoinError::InvalidOracleData.into());
                }
                
                // Convert to u64 with USD_DECIMALS (6) precision
                let sb_decimal = SwitchboardDecimal::from(sb_result);
                let price = sb_decimal.to_u64(USD_DECIMALS as u32)
                    .ok_or(VCoinError::InvalidOracleData)?;
                
                // Get confidence interval
                let sb_std = aggregator.latest_confirmed_round.std_deviation;
                let confidence = sb_std.to_u64(USD_DECIMALS as u32)
                    .unwrap_or_default();
                    
                // Check confidence percentage
                let confidence_bps = confidence
                    .checked_mul(10000)
                    .and_then(|v| v.checked_div(price))
                    .unwrap_or(u64::MAX);
                    
                if confidence_bps > MAX_CONFIDENCE_INTERVAL_BPS {
                    msg!("Price confidence interval too large: {}% of price", 
                         confidence_bps as f64 / 100.0);
                    return Err(VCoinError::LowConfidencePriceData.into());
                }
                
                // Check for freshness
                let publish_time = aggregator.latest_confirmed_round.round_open_timestamp as i64;
                let time_since_update = current_time.checked_sub(publish_time)
                    .unwrap_or_else(|| {
                        // If timestamp is in the future (should not happen normally), 
                        // treat as just published (0 seconds old)
                        msg!("Warning: Oracle timestamp is in the future");
                        0
                    });
                
                if time_since_update > oracle_freshness::MAX_STALENESS {
                    msg!("Oracle data critically stale: {} seconds old", time_since_update);
                    return Err(VCoinError::CriticallyStaleOracleData.into());
                } else if time_since_update > oracle_freshness::STANDARD_FRESHNESS {
                    msg!("Oracle data moderately stale: {} seconds old", time_since_update);
                    // Warning only, still usable but not for critical operations
                }
                
                Ok((price, confidence, publish_time))
            }
            Err(err) => {
                msg!("Failed to parse Switchboard aggregator: {:?}", err);
                Err(VCoinError::InvalidOracleData.into())
            }
        }
    }

    /// Process ExecuteAutonomousBurn instruction with strict authorization controls
    fn process_execute_autonomous_burn(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let controller_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let mint_authority_info = next_account_info(account_info_iter)?;
        let burn_treasury_token_account_info = next_account_info(account_info_iter)?;
        let burn_treasury_authority_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;
        let oracle_info = next_account_info(account_info_iter)?;

        // Verify controller account ownership
        if controller_info.owner != program_id {
            msg!("Controller account not owned by program");
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Load controller state
        let mut controller_state = AutonomousSupplyController::try_from_slice(&controller_info.data.borrow())?;

        // Verify controller is initialized
        if !controller_state.is_initialized {
            msg!("Controller not initialized");
            return Err(VCoinError::NotInitialized.into());
        }

        // Verify mint matches controller
        if controller_state.mint != *mint_info.key {
            msg!("Mint mismatch: expected {}, found {}", 
                 controller_state.mint, mint_info.key);
            return Err(VCoinError::InvalidMint.into());
        }

        // Get current timestamp
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Verify mint authority PDA (this is a derived account, not a signer)
        let (expected_mint_authority, authority_bump) = 
            Pubkey::find_program_address(&[b"mint_authority", mint_info.key.as_ref()], program_id);
            
        if expected_mint_authority != *mint_authority_info.key {
            msg!("Invalid mint authority PDA: expected {}, found {}", 
                 expected_mint_authority, mint_authority_info.key);
            return Err(VCoinError::InvalidMintAuthority.into());
        }

        // Verify burn treasury authority PDA (this is a derived account, not a signer)
        let (expected_burn_treasury_authority, burn_treasury_bump) = 
            Pubkey::find_program_address(&[b"burn_treasury", mint_info.key.as_ref()], program_id);
            
        if expected_burn_treasury_authority != *burn_treasury_authority_info.key {
            msg!("Invalid burn treasury authority: expected {}, found {}", 
                 expected_burn_treasury_authority, burn_treasury_authority_info.key);
            return Err(VCoinError::InvalidBurnTreasury.into());
        }

        // Verify burn treasury token account's owner is the burn treasury authority
        // This ensures we're only burning from the official treasury account
        let token_account_data = spl_token_2022::state::Account::unpack(&burn_treasury_token_account_info.data.borrow())?;
        
        if token_account_data.owner != expected_burn_treasury_authority {
            msg!("Burn treasury token account owned by {}, expected {}", 
                 token_account_data.owner, expected_burn_treasury_authority);
            return Err(VCoinError::UnauthorizedBurnSource.into());
        }
        
        // Verify mint matches token account's mint
        if token_account_data.mint != *mint_info.key {
            msg!("Burn source token account mint mismatch");
            return Err(VCoinError::InvalidMint.into());
        }
        
        // Verify token program
        if token_program_info.key != &TOKEN_2022_PROGRAM_ID {
            msg!("Invalid token program: expected Token-2022 program");
            return Err(ProgramError::IncorrectProgramId);
        }

        // Verify oracle is the one registered with controller
        if *oracle_info.key != controller_state.price_oracle {
            msg!("Oracle mismatch: expected {}, found {}", 
                 controller_state.price_oracle, oracle_info.key);
            return Err(VCoinError::InvalidOracleAccount.into());
        }

        // Check how long since last price update
        let time_since_update = current_time.checked_sub(controller_state.last_price_update)
            .unwrap_or_else(|| {
                // If timestamp is in the future (should not happen normally), 
                // treat as just updated (0 seconds old)
                msg!("Warning: Last price update timestamp is in the future");
                0
            });

        if time_since_update > oracle_freshness::STRICT_FRESHNESS {
            msg!("Price data too stale for burn operation: {} seconds old", time_since_update);
            msg!("Autonomous supply operations require data no older than {} seconds", 
                 oracle_freshness::STRICT_FRESHNESS);
            return Err(VCoinError::StaleOracleData.into());
        }

        // Check if supply is already at minimum - if so, don't burn
        if controller_state.current_supply <= controller_state.min_supply {
            msg!("Supply is already at minimum threshold (1B tokens), burning not allowed");
            return Ok(());
        }

        // Calculate how much to burn based on price changes
        let burn_amount = match controller_state.calculate_burn_amount() {
            Some(amount) => amount,
            None => {
                msg!("Error calculating burn amount");
                return Err(VCoinError::CalculationError.into());
            }
        };

        // If burn amount is zero, nothing to do
        if burn_amount == 0 {
            msg!("No burning required based on current economic conditions");
            return Ok(());
        }

        // Check if burn treasury has enough tokens
        if token_account_data.amount < burn_amount {
            msg!("Burn treasury has insufficient tokens: {} < {}", 
                 token_account_data.amount, burn_amount);
            
            // Burn what we can instead of failing
            let actual_burn_amount = token_account_data.amount;
            msg!("Adjusting burn amount to available balance: {}", actual_burn_amount);
            
            if actual_burn_amount == 0 {
                msg!("Burn treasury is empty, nothing to burn");
                return Ok(());
            }
            
            // Proceed with adjusted amount
            execute_burn(
                mint_info,
                burn_treasury_token_account_info,
                burn_treasury_authority_info,
                token_program_info,
                actual_burn_amount,
                burn_treasury_bump,
                program_id,
                mint_info.key,
            )?;
            
            // Update controller state with the new supply
            controller_state.current_supply = controller_state.current_supply
                .checked_sub(actual_burn_amount)
                .ok_or(VCoinError::CalculationError)?;
        } else {
            // We have enough tokens, burn the calculated amount
            msg!("Burning {} tokens from burn treasury", burn_amount);
            
            execute_burn(
                mint_info,
                burn_treasury_token_account_info,
                burn_treasury_authority_info,
                token_program_info,
                burn_amount,
                burn_treasury_bump,
                program_id,
                mint_info.key,
            )?;
            
            // Update controller state with the new supply
            controller_state.current_supply = controller_state.current_supply
                .checked_sub(burn_amount)
                .ok_or(VCoinError::CalculationError)?;
        }

        // Update last burn timestamp
        controller_state.last_mint_timestamp = current_time;
        
        // Save updated controller state
        controller_state.serialize(&mut *controller_info.data.borrow_mut())?;

        msg!("Autonomous burn completed successfully, new supply: {}", 
             controller_state.current_supply);
        Ok(())
    }
    
    /// Helper function to execute burn with treasury authority signature
    fn execute_burn(
        mint_info: &AccountInfo,
        source_info: &AccountInfo,
        authority_info: &AccountInfo,
        token_program_info: &AccountInfo,
        amount: u64,
        authority_bump: u8,
        program_id: &Pubkey,
        mint_key: &Pubkey,
    ) -> ProgramResult {
        msg!("Executing burn of {} tokens", amount);
        
        // Create burn instruction
        let burn_ix = spl_token_2022::instruction::burn(
            token_program_info.key,
            source_info.key,
            mint_info.key,
            authority_info.key,
            &[],
            amount,
        )?;
        
        // Sign and invoke burn instruction with PDA authority
        invoke_signed(
            &burn_ix,
            &[
                source_info.clone(),
                mint_info.clone(),
                authority_info.clone(),
                token_program_info.clone(),
            ],
            &[
                &[b"burn_treasury", mint_key.as_ref(), &[authority_bump]],
            ],
        )?;
        
        msg!("Burn transaction successful");
        Ok(())
    }

    /// Check if an account exists on-chain
    fn account_exists(pubkey: &Pubkey) -> bool {
        // Use the Solana runtime to check if the account exists and has lamports
        match solana_program::program::get_account_info_and_rent_exempt_balance(pubkey) {
            Ok((_, lamports)) => lamports > 0,
            Err(_) => false,
        }
    }
    
    /// Check if a token account exists for a given owner and mint
    fn token_account_exists(
        owner: &Pubkey, 
        mint: &Pubkey, 
        token_program: &Pubkey
    ) -> bool {
        let token_account = get_associated_token_address_with_program_id(
            owner,
            mint,
            token_program,
        );
        Self::account_exists(&token_account)
    }

    /// Process ExecuteAutonomousMint instruction with secure authorization
    fn process_execute_autonomous_mint(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let controller_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let mint_authority_info = next_account_info(account_info_iter)?;
        let destination_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;
        let oracle_info = next_account_info(account_info_iter)?;

        // Verify controller account ownership
        if controller_info.owner != program_id {
            msg!("Controller account not owned by program");
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Load controller state
        let mut controller_state = AutonomousSupplyController::try_from_slice(&controller_info.data.borrow())?;

        // Verify controller is initialized
        if !controller_state.is_initialized {
            msg!("Controller not initialized");
            return Err(VCoinError::NotInitialized.into());
        }

        // Verify mint matches controller
        if controller_state.mint != *mint_info.key {
            msg!("Mint mismatch: expected {}, found {}", 
                 controller_state.mint, mint_info.key);
            return Err(VCoinError::InvalidMint.into());
        }

        // Get current timestamp
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Verify mint authority PDA (this is a derived account, not a signer)
        let (expected_mint_authority, mint_authority_bump) = 
            Pubkey::find_program_address(&[b"mint_authority", mint_info.key.as_ref()], program_id);
            
        if expected_mint_authority != *mint_authority_info.key {
            msg!("Invalid mint authority PDA: expected {}, found {}", 
                 expected_mint_authority, mint_authority_info.key);
            return Err(VCoinError::InvalidMintAuthority.into());
        }
        
        // Verify token program
        if token_program_info.key != &TOKEN_2022_PROGRAM_ID {
            msg!("Invalid token program: expected Token-2022 program");
            return Err(ProgramError::IncorrectProgramId);
        }

        // Verify destination account is a valid token account
        let destination_data = spl_token_2022::state::Account::unpack(&destination_info.data.borrow())
            .map_err(|_| {
                msg!("Destination is not a valid token account");
                VCoinError::InvalidAccountOwner
            })?;
            
        // Verify destination account's mint matches
        if destination_data.mint != *mint_info.key {
            msg!("Destination token account mint mismatch");
            return Err(VCoinError::InvalidMint.into());
        }

        // Verify oracle is the one registered with controller
        if *oracle_info.key != controller_state.price_oracle {
            msg!("Oracle mismatch: expected {}, found {}", 
                 controller_state.price_oracle, oracle_info.key);
            return Err(VCoinError::InvalidOracleAccount.into());
        }

        // Check how long since last price update
        let time_since_update = current_time.checked_sub(controller_state.last_price_update)
            .unwrap_or_else(|| {
                // If timestamp is in the future (should not happen normally), 
                // treat as just updated (0 seconds old)
                msg!("Warning: Last price update timestamp is in the future");
                0
            });

        if time_since_update > oracle_freshness::STRICT_FRESHNESS {
            msg!("Price data too stale for mint operation: {} seconds old", time_since_update);
            msg!("Autonomous supply operations require data no older than {} seconds", 
                 oracle_freshness::STRICT_FRESHNESS);
            return Err(VCoinError::StaleOracleData.into());
        }

        // Calculate how much to mint based on price changes
        let mint_amount = match controller_state.calculate_mint_amount() {
            Some(amount) => amount,
            None => {
                msg!("Error calculating mint amount");
                return Err(VCoinError::CalculationError.into());
            }
        };

        // If mint amount is zero, nothing to do
        if mint_amount == 0 {
            msg!("No minting required based on current economic conditions");
            return Ok(());
        }

        // We can mint the full calculated amount
        msg!("Minting {} tokens to destination", mint_amount);
        
        // Execute the mint operation
        execute_mint(
            mint_info,
            destination_info,
            mint_authority_info,
            token_program_info,
            mint_amount,
            mint_authority_bump,
            program_id,
            mint_info.key,
        )?;
        
        // Update controller state with the new supply
        controller_state.current_supply = controller_state.current_supply
            .checked_add(mint_amount)
            .ok_or(VCoinError::CalculationError)?;

        // Update last mint timestamp
        controller_state.last_mint_timestamp = current_time;
        
        // Save updated controller state
        controller_state.serialize(&mut *controller_info.data.borrow_mut())?;

        msg!("Autonomous mint completed successfully, new supply: {}", 
             controller_state.current_supply);
        Ok(())
    }
    
    /// Helper function to execute mint with the mint authority signature
    fn execute_mint(
        mint_info: &AccountInfo,
        destination_info: &AccountInfo,
        authority_info: &AccountInfo,
        token_program_info: &AccountInfo,
        amount: u64,
        authority_bump: u8,
        program_id: &Pubkey,
        mint_key: &Pubkey,
    ) -> ProgramResult {
        msg!("Executing mint of {} tokens", amount);
        
        // Create mint-to instruction
        let mint_ix = spl_token_2022::instruction::mint_to(
            token_program_info.key,
            mint_info.key,
            destination_info.key,
            authority_info.key,
            &[],
            amount,
        )?;
        
        // Sign and invoke mint instruction with PDA authority
        invoke_signed(
            &mint_ix,
            &[
                mint_info.clone(),
                destination_info.clone(),
                authority_info.clone(),
                token_program_info.clone(),
            ],
            &[
                &[b"mint_authority", mint_key.as_ref(), &[authority_bump]],
            ],
        )?;
        
        msg!("Mint transaction successful");
        Ok(())
    }

    /// Process InitializeAutonomousController instruction
    fn process_initialize_autonomous_controller(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        initial_price: u64,
        max_supply: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let initializer_info = next_account_info(account_info_iter)?;
        let controller_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let oracle_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;

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

        // Verify token program
        if token_program_info.key != &TOKEN_2022_PROGRAM_ID {
            msg!("Invalid token program: expected Token-2022 program");
            return Err(ProgramError::IncorrectProgramId);
        }

        // Check if controller is already initialized
        if controller_info.data_len() > 0 {
            msg!("Controller account already exists");
            return Err(VCoinError::AlreadyInitialized.into());
        }

        // Create controller account
        let rent = Rent::from_account_info(rent_info)?;
        let controller_size = AutonomousSupplyController::get_size();
        let lamports = rent.minimum_balance(controller_size);

        // Create the controller account
        invoke(
            &solana_program::system_instruction::create_account(
                initializer_info.key,
                controller_info.key,
                lamports,
                controller_size as u64,
                program_id,
            ),
            &[
                initializer_info.clone(),
                controller_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        // Get mint info
        let mint_data = spl_token_2022::state::Mint::unpack(&mint_info.data.borrow())?;
        
        // Calculate the minimum supply (1B tokens with appropriate decimals)
        let min_supply = 1_000_000_000u64
            .checked_mul(10u64.pow(mint_data.decimals as u32))
            .ok_or(VCoinError::CalculationError)?;
            
        // Calculate the high supply threshold (5B tokens with appropriate decimals)
        let high_supply_threshold = 5_000_000_000u64
            .checked_mul(10u64.pow(mint_data.decimals as u32))
            .ok_or(VCoinError::CalculationError)?;

        // Generate mint authority PDA
        let (mint_authority, mint_authority_bump) = 
            Pubkey::find_program_address(&[b"mint_authority", mint_info.key.as_ref()], program_id);
            
        // Generate burn treasury PDA
        let (burn_treasury, burn_treasury_bump) = 
            Pubkey::find_program_address(&[b"burn_treasury", mint_info.key.as_ref()], program_id);

        // Get the current clock
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Initialize controller state with optimized parameters
        let controller_state = AutonomousSupplyController {
            is_initialized: true,
            mint: *mint_info.key,
            price_oracle: *oracle_info.key,
            initial_price: initial_price,
            year_start_price: initial_price,
            current_price: initial_price,
            last_price_update: current_time,
            year_start_timestamp: current_time,
            last_mint_timestamp: 0, // Never minted yet
            current_supply: mint_data.supply, // Initial supply from mint
            token_decimals: mint_data.decimals,
            min_supply: min_supply,
            high_supply_threshold: high_supply_threshold,
            mint_authority: mint_authority,
            mint_authority_bump: mint_authority_bump,
            burn_treasury: burn_treasury,
            burn_treasury_bump: burn_treasury_bump,
            // Conservative parameters
            min_growth_for_mint_bps: 500, // 5% minimum growth for minting
            min_decline_for_burn_bps: 500, // 5% minimum decline for burning
            medium_growth_mint_rate_bps: 500, // Mint 5% on medium growth
            high_growth_mint_rate_bps: 1000, // Mint 10% on high growth
            medium_decline_burn_rate_bps: 500, // Burn 5% on medium decline
            high_decline_burn_rate_bps: 1000, // Burn 10% on high decline
            high_growth_threshold_bps: 1000, // 10% is high growth
            high_decline_threshold_bps: 1000, // 10% is high decline
            extreme_growth_threshold_bps: 3000, // 30% is extreme growth
            extreme_decline_threshold_bps: 3000, // 30% is extreme decline
            post_cap_mint_rate_bps: 200, // 2% mint rate after reaching high supply
            post_cap_burn_rate_bps: 200, // 2% burn rate after reaching high supply
        };

        // Serialize the controller state
        controller_state.serialize(&mut *controller_info.data.borrow_mut())?;

        msg!("Autonomous Supply Controller initialized successfully");
        msg!("Initial price: {}, Current supply: {}", initial_price, mint_data.supply);
        msg!("Minimum supply (1B tokens): {}", min_supply);
        msg!("High supply threshold (5B tokens): {}", high_supply_threshold);
        Ok(())
    }
}