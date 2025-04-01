use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    program::invoke_signed,
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

use crate::{
    error::VCoinError,
    instruction::VCoinInstruction,
    state::{PresaleState, TokenMetadata, VestingState, VestingBeneficiary, AutonomousSupplyController},
};

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
                msg!("Instruction: Buy Tokens");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::BuyTokens { amount_usd } = instruction {
                    Self::process_buy_tokens(program_id, accounts, amount_usd)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            3 => {
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
            4 => {
                msg!("Instruction: Add Vesting Beneficiary");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::AddVestingBeneficiary { beneficiary, amount } = instruction {
                    Self::process_add_vesting_beneficiary(program_id, accounts, beneficiary, amount)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            5 => {
                msg!("Instruction: Release Vested Tokens");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ReleaseVestedTokens { beneficiary } = instruction {
                    Self::process_release_vested_tokens(program_id, accounts, beneficiary)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            6 => {
                msg!("Instruction: Update Token Metadata");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::UpdateTokenMetadata { name, symbol, uri } = instruction {
                    Self::process_update_token_metadata(program_id, accounts, name, symbol, uri)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            7 => {
                msg!("Instruction: Set Transfer Fee");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::SetTransferFee { transfer_fee_basis_points, maximum_fee } = instruction {
                    Self::process_set_transfer_fee(program_id, accounts, transfer_fee_basis_points, maximum_fee)
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            8 => {
                msg!("Instruction: End Presale");
                Self::process_end_presale(program_id, accounts)
            },
            9 => {
                msg!("Instruction: Initialize Autonomous Controller");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::InitializeAutonomousController { initial_price, max_supply } = instruction {
                    Self::process_initialize_autonomous_controller(
                        program_id,
                        accounts,
                        initial_price,
                        max_supply,
                    )
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            10 => {
                msg!("Instruction: Update Oracle Price");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::UpdateOraclePrice = instruction {
                    Self::process_update_oracle_price(
                        program_id,
                        accounts,
                    )
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            11 => {
                msg!("Instruction: Execute Autonomous Mint");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ExecuteAutonomousMint = instruction {
                    Self::process_execute_autonomous_mint(
                        program_id,
                        accounts,
                    )
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            12 => {
                msg!("Instruction: Execute Autonomous Burn");
                let instruction = VCoinInstruction::try_from_slice(instruction_data)
                    .map_err(|_| VCoinError::InvalidInstructionData)?;
                
                if let VCoinInstruction::ExecuteAutonomousBurn = instruction {
                    Self::process_execute_autonomous_burn(
                        program_id,
                        accounts,
                    )
                } else {
                    Err(VCoinError::InvalidInstruction.into())
                }
            },
            13 => {
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
            _ => {
                msg!("Instruction: Unknown");
                Err(VCoinError::InvalidInstruction.into())
            }
        }
    }

    /// Process InitializeToken instruction
    fn process_initialize_token(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        name: String,
        symbol: String,
        decimals: u8,
        initial_supply: u64,
        transfer_fee_basis_points: Option<u16>,
        maximum_fee_rate: Option<u8>,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;
        let metadata_info = next_account_info(account_info_iter)?;

        // Check if the token program is Token-2022
        if token_program_info.key != &TOKEN_2022_PROGRAM_ID {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Check if authority signed this transaction
        if !authority_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Get rent
        let rent = Rent::from_account_info(rent_info)?;

        // Create mint account
        msg!("Creating mint account...");
        invoke(
            &system_instruction::create_account(
                authority_info.key,
                mint_info.key,
                rent.minimum_balance(Mint::LEN),
                Mint::LEN as u64,
                token_program_info.key,
            ),
            &[
                authority_info.clone(),
                mint_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        // Initialize transfer fee config for Token-2022
        msg!("Initializing transfer fee config...");
        
        // Use provided values or defaults
        let fee_basis_points = transfer_fee_basis_points.unwrap_or(500); // Default 5%
        let max_fee_rate = maximum_fee_rate.unwrap_or(1); // Default 1% of supply
        let maximum_fee = initial_supply * (max_fee_rate as u64) / 100;
        
        invoke(
            &initialize_transfer_fee_config(
                token_program_info.key,
                mint_info.key,
                Some(authority_info.key), // fee authority
                Some(authority_info.key), // withdraw authority
                fee_basis_points, // configurable transfer fee basis points
                maximum_fee, // configurable maximum fee
            )?,
            &[
                mint_info.clone(),
                authority_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        // Initialize mint
        msg!("Initializing mint...");
        invoke(
            &initialize_mint(
                token_program_info.key,
                mint_info.key,
                authority_info.key,
                None, // No freeze authority to prevent locking user funds
                decimals,
            )?,
            &[
                mint_info.clone(),
                rent_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        // Create and initialize metadata account
        msg!("Creating metadata account...");
        invoke(
            &system_instruction::create_account(
                authority_info.key,
                metadata_info.key,
                rent.minimum_balance(TokenMetadata::get_size(name.len(), symbol.len(), "".len())),
                TokenMetadata::get_size(name.len(), symbol.len(), "".len()) as u64,
                program_id,
            ),
            &[
                authority_info.clone(),
                metadata_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        // Create metadata
        let token_metadata = TokenMetadata {
            is_initialized: true,
            authority: *authority_info.key,
            mint: *mint_info.key,
            name,
            symbol,
            uri: String::new(),
        };

        token_metadata.serialize(&mut *metadata_info.data.borrow_mut())?;

        // Create associated token account for authority if it doesn't exist
        let authority_token_account = get_associated_token_address_with_program_id(
            authority_info.key,
            mint_info.key,
            token_program_info.key,
        );

        // Check if account exists
        if !Self::account_exists(&authority_token_account) {
            msg!("Creating associated token account for authority...");
            invoke(
                &create_associated_token_account(
                    authority_info.key,
                    authority_info.key,
                    mint_info.key,
                    token_program_info.key,
                ),
                &[
                    authority_info.clone(),
                    mint_info.clone(),
                    token_program_info.clone(),
                    system_program_info.clone(),
                ],
            )?;
        }

        // Mint initial supply to authority
        if initial_supply > 0 {
            msg!("Minting initial supply to authority...");
            invoke(
                &mint_to(
                    token_program_info.key,
                    mint_info.key,
                    &authority_token_account,
                    authority_info.key,
                    &[],
                    initial_supply,
                )?,
                &[
                    mint_info.clone(),
                    token_program_info.clone(),
                    authority_info.clone(),
                ],
            )?;
        }

        msg!("Token initialized successfully!");
        Ok(())
    }

    /// Process InitializePresale instruction
    fn process_initialize_presale(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        params: InitializePresaleParams,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let presale_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let treasury_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;

        // Check if authority signed this transaction
        if !authority_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Validate presale parameters
        if params.end_time <= params.start_time {
            return Err(VCoinError::InvalidPresaleParameters.into());
        }

        if params.hard_cap < params.soft_cap || params.hard_cap == 0 || params.soft_cap == 0 || params.token_price == 0 {
            return Err(VCoinError::InvalidPresaleParameters.into());
        }

        // Set soft cap to 1 million USD (with 6 decimals: 1,000,000 * 10^6)
        let soft_cap = 1_000_000_000_000u64;
        let params = InitializePresaleParams {
            start_time: params.start_time,
            end_time: params.end_time,
            token_price: params.token_price,
            hard_cap: params.hard_cap,
            soft_cap,
            min_purchase: params.min_purchase,
            max_purchase: params.max_purchase,
        };

        // Get rent
        let rent = Rent::from_account_info(rent_info)?;

        // Create presale account
        msg!("Creating presale account...");
        invoke(
            &system_instruction::create_account(
                authority_info.key,
                presale_info.key,
                rent.minimum_balance(PresaleState::get_size()),
                PresaleState::get_size() as u64,
                program_id,
            ),
            &[
                authority_info.clone(),
                presale_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        // Initialize presale state
        let presale_state = PresaleState {
            is_initialized: true,
            authority: *authority_info.key,
            mint: *mint_info.key,
            treasury: *treasury_info.key,
            start_time: params.start_time,
            end_time: params.end_time,
            token_price: params.token_price,
            hard_cap: params.hard_cap,
            soft_cap: params.soft_cap,
            min_purchase: params.min_purchase,
            max_purchase: params.max_purchase,
            total_tokens_sold: 0,
            total_usd_raised: 0,
            num_buyers: 0,
            is_active: true,
            has_ended: false,
            buyer_pubkeys: Vec::new(),
        };

        presale_state.serialize(&mut *presale_info.data.borrow_mut())?;

        msg!("Presale initialized successfully!");
        Ok(())
    }

    /// Process BuyTokens instruction
    fn process_buy_tokens(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount_usd: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let buyer_info = next_account_info(account_info_iter)?;
        let presale_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let buyer_token_account_info = next_account_info(account_info_iter)?;
        let authority_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let treasury_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Check if buyer signed this transaction
        if !buyer_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Check if the token program is Token-2022
        if token_program_info.key != &TOKEN_2022_PROGRAM_ID {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Load presale state
        let mut presale_state = PresaleState::try_from_slice(&presale_info.data.borrow())?;

        // Verify presale account ownership
        if presale_info.owner != program_id {
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Check if presale is initialized
        if !presale_state.is_initialized {
            return Err(VCoinError::NotInitialized.into());
        }

        // Check if presale is active
        if !presale_state.is_active {
            return Err(VCoinError::PresaleNotActive.into());
        }

        // Check if presale has ended
        if presale_state.has_ended {
            return Err(VCoinError::PresaleEnded.into());
        }

        // Check if mint matches
        if presale_state.mint != *mint_info.key {
            return Err(VCoinError::InvalidMint.into());
        }

        // Check if treasury matches
        if presale_state.treasury != *treasury_info.key {
            return Err(VCoinError::InvalidTreasury.into());
        }

        // Get current time
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Check if presale has started
        if current_time < presale_state.start_time {
            return Err(VCoinError::PresaleNotStarted.into());
        }

        // Check if presale has ended by time
        if current_time > presale_state.end_time {
            return Err(VCoinError::PresaleEnded.into());
        }

        // Check minimum purchase
        if amount_usd < presale_state.min_purchase {
            return Err(VCoinError::BelowMinimumPurchase.into());
        }

        // Check maximum purchase
        if amount_usd > presale_state.max_purchase {
            return Err(VCoinError::ExceedsMaximumPurchase.into());
        }

        // Check hard cap
        if presale_state.total_usd_raised.checked_add(amount_usd).ok_or(VCoinError::CalculationError)? > presale_state.hard_cap {
            return Err(VCoinError::HardCapReached.into());
        }

        // Calculate tokens to mint (amount_usd / token_price * 10^decimals)
        let tokens_to_mint = amount_usd
            .checked_mul(10_u64.pow(9)) // Assuming 9 decimals
            .ok_or(VCoinError::CalculationError)?
            .checked_div(presale_state.token_price)
            .ok_or(VCoinError::CalculationError)?;

        // Transfer funds to treasury
        invoke(
            &system_instruction::transfer(buyer_info.key, treasury_info.key, amount_usd),
            &[
                buyer_info.clone(),
                treasury_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        // Mint tokens to buyer
        invoke(
            &mint_to(
                token_program_info.key,
                mint_info.key,
                buyer_token_account_info.key,
                authority_info.key,
                &[],
                tokens_to_mint,
            )?,
            &[
                mint_info.clone(),
                buyer_token_account_info.clone(),
                authority_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        // Update presale state
        presale_state.total_tokens_sold = presale_state
            .total_tokens_sold
            .checked_add(tokens_to_mint)
            .ok_or(VCoinError::CalculationError)?;

        presale_state.total_usd_raised = presale_state
            .total_usd_raised
            .checked_add(amount_usd)
            .ok_or(VCoinError::CalculationError)?;

        // Check if buyer has previously participated by looking through buyer_pubkeys
        let buyer_key = *buyer_info.key;
        let is_new_buyer = !presale_state.buyer_pubkeys.contains(&buyer_key);

        // Only increment buyer count for unique buyers
        if is_new_buyer {
            presale_state.num_buyers = presale_state.num_buyers
                .checked_add(1)
                .ok_or(VCoinError::CalculationError)?;
            
            // Add buyer to the list of buyers
            presale_state.buyer_pubkeys.push(buyer_key);
        }

        // Save updated presale state
        presale_state.serialize(&mut *presale_info.data.borrow_mut())?;

        msg!("Tokens bought successfully!");
        Ok(())
    }

    /// Process InitializeVesting instruction
    fn process_initialize_vesting(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        params: InitializeVestingParams,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let vesting_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;

        // Check if authority signed this transaction
        if !authority_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Validate vesting parameters
        if params.release_interval <= 0 {
            return Err(VCoinError::InvalidVestingParameters.into());
        }

        if params.num_releases == 0 {
            return Err(VCoinError::InvalidVestingParameters.into());
        }

        // Get rent
        let rent = Rent::from_account_info(rent_info)?;

        // Create vesting account
        msg!("Creating vesting account...");
        invoke(
            &system_instruction::create_account(
                authority_info.key,
                vesting_info.key,
                rent.minimum_balance(VestingState::get_size()),
                VestingState::get_size() as u64,
                program_id,
            ),
            &[
                authority_info.clone(),
                vesting_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        // Initialize vesting state
        let vesting_state = VestingState {
            is_initialized: true,
            authority: *authority_info.key,
            mint: *mint_info.key,
            total_tokens: params.total_tokens,
            total_allocated: 0,
            total_released: 0,
            start_time: params.start_time,
            release_interval: params.release_interval,
            num_releases: params.num_releases,
            last_release_time: 0,
            num_beneficiaries: 0,
            beneficiaries: Vec::new(),
        };

        vesting_state.serialize(&mut *vesting_info.data.borrow_mut())?;

        msg!("Vesting initialized successfully!");
        Ok(())
    }

    /// Process AddVestingBeneficiary instruction
    fn process_add_vesting_beneficiary(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        beneficiary: Pubkey,
        amount: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let vesting_info = next_account_info(account_info_iter)?;

        // Check if authority signed this transaction
        if !authority_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Load vesting state
        let mut vesting_state = VestingState::try_from_slice(&vesting_info.data.borrow())?;

        // Verify vesting account ownership
        if vesting_info.owner != program_id {
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Check if vesting is initialized
        if !vesting_state.is_initialized {
            return Err(VCoinError::NotInitialized.into());
        }

        // Check if authority matches
        if vesting_state.authority != *authority_info.key {
            return Err(VCoinError::Unauthorized.into());
        }

        // Check if there's enough unallocated tokens
        let new_total_allocated = vesting_state.total_allocated.checked_add(amount)
            .ok_or(VCoinError::CalculationError)?;

        if new_total_allocated > vesting_state.total_tokens {
            return Err(VCoinError::InsufficientTokens.into());
        }

        // Check for duplicate beneficiary
        if vesting_state.beneficiaries.iter().any(|b| b.beneficiary == beneficiary) {
            return Err(VCoinError::BeneficiaryAlreadyExists.into());
        }

        // Add beneficiary
        let vesting_beneficiary = VestingBeneficiary {
            beneficiary,
            total_amount: amount,
            released_amount: 0,
        };

        vesting_state.beneficiaries.push(vesting_beneficiary);
        vesting_state.num_beneficiaries = vesting_state.num_beneficiaries.checked_add(1)
            .ok_or(VCoinError::CalculationError)?;
        vesting_state.total_allocated = new_total_allocated;

        // Save updated vesting state
        vesting_state.serialize(&mut *vesting_info.data.borrow_mut())?;

        msg!("Beneficiary added successfully!");
        Ok(())
    }

    /// Process ReleaseVestedTokens instruction
    fn process_release_vested_tokens(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        beneficiary: Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let vesting_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let beneficiary_token_account_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Check if authority signed this transaction
        if !authority_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Check if the token program is Token-2022
        if token_program_info.key != &TOKEN_2022_PROGRAM_ID {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Load vesting state
        let mut vesting_state = VestingState::try_from_slice(&vesting_info.data.borrow())?;

        // Verify vesting account ownership
        if vesting_info.owner != program_id {
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Check if vesting is initialized
        if !vesting_state.is_initialized {
            return Err(VCoinError::NotInitialized.into());
        }

        // Check if mint matches
        if vesting_state.mint != *mint_info.key {
            return Err(VCoinError::InvalidMint.into());
        }

        // Get current time
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Check if vesting has started
        if current_time < vesting_state.start_time {
            return Err(VCoinError::VestingNotStarted.into());
        }

        // Find beneficiary
        let beneficiary_index = vesting_state.beneficiaries.iter().position(|b| b.beneficiary == beneficiary)
            .ok_or(VCoinError::BeneficiaryNotFound)?;

        // Calculate releasable amount
        let elapsed_time = current_time - vesting_state.start_time;
        let periods_passed = elapsed_time.checked_div(vesting_state.release_interval)
            .ok_or(VCoinError::CalculationError)?;
        let periods_passed = std::cmp::min(periods_passed as u8, vesting_state.num_releases);

        let beneficiary_data = &vesting_state.beneficiaries[beneficiary_index];
        let total_releasable = beneficiary_data.total_amount.checked_mul(periods_passed as u64)
            .ok_or(VCoinError::CalculationError)?
            .checked_div(vesting_state.num_releases as u64)
            .ok_or(VCoinError::CalculationError)?;

        let amount_to_release = total_releasable.checked_sub(beneficiary_data.released_amount)
            .ok_or(VCoinError::CalculationError)?;

        // Check if there are tokens to release
        if amount_to_release == 0 {
            return Err(VCoinError::NoTokensDue.into());
        }

        // Mint tokens to beneficiary
        invoke(
            &mint_to(
                token_program_info.key,
                mint_info.key,
                beneficiary_token_account_info.key,
                authority_info.key,
                &[],
                amount_to_release,
            )?,
            &[
                mint_info.clone(),
                beneficiary_token_account_info.clone(),
                authority_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        // Update vesting state
        vesting_state.beneficiaries[beneficiary_index].released_amount = 
            vesting_state.beneficiaries[beneficiary_index].released_amount
            .checked_add(amount_to_release)
            .ok_or(VCoinError::CalculationError)?;

        vesting_state.total_released = vesting_state.total_released
            .checked_add(amount_to_release)
            .ok_or(VCoinError::CalculationError)?;

        vesting_state.last_release_time = current_time;

        // Save updated vesting state
        vesting_state.serialize(&mut *vesting_info.data.borrow_mut())?;

        msg!("Tokens released successfully!");
        Ok(())
    }

    /// Process UpdateTokenMetadata instruction
    fn process_update_token_metadata(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        name: Option<String>,
        symbol: Option<String>,
        uri: Option<String>,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let metadata_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;

        // Check if authority signed this transaction
        if !authority_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Check if the token program is Token-2022
        if token_program_info.key != &TOKEN_2022_PROGRAM_ID {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Load metadata
        let mut token_metadata = TokenMetadata::try_from_slice(&metadata_info.data.borrow())?;

        // Verify metadata account ownership
        if metadata_info.owner != program_id {
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Check if metadata is initialized
        if !token_metadata.is_initialized {
            return Err(VCoinError::NotInitialized.into());
        }

        // Check if authority matches
        if token_metadata.authority != *authority_info.key {
            return Err(VCoinError::Unauthorized.into());
        }

        // Check if mint matches
        if token_metadata.mint != *mint_info.key {
            return Err(VCoinError::InvalidMint.into());
        }

        // Update metadata
        if let Some(name) = name {
            token_metadata.name = name;
        }

        if let Some(symbol) = symbol {
            token_metadata.symbol = symbol;
        }

        if let Some(uri) = uri {
            token_metadata.uri = uri;
        }

        // Save updated metadata
        token_metadata.serialize(&mut *metadata_info.data.borrow_mut())?;

        msg!("Token metadata updated successfully!");
        Ok(())
    }

    /// Process SetTransferFee instruction
    fn process_set_transfer_fee(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;

        // Check if authority signed this transaction
        if !authority_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Check if the token program is Token-2022
        if token_program_info.key != &TOKEN_2022_PROGRAM_ID {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Ensure transfer fee is capped at 10% (1000 basis points)
        if transfer_fee_basis_points > 1000 {
            return Err(VCoinError::ExceedsMaximumFee.into());
        }

        // Set the transfer fee
        invoke(
            &set_transfer_fee(
                token_program_info.key,
                mint_info.key,
                authority_info.key,
                &[], // Empty signer array
                transfer_fee_basis_points,
                maximum_fee,
            )?,
            &[
                mint_info.clone(),
                authority_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        msg!("Transfer fee set successfully!");
        Ok(())
    }

    /// Process EndPresale instruction
    fn process_end_presale(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let presale_info = next_account_info(account_info_iter)?;

        // Check if authority signed this transaction
        if !authority_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Load presale state
        let mut presale_state = PresaleState::try_from_slice(&presale_info.data.borrow())?;

        // Verify presale account ownership
        if presale_info.owner != program_id {
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Check if presale is initialized
        if !presale_state.is_initialized {
            return Err(VCoinError::NotInitialized.into());
        }

        // Check if authority matches
        if presale_state.authority != *authority_info.key {
            return Err(VCoinError::Unauthorized.into());
        }

        // Check if presale is already ended
        if presale_state.has_ended {
            return Err(VCoinError::PresaleAlreadyEnded.into());
        }

        // End presale
        presale_state.is_active = false;
        presale_state.has_ended = true;

        // Save updated presale state
        presale_state.serialize(&mut *presale_info.data.borrow_mut())?;

        msg!("Presale ended successfully!");
        Ok(())
    }

    /// Check if an account exists
    fn account_exists(_pubkey: &Pubkey) -> bool {
        // In a real implementation, we would check if the account exists
        // However, this requires passing in the AccountInfo or Connection
        // Since this is just a check for creating associated token accounts,
        // we'll simply return false to ensure the account is created
        false
    }

    /// Derive the mint authority PDA
    fn derive_mint_authority_pda(program_id: &Pubkey, mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"autonomous_mint_authority", mint.as_ref()],
            program_id,
        )
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

        // Check if initializer signed this transaction
        if !initializer_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Prevent re-initialization if controller is already initialized
        if controller_info.try_data_len()? > 0 {
            let existing_controller = AutonomousSupplyController::try_from_slice(&controller_info.data.borrow())?;
            if existing_controller.is_initialized {
                return Err(VCoinError::AlreadyInitialized.into());
            }
        }

        // Check if the token program is Token-2022
        if token_program_info.key != &TOKEN_2022_PROGRAM_ID {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Get rent
        let rent = Rent::from_account_info(rent_info)?;

        // Create controller account
        msg!("Creating autonomous controller account...");
        invoke(
            &system_instruction::create_account(
                initializer_info.key,
                controller_info.key,
                rent.minimum_balance(AutonomousSupplyController::get_size()),
                AutonomousSupplyController::get_size() as u64,
                program_id,
            ),
            &[
                initializer_info.clone(),
                controller_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        // Get current time
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Generate mint authority PDA
        let (mint_authority, mint_authority_bump) = Self::derive_mint_authority_pda(program_id, mint_info.key);

        // Check current supply
        let mint_data = mint_info.try_borrow_data()?;
        let mint = Mint::unpack(&mint_data)?;
        let current_supply = mint.supply;
        drop(mint_data);

        // The provided max_supply should be the initial max supply (1B)
        let initial_max_supply = max_supply;
        
        // Absolute maximum supply is fixed at 5B (with 9 decimals)
        let absolute_max_supply = 5_000_000_000_000_000_000u64; // 5B with 9 decimals

        // Validate the initial max supply is not greater than absolute max
        if initial_max_supply > absolute_max_supply {
            return Err(VCoinError::InvalidSupplyParameters.into());
        }

        // Initialize controller state
        let controller_state = AutonomousSupplyController {
            is_initialized: true,
            mint: *mint_info.key,
            price_oracle: *oracle_info.key,
            initial_price,
            year_start_price: initial_price,
            current_price: initial_price,
            last_price_update: current_time,
            year_start_timestamp: current_time,
            last_mint_timestamp: 0, // Never minted yet
            current_supply,
            initial_max_supply,
            absolute_max_supply,
            mint_authority,
            mint_authority_bump,
        };

        // Save controller state
        controller_state.serialize(&mut *controller_info.data.borrow_mut())?;

        // Transfer mint authority to the PDA - THIS IS PERMANENT AND IRREVERSIBLE
        msg!("WARNING: Transferring mint authority permanently to the autonomous controller");
        invoke(
            &spl_token_2022::instruction::set_authority(
                token_program_info.key,
                mint_info.key,
                Some(&mint_authority),
                spl_token_2022::instruction::AuthorityType::MintTokens,
                initializer_info.key,
                &[],
            )?,
            &[
                mint_info.clone(),
                initializer_info.clone(),
                token_program_info.clone(),
            ],
        )?;
        
        msg!("IMPORTANT: Mint authority has been permanently transferred to the algorithm!");
        msg!("No human, including the initializer, can mint or burn tokens manually!");
        msg!("Autonomous controller initialized successfully!");
        Ok(())
    }

    /// Process UpdateOraclePrice instruction
    fn process_update_oracle_price(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let controller_info = next_account_info(account_info_iter)?;
        let oracle_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Verify controller account ownership
        if controller_info.owner != program_id {
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Load controller state
        let mut controller_state = AutonomousSupplyController::try_from_slice(&controller_info.data.borrow())?;

        // Verify oracle address matches the one set during initialization (cannot be changed)
        if controller_state.price_oracle != *oracle_info.key {
            return Err(VCoinError::InvalidOracleAccount.into());
        }

        // Get current time
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Get price from oracle (simplified - in a real implementation, you'd parse actual oracle data)
        // For now, we'll just use a sample value for demonstration
        let oracle_data = oracle_info.try_borrow_data()?;
        let new_price = u64::from_le_bytes([
            oracle_data[0], oracle_data[1], oracle_data[2], oracle_data[3],
            oracle_data[4], oracle_data[5], oracle_data[6], oracle_data[7],
        ]);

        // Anti-manipulation check: Prevent extreme price swings in short time periods
        // Only allow max 20% change per day to prevent oracle manipulation
        if controller_state.last_price_update > 0 && 
           (current_time - controller_state.last_price_update) < 86400 { // Less than a day
            
            // Calculate percentage change
            let price_change_abs = if new_price > controller_state.current_price {
                new_price - controller_state.current_price
            } else {
                controller_state.current_price - new_price
            };

            // Calculate percentage (20% = 2000 basis points)
            let change_percentage = price_change_abs
                .checked_mul(10000)
                .ok_or(VCoinError::CalculationError)?
                .checked_div(controller_state.current_price)
                .ok_or(VCoinError::CalculationError)?;

            // If change exceeds 20% in a day, reject it as potential manipulation
            if change_percentage > 2000 { // 20% limit
                msg!("WARNING: Price change exceeds daily limit (20%), rejecting update as potential manipulation");
                return Err(VCoinError::PriceManipulationDetected.into());
            }
        }

        // Update controller with new price
        msg!("Updating price from {} to {}", controller_state.current_price, new_price);
        controller_state.update_price(new_price, current_time);

        // Check if it's time for annual evaluation
        if controller_state.is_annual_evaluation_time(current_time) {
            // If a full year has passed, start a new year period
            controller_state.start_new_year_period(current_time);
            msg!("Annual evaluation period completed, starting new year with reference price: {}", new_price);
        }

        // Save updated controller state
        controller_state.serialize(&mut *controller_info.data.borrow_mut())?;

        msg!("Oracle price updated successfully!");
        Ok(())
    }

    /// Process ExecuteAutonomousMint instruction
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

        // Verify controller account ownership belongs to the program (not manipulable)
        if controller_info.owner != program_id {
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Verify the controller is initialized
        let mut controller_state = AutonomousSupplyController::try_from_slice(&controller_info.data.borrow())?;
        if !controller_state.is_initialized {
            return Err(VCoinError::NotInitialized.into());
        }

        // Verify mint matches the one set during initialization (cannot be changed)
        if controller_state.mint != *mint_info.key {
            return Err(VCoinError::InvalidMint.into());
        }

        // Verify mint authority PDA is the correct one derived by the program
        let (expected_mint_authority, bump) = Self::derive_mint_authority_pda(program_id, mint_info.key);
        if expected_mint_authority != *mint_authority_info.key || bump != controller_state.mint_authority_bump {
            return Err(VCoinError::InvalidMintAuthority.into());
        }

        // Get current time from the Solana clock (cannot be manipulated)
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Verify a full year has passed since last mint/burn (enforced time lock)
        if !controller_state.can_mint_based_on_time(current_time) {
            msg!("Cannot mint: annual time lock is still active");
            return Err(VCoinError::TooEarlyForMinting.into());
        }

        // Ensure price data is fresh (within 7 days)
        if current_time - controller_state.last_price_update > 604800 { // 7 days in seconds
            msg!("Cannot mint: price data is stale, please update from oracle first");
            return Err(VCoinError::StaleOracleData.into());
        }

        // Calculate mint amount based on price growth using the algorithm rules
        // This calculation is deterministic and based solely on verifiable on-chain data
        let mint_amount = controller_state.calculate_mint_amount()
            .ok_or(VCoinError::CalculationError)?;

        // If no minting is needed based on algorithm rules, return early
        if mint_amount == 0 {
            msg!("Minting criteria not met: either insufficient price growth or maximum supply reached");
            return Ok(());
        }

        // Log detailed metrics for transparency and verification
        let growth_bps = controller_state.calculate_price_growth_bps()
            .ok_or(VCoinError::CalculationError)?;
        
        msg!("MINT VERIFICATION: Price growth: {}%, Current supply: {}, Minting: {} tokens ({}% of supply)", 
            growth_bps as f64 / 100.0,
            controller_state.current_supply,
            mint_amount,
            (mint_amount * 10000 / controller_state.current_supply) as f64 / 100.0
        );

        // Create PDA signer seeds - only the program can sign through this PDA
        let signer_seeds = &[
            b"autonomous_mint_authority",
            mint_info.key.as_ref(),
            &[controller_state.mint_authority_bump],
        ];

        // Execute mint instruction with PDA signature
        msg!("Executing autonomous mint of {} tokens", mint_amount);
        invoke_signed(
            &spl_token_2022::instruction::mint_to(
                token_program_info.key,
                mint_info.key,
                destination_info.key,
                mint_authority_info.key,
                &[],
                mint_amount,
            )?,
            &[
                mint_info.clone(),
                destination_info.clone(),
                mint_authority_info.clone(),
                token_program_info.clone(),
            ],
            &[signer_seeds],
        )?;

        // Update controller state with new supply
        controller_state.current_supply = controller_state.current_supply
            .checked_add(mint_amount)
            .ok_or(VCoinError::CalculationError)?;

        // Update timestamp for time-lock enforcement
        controller_state.last_mint_timestamp = current_time;

        // Start a new year period after minting (reset evaluation window)
        controller_state.start_new_year_period(current_time);

        // Save updated controller state
        controller_state.serialize(&mut *controller_info.data.borrow_mut())?;

        msg!("Autonomous minting completed successfully - HUMAN INTERVENTION WAS NOT INVOLVED");
        Ok(())
    }

    /// Process ExecuteAutonomousBurn instruction
    fn process_execute_autonomous_burn(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let controller_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let mint_authority_info = next_account_info(account_info_iter)?;
        let burn_source_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        let clock_info = next_account_info(account_info_iter)?;

        // Verify controller account ownership belongs to the program (not manipulable)
        if controller_info.owner != program_id {
            return Err(VCoinError::InvalidAccountOwner.into());
        }

        // Verify the controller is initialized
        let mut controller_state = AutonomousSupplyController::try_from_slice(&controller_info.data.borrow())?;
        if !controller_state.is_initialized {
            return Err(VCoinError::NotInitialized.into());
        }

        // Verify mint matches the one set during initialization (cannot be changed)
        if controller_state.mint != *mint_info.key {
            return Err(VCoinError::InvalidMint.into());
        }

        // Verify mint authority PDA is the correct one derived by the program
        let (expected_mint_authority, bump) = Self::derive_mint_authority_pda(program_id, mint_info.key);
        if expected_mint_authority != *mint_authority_info.key || bump != controller_state.mint_authority_bump {
            return Err(VCoinError::InvalidMintAuthority.into());
        }

        // Get current time from the Solana clock (cannot be manipulated)
        let clock = Clock::from_account_info(clock_info)?;
        let current_time = clock.unix_timestamp;

        // Verify a full year has passed since last mint/burn (enforced time lock)
        if !controller_state.can_mint_based_on_time(current_time) {
            msg!("Cannot burn: annual time lock is still active");
            return Err(VCoinError::TooEarlyForBurning.into());
        }

        // Ensure price data is fresh (within 7 days)
        if current_time - controller_state.last_price_update > 604800 { // 7 days in seconds
            msg!("Cannot burn: price data is stale, please update from oracle first");
            return Err(VCoinError::StaleOracleData.into());
        }

        // Calculate burn amount based on price decline using the algorithm rules
        // This calculation is deterministic and based solely on verifiable on-chain data
        let burn_amount = controller_state.calculate_burn_amount()
            .ok_or(VCoinError::CalculationError)?;

        // If no burning is needed based on algorithm rules, return early
        if burn_amount == 0 {
            msg!("Burning criteria not met: either insufficient price decline or supply near minimum threshold");
            return Ok(());
        }

        // Log detailed metrics for transparency and verification
        let growth_bps = controller_state.calculate_price_growth_bps()
            .ok_or(VCoinError::CalculationError)?;
        
        // Since we're burning, growth is negative
        let decline_bps = (-growth_bps) as u64;
        
        msg!("BURN VERIFICATION: Price decline: {}%, Current supply: {}, Burning: {} tokens ({}% of supply)", 
            decline_bps as f64 / 100.0,
            controller_state.current_supply,
            burn_amount,
            (burn_amount * 10000 / controller_state.current_supply) as f64 / 100.0
        );

        // Create PDA signer seeds - only the program can sign through this PDA
        let signer_seeds = &[
            b"autonomous_mint_authority",
            mint_info.key.as_ref(),
            &[controller_state.mint_authority_bump],
        ];

        // Execute burn instruction with PDA signature
        msg!("Executing autonomous burn of {} tokens", burn_amount);
        invoke_signed(
            &spl_token_2022::instruction::burn(
                token_program_info.key,
                burn_source_info.key,
                mint_info.key,
                mint_authority_info.key,
                &[],
                burn_amount,
            )?,
            &[
                burn_source_info.clone(),
                mint_info.clone(),
                mint_authority_info.clone(),
                token_program_info.clone(),
            ],
            &[signer_seeds],
        )?;

        // Update controller state with new supply
        controller_state.current_supply = controller_state.current_supply
            .checked_sub(burn_amount)
            .ok_or(VCoinError::CalculationError)?;

        // Update timestamp for time-lock enforcement
        controller_state.last_mint_timestamp = current_time;

        // Start a new year period after burning (reset evaluation window)
        controller_state.start_new_year_period(current_time);

        // Save updated controller state
        controller_state.serialize(&mut *controller_info.data.borrow_mut())?;

        msg!("Autonomous burning completed successfully - HUMAN INTERVENTION WAS NOT INVOLVED");
        Ok(())
    }

    /// Process PermanentlyDisableUpgrades instruction
    fn process_permanently_disable_upgrades(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let current_authority_info = next_account_info(account_info_iter)?;
        let program_account_info = next_account_info(account_info_iter)?;
        let program_data_account_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let bpf_loader_program_info = next_account_info(account_info_iter)?;

        // Check if current authority signed this transaction
        if !current_authority_info.is_signer {
            return Err(VCoinError::Unauthorized.into());
        }

        // Verify program account is this program
        if program_account_info.key != program_id {
            return Err(VCoinError::InvalidProgramAccount.into());
        }

        // Verify BPF Loader program
        if *bpf_loader_program_info.key != solana_program::bpf_loader_upgradeable::id() {
            return Err(VCoinError::InvalidBPFLoaderProgram.into());
        }

        // Create a burn address (all zeros) for the new upgrade authority
        let burn_address = Pubkey::new_from_array([0u8; 32]);

        // Create the instruction to set the authority to the burn address
        // This permanently revokes the upgrade capability since the burn address is not a valid keypair
        let set_authority_instruction = solana_program::bpf_loader_upgradeable::set_upgrade_authority(
            program_account_info.key,
            current_authority_info.key,
            Some(&burn_address),
        );

        // Call the BPF Loader program to execute the set_authority instruction
        // We can't use invoke() directly from within our program to call another program's instruction
        // Instead, we'll provide detailed instructions for how to call this externally

        msg!("‼️ IMPORTANT: PROGRAM UPGRADES WILL BE PERMANENTLY DISABLED ‼️");
        msg!("This transaction must be executed using the Solana CLI:");
        msg!("solana program set-upgrade-authority {} --new-upgrade-authority {} --upgrade-authority {}", 
             program_account_info.key.to_string(),
             burn_address.to_string(),
             current_authority_info.key.to_string());
        
        msg!("After executing this command, the program will be permanently locked and can never be upgraded.");
        msg!("Please verify you have the latest audited version before proceeding.");
        
        // Return success, though the actual change must be made through CLI
        Ok(())
    }
} 