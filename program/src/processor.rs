use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::invoke,
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
    state::{PresaleState, TokenMetadata, VestingState, VestingBeneficiary},
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
                
                if let VCoinInstruction::InitializeToken { name, symbol, decimals, initial_supply } = instruction {
                    Self::process_initialize_token(
                        program_id, 
                        accounts,
                        name,
                        symbol,
                        decimals,
                        initial_supply,
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
        invoke(
            &initialize_transfer_fee_config(
                token_program_info.key,
                mint_info.key,
                Some(authority_info.key), // fee authority
                Some(authority_info.key), // withdraw authority
                500, // 5% transfer fee (500 basis points)
                initial_supply / 100, // maximum fee (1% of supply)
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
                Some(authority_info.key), // Freeze authority (optional)
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

        if params.hard_cap < params.soft_cap || params.hard_cap == 0 || params.token_price == 0 {
            return Err(VCoinError::InvalidPresaleParameters.into());
        }

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

        presale_state.num_buyers = presale_state.num_buyers.checked_add(1).ok_or(VCoinError::CalculationError)?;

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
        false // For simplicity, always return false
    }
} 