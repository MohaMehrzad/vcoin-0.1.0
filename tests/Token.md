# VCoin: A Comprehensive Guide to the Solana Token Program

## Table of Contents

1. [Introduction](#introduction)
   - [Program Overview](#program-overview)
   - [Core Features](#core-features)
   - [Architecture](#architecture)

2. [Token Fundamentals](#token-fundamentals)
   - [SPL Token 2022 Integration](#spl-token-2022-integration)
   - [Token Mint Structure](#token-mint-structure)
   - [Transfer Fee Implementation](#transfer-fee-implementation)

3. [Presale Mechanism](#presale-mechanism)
   - [Presale State Management](#presale-state-management)
   - [Contribution Tracking](#contribution-tracking)
   - [Stablecoin Integration](#stablecoin-integration)

4. [Treasury Management](#treasury-management)
   - [Locked Treasury Implementation](#locked-treasury-implementation)
   - [Development Fund Treasury](#development-fund-treasury)
   - [Burn Treasury](#burn-treasury)

5. [Vesting System](#vesting-system)
   - [Vesting Schedule Implementation](#vesting-schedule-implementation)
   - [Beneficiary Management](#beneficiary-management)
   - [Token Release Mechanism](#token-release-mechanism)

6. [Autonomous Supply Control](#autonomous-supply-control)
   - [Price Oracle Integration](#price-oracle-integration)
   - [Minting Algorithm](#minting-algorithm)
   - [Burning Mechanism](#burning-mechanism)

7. [Upgrade Mechanism](#upgrade-mechanism)
   - [Timelock Implementation](#timelock-implementation)
   - [Upgrade Proposal & Execution](#upgrade-proposal--execution)
   - [Permanent Upgrade Lock](#permanent-upgrade-lock)

8. [Security Features](#security-features)
   - [Authority Validation](#authority-validation)
   - [PDA Derivation](#pda-derivation)
   - [Arithmetic Safety](#arithmetic-safety)

9. [Error Handling](#error-handling)
   - [Custom Error Types](#custom-error-types)
   - [Error Propagation](#error-propagation)
   - [User Feedback](#user-feedback)

10. [Appendix](#appendix)
    - [Data Structures](#data-structures)
    - [Instruction Format](#instruction-format)
    - [Account Requirements](#account-requirements)

---

## 1. Introduction

### Program Overview

VCoin is a comprehensive Solana token program implementing advanced tokenomics features using the SPL Token 2022 standard. It combines traditional token functionalities with innovative autonomous supply management, vesting schedules, and secure upgradeability.

The program is designed for projects seeking to launch tokens with:
- Initial presale funding
- Controlled token distribution
- Algorithmic supply management
- Transparent vesting schedules
- Secure upgrade paths

### Core Features

1. **Token Management**: Creation and management of SPL Token 2022 tokens with transfer fees
2. **Presale Engine**: Complete presale mechanics with stablecoin contributions
3. **Treasury System**: Multi-treasury design for development, locking, and burning
4. **Vesting Mechanism**: Time-based token release for team, investors, and partners
5. **Autonomous Supply**: Algorithm-driven supply adjustments based on price performance
6. **Upgrade Security**: Timelock-protected upgrade mechanism with permanent lock option

### Architecture

VCoin follows a modular architecture centered around the `Processor` struct, which handles all instruction processing through a dispatch model. Key components include:

```
program/
├── src/
│   ├── lib.rs             # Program entry point and module definitions
│   ├── entrypoint.rs      # Solana program entrypoint
│   ├── instruction.rs     # Instruction definitions and deserialization
│   ├── processor.rs       # Core instruction processing logic
│   ├── state.rs           # State structures and serialization
│   ├── error.rs           # Custom error types
│   └── account.rs         # Account validation utilities
```

The entry flow begins at `entrypoint.rs`, routes through `lib.rs` to `processor.rs`, which then dispatches to specific processing functions based on the instruction data deserialized in `instruction.rs`.

---

## 2. Token Fundamentals

### SPL Token 2022 Integration

VCoin uses the SPL Token 2022 standard (`spl_token_2022`), an advanced token standard on Solana that extends the original SPL Token with additional features like transfer fees, metadata extensions, and confidential transfers.

Key integration points include:

```rust
// Import the Token 2022 program ID
use spl_token_2022::ID as TOKEN_2022_PROGRAM_ID;

// Later in the code when verifying the token program
if token_program_info.key != &TOKEN_2022_PROGRAM_ID {
    msg!("Invalid token program: expected Token-2022 program");
    return Err(ProgramError::IncorrectProgramId);
}
```

Unlike the original SPL Token standard, Token 2022 allows for extensions that can be enabled selectively on a token mint. VCoin primarily uses the transfer fee extension.

### Token Mint Structure

Token initialization in VCoin creates a mint with configurable decimals and initial supply:

```rust
fn process_initialize_token(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: InitializeTokenParams,
) -> ProgramResult {
    // Account validation...

    // Create mint account
    invoke(
        &system_instruction::create_account(
            payer_info.key,
            mint_info.key,
            mint_lamports,
            mint_size as u64,
            token_program_info.key,
        ),
        // Account infos...
    )?;

    // Initialize mint with decimals
    let init_mint_ix = spl_token_2022::instruction::initialize_mint(
        token_program_info.key,
        mint_info.key,
        mint_authority_info.key,
        freeze_authority,
        params.decimals,
    )?;

    // Execute the initialization
    invoke(
        &init_mint_ix,
        // Account infos...
    )?;
}
```

The mint authority is a PDA (Program Derived Address) controlled by the VCoin program. This enables secure, programmatic control of supply without relying on externally owned key pairs.

### Transfer Fee Implementation

VCoin implements transfer fees through the Token 2022 transfer fee extension:

```rust
fn process_set_transfer_fee(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    transfer_fee_basis_points: u16,
    maximum_fee: u64,
) -> ProgramResult {
    // Validation...

    // Ensure fee doesn't exceed 10%
    if transfer_fee_basis_points > 1000 { // 10% = 1000 basis points
        return Err(VCoinError::ExceedsMaximumFee.into());
    }

    // Set the fee on the mint
    let set_fee_ix = set_transfer_fee(
        token_program_info.key,
        mint_info.key,
        authority_info.key,
        &[],
        transfer_fee_basis_points,
        maximum_fee,
    )?;

    // Execute the instruction
    invoke(
        &set_fee_ix,
        // Account infos...
    )?;
}
```

Transfer fees are specified in basis points (1/100th of a percent) with a maximum absolute fee. This enables projects to capture value from secondary market transactions.

---

## 3. Presale Mechanism

### Presale State Management

The presale functionality is centered around the `PresaleState` struct in `state.rs`:

```rust
pub struct PresaleState {
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
    pub hard_cap: u64,
    pub soft_cap: u64,
    pub min_purchase: u64,
    pub max_purchase: u64,
    pub token_price: u64,
    pub token_mint: Pubkey,
    pub locked_treasury: Pubkey,
    pub dev_treasury: Pubkey,
    pub total_raised: u64,
    pub is_active: bool,
    pub has_ended: bool,
    pub soft_cap_reached: bool,
    pub hard_cap_reached: bool,
    pub dev_funds_refundable: bool,
    pub refund_deadline: i64,
    pub dev_refund_available_timestamp: i64,
    pub dev_refund_period_end_timestamp: i64,
    pub num_buyers: u32,
    pub buyer_pubkeys: Vec<Pubkey>,
    pub contributions: Vec<PresaleContribution>,
    pub allowed_stablecoins: Vec<Pubkey>,
}
```

This structure tracks all presale parameters, including:
- Temporal boundaries (start/end times)
- Financial constraints (caps, pricing)
- Treasury accounts
- Participant tracking
- Refund policies

The presale lifecycle begins with initialization (`process_initialize_presale`), continues through contribution collection (`process_buy_tokens_with_stablecoin`), and concludes with finalization (`process_end_presale`).

### Contribution Tracking

Contributions are tracked using the `PresaleContribution` struct:

```rust
pub struct PresaleContribution {
    pub buyer: Pubkey,
    pub amount: u64,
    pub stablecoin_type: StablecoinType,
    pub stablecoin_mint: Pubkey,
    pub refunded: bool,
    pub claimed_refund: bool,
    pub claimed_dev_refund: bool,
    pub timestamp: i64,
}
```

The presale maintains vectors of both buyer addresses and their contributions, with methods to find and update contributions:

```rust
// Finding a contribution
pub fn find_contribution(&self, buyer: &Pubkey) -> Option<(usize, &PresaleContribution)> {
    self.contributions.iter().enumerate().find(|(_, contribution)| &contribution.buyer == buyer)
}

// Finding by stablecoin type
pub fn find_contribution_by_stablecoin(&self, buyer: &Pubkey, stablecoin_mint: &Pubkey) -> Option<(usize, &PresaleContribution)> {
    self.contributions.iter().enumerate().find(|(_, contribution)| 
        &contribution.buyer == buyer && &contribution.stablecoin_mint == stablecoin_mint
    )
}
```

When buyers contribute, their address is added to `buyer_pubkeys` and a new `PresaleContribution` is added to `contributions`.

### Stablecoin Integration

The presale supports multiple stablecoins for contributions:

```rust
// Add allowed stablecoin
pub fn add_allowed_stablecoin(&mut self, stablecoin_mint: Pubkey) -> Result<(), ProgramError> {
    if self.allowed_stablecoins.contains(&stablecoin_mint) {
        return Err(ProgramError::InvalidArgument);
    }
    
    if self.allowed_stablecoins.len() >= 10 {
        return Err(ProgramError::InvalidArgument);
    }
    
    self.allowed_stablecoins.push(stablecoin_mint);
    Ok(())
}

// Check if stablecoin is allowed
pub fn is_stablecoin_allowed(&self, stablecoin_mint: &Pubkey) -> bool {
    self.allowed_stablecoins.contains(stablecoin_mint)
}
```

The program recognizes specific stablecoin types:

```rust
// Known USDC addresses on Solana
const USDC_MAINNET: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DEVNET: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// Known USDT addresses on Solana
const USDT_MAINNET: &str = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const USDT_DEVNET: &str = "DAwBSXe6w9g37wdE2tCrFbho3QHKZi4PjuBytQCULap2";
```

This enables projects to accept contributions in various stablecoins while maintaining proper accounting.

---

## 4. Treasury Management

### Locked Treasury Implementation

The locked treasury holds a portion (typically 50%) of presale contributions that can be refunded if the project doesn't meet expectations:

```rust
fn process_claim_refund(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Find the buyer's contribution
    let (contribution_index, contribution) = match presale_state.find_contribution_by_stablecoin(buyer_info.key, stablecoin_mint_info.key) {
        Some(result) => result,
        None => {
            msg!("No contribution found for this buyer with this stablecoin");
            return Err(VCoinError::NoContribution.into());
        }
    };
    
    if contribution.claimed_refund {
        msg!("Refund already claimed");
        return Err(VCoinError::RefundAlreadyClaimed.into());
    }

    // Calculate refund amount (50% in locked treasury)
    let refund_amount = contribution.amount
        .checked_div(2)
        .ok_or(VCoinError::CalculationError)?;
    
    // Process refund using PDA authority
    // ...

    // Mark as refunded
    let mut mutable_presale_state = presale_state;
    mutable_presale_state.contributions[contribution_index].claimed_refund = true;
    mutable_presale_state.serialize(&mut *presale_info.data.borrow_mut())?;
}
```

After the refund period expires, remaining funds can be withdrawn:

```rust
fn process_withdraw_locked_funds(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Verify refund period has ended
    if current_time < presale_state.refund_deadline {
        let time_left = presale_state.refund_deadline - current_time;
        msg!("Refund period is still active. {} seconds left", time_left);
        return Err(VCoinError::RefundPeriodActive.into());
    }

    // Transfer remaining funds to destination
    // ...
}
```

### Development Fund Treasury

The development fund treasury holds the other portion (typically 50%) of presale contributions for project development:

```rust
fn process_claim_dev_fund_refund(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Check if dev funds are refundable
    if !presale_state.dev_funds_refundable {
        msg!("Dev funds are not refundable (soft cap was reached)");
        return Err(VCoinError::DevFundsNotRefundable.into());
    }

    // Process refund logic...
}
```

Development funds are only refundable if the soft cap wasn't reached, providing protection for contributors while allowing projects to move forward if minimum viability thresholds are met.

### Burn Treasury

The burn treasury is a special treasury for token burning operations in the autonomous supply controller:

```rust
fn process_initialize_burn_treasury(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Derive burn treasury authority PDA
    let (expected_burn_treasury_authority, authority_bump) = 
        Pubkey::find_program_address(&[b"burn_treasury", mint_info.key.as_ref()], program_id);
        
    if expected_burn_treasury_authority != *burn_treasury_authority_info.key {
        msg!("Invalid burn treasury authority PDA");
        return Err(VCoinError::InvalidBurnTreasury.into());
    }

    // Create token account logic...
}
```

Users can deposit tokens to the burn treasury:

```rust
fn process_deposit_to_burn_treasury(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
) -> ProgramResult {
    // Account validation...

    // Transfer tokens to burn treasury
    let transfer_ix = spl_token_2022::instruction::transfer_checked(
        token_program_info.key,
        depositor_token_account_info.key,
        mint_info.key,
        burn_treasury_account_info.key,
        depositor_info.key,
        &[],
        amount,
        mint_data.decimals,
    )?;

    // Execute transfer...
}
```

The autonomous controller can then burn these tokens during price decline scenarios to support token value.

---

## 5. Vesting System

### Vesting Schedule Implementation

The vesting system is structured around the `VestingState` struct:

```rust
pub struct VestingState {
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub total_tokens: u64,
    pub total_allocated: u64,
    pub total_released: u64,
    pub start_time: i64,
    pub release_interval: i64,
    pub num_releases: u8,
    pub last_release_time: i64,
    pub num_beneficiaries: u8,
    pub beneficiaries: Vec<VestingBeneficiary>,
}
```

Initialization sets up the vesting schedule parameters:

```rust
fn process_initialize_vesting(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    params: InitializeVestingParams,
) -> ProgramResult {
    // Account validation...

    // Initialize vesting state
    let vesting_state = VestingState {
        is_initialized: true,
        authority: *authority_info.key,
        mint: *mint_info.key,
        total_tokens: 0, // Will be incremented as beneficiaries are added
        total_allocated: 0,
        total_released: 0,
        start_time: params.start_time,
        release_interval: params.release_interval,
        num_releases: params.num_releases,
        last_release_time: 0,
        num_beneficiaries: 0,
        beneficiaries: Vec::new(),
    };

    // Serialize to account
    vesting_state.serialize(&mut *vesting_info.data.borrow_mut())?;
}
```

### Beneficiary Management

Beneficiaries are added to the vesting schedule:

```rust
fn process_add_vesting_beneficiary(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    beneficiary: Pubkey,
    amount: u64,
) -> ProgramResult {
    // Account validation...

    // Create beneficiary entry
    let beneficiary_entry = VestingBeneficiary {
        beneficiary,
        total_amount: amount,
        released_amount: 0,
    };

    // Update vesting state
    vesting_state.beneficiaries.push(beneficiary_entry);
    vesting_state.num_beneficiaries = vesting_state.num_beneficiaries.checked_add(1)
        .ok_or(VCoinError::CalculationError)?;
    vesting_state.total_tokens = vesting_state.total_tokens.checked_add(amount)
        .ok_or(VCoinError::CalculationError)?;
    vesting_state.total_allocated = vesting_state.total_allocated.checked_add(amount)
        .ok_or(VCoinError::CalculationError)?;

    // Serialize to account
    vesting_state.serialize(&mut *vesting_info.data.borrow_mut())?;
}
```

### Token Release Mechanism

Tokens are released according to the vesting schedule:

```rust
fn process_release_vested_tokens(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    beneficiary: Pubkey,
) -> ProgramResult {
    // Account validation...

    // Find beneficiary
    let beneficiary_index = vesting_state.beneficiaries.iter()
        .position(|b| b.beneficiary == beneficiary)
        .ok_or(VCoinError::BeneficiaryNotFound)?;

    // Calculate releasable tokens
    let releasable = calculate_releasable_amount(
        vesting_state.start_time,
        vesting_state.release_interval,
        vesting_state.num_releases,
        current_time,
        vesting_state.beneficiaries[beneficiary_index].total_amount,
        vesting_state.beneficiaries[beneficiary_index].released_amount,
    )?;

    if releasable == 0 {
        msg!("No tokens due for release yet");
        return Err(VCoinError::NoTokensToRelease.into());
    }

    // Transfer tokens to beneficiary
    // ...

    // Update state
    vesting_state.beneficiaries[beneficiary_index].released_amount = 
        vesting_state.beneficiaries[beneficiary_index].released_amount
            .checked_add(releasable)
            .ok_or(VCoinError::CalculationError)?;

    vesting_state.total_released = vesting_state.total_released
        .checked_add(releasable)
        .ok_or(VCoinError::CalculationError)?;

    vesting_state.last_release_time = current_time;

    // Serialize to account
    vesting_state.serialize(&mut *vesting_info.data.borrow_mut())?;
}
```

The `calculate_releasable_amount` function determines how many tokens are eligible for release based on the vesting schedule and time passed.

---

## 6. Autonomous Supply Control

### Price Oracle Integration

VCoin integrates with both Switchboard and Pyth oracles for price data:

```rust
fn try_get_pyth_price<'info>(
    oracle_info: &'info AccountInfo<'info>,
    current_time: i64,
) -> Result<(u64, u64, i64), ProgramError> {
    // Load price account
    let price_account: SolanaPriceAccount = load_price_account(oracle_info)?;
    let price_data = price_account.get_price_unchecked();
    
    // Validate data
    if price_data.price <= 0 {
        msg!("Negative or zero price from Pyth: {}", price_data.price);
        return Err(VCoinError::InvalidOracleData.into());
    }
    
    // Convert to u64 with proper scaling
    let price = (price_data.price as u64) * 10u64.pow(6 - price_account.get_exponent());
    
    // Check confidence
    let confidence = (price_data.conf as u64) * 10u64.pow(6 - price_account.get_exponent());
    
    // ... Additional validation ...
    
    Ok((price, confidence, price_data.publish_time))
}

fn try_get_switchboard_price<'info>(
    oracle_info: &'info AccountInfo<'info>,
    current_time: i64,
) -> Result<(u64, u64, i64), ProgramError> {
    // ... Similar logic for Switchboard ...
}
```

These functions convert oracle data to a standardized format with:
- Price in USDC units (6 decimal places)
- Confidence interval
- Publish timestamp

### Minting Algorithm

The autonomous controller mints tokens based on price appreciation:

```rust
fn process_execute_autonomous_mint(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Load controller state
    let mut controller = AutonomousSupplyController::try_from_slice(&controller_info.data.borrow())?;

    // Get price data
    let (new_price, confidence, price_time) = Self::try_get_price(oracle_info, current_time)?;

    // Update controller state with new price
    controller.current_price = new_price;
    controller.last_price_update = current_time;

    // Calculate growth
    let growth_bps = controller.calculate_price_growth_bps()
        .ok_or(VCoinError::CalculationError)?;

    // Calculate mint amount based on growth
    let mint_amount = controller.calculate_mint_amount()
        .ok_or(VCoinError::CalculationError)?;

    if mint_amount == 0 {
        msg!("No minting needed at this time");
        return Ok(());
    }

    // Check supply limits
    let new_supply = controller.current_supply
        .checked_add(mint_amount)
        .ok_or(VCoinError::CalculationError)?;

    // ... Additional checks ...

    // Mint tokens
    let mint_ix = spl_token_2022::instruction::mint_to(
        token_program_info.key,
        mint_info.key,
        destination_info.key,
        mint_authority_info.key,
        &[],
        mint_amount,
    )?;

    // Execute mint with PDA signing
    // ...

    // Update supply
    controller.current_supply = new_supply;
    controller.last_mint_timestamp = current_time;

    // Serialize controller
    controller.serialize(&mut *controller_info.data.borrow_mut())?;
}
```

The controller has thresholds for different growth levels:

```rust
// Calculate mint amount based on growth
pub fn calculate_mint_amount(&self) -> Option<u64> {
    // Get annual price growth in basis points
    let growth_bps = self.calculate_price_growth_bps()?;
    
    // Only mint on positive growth
    if growth_bps <= 0 {
        return Some(0);
    }
    
    // For tokens above high supply threshold (5B tokens)
    if self.current_supply >= self.high_supply_threshold {
        // Only mint if growth exceeds extreme threshold (30%)
        if growth_bps >= self.extreme_growth_threshold_bps as i64 {
            // Mint at 2% rate only for extreme growth above 5B supply
            let mint_amount = self.current_supply
                .checked_mul(self.post_cap_mint_rate_bps as u64)?
                .checked_div(10000)?;
            return Some(mint_amount);
        }
        // Otherwise no minting for high supply
        return Some(0);
    }
    
    // ... Logic for different growth levels ...
}
```

### Burning Mechanism

Similarly, the controller burns tokens during price decline:

```rust
fn process_execute_autonomous_burn(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Calculate price decline and burn amount
    // ... Similar to mint logic but for price decline scenarios ...

    // Burn tokens from burn treasury
    let burn_ix = spl_token_2022::instruction::burn(
        token_program_info.key,
        burn_treasury_token_account_info.key,
        mint_info.key,
        burn_treasury_authority_info.key,
        &[],
        burn_amount,
    )?;

    // Execute with PDA signing
    // ...

    // Update supply
    controller.current_supply = new_supply;
    controller.last_burn_timestamp = current_time;

    // Serialize controller
    controller.serialize(&mut *controller_info.data.borrow_mut())?;
}
```

This automated supply adjustment mechanism creates a token with built-in price stability features.

---

## 7. Upgrade Mechanism

### Timelock Implementation

VCoin implements a timelock for upgrades to ensure transparent governance:

```rust
fn process_initialize_upgrade_timelock(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    timelock_duration: i64,
) -> ProgramResult {
    // Account validation...

    // Verify timelock duration is reasonable (minimum 1 day, maximum 30 days)
    let day_in_seconds = 24 * 60 * 60;
    if timelock_duration < day_in_seconds || timelock_duration > 30 * day_in_seconds {
        msg!("Timelock duration must be between 1 and 30 days");
        return Err(VCoinError::InvalidInstructionData.into());
    }

    // Initialize upgrade timelock state
    let upgrade_timelock = UpgradeTimelock {
        is_initialized: true,
        upgrade_authority: *upgrade_authority_info.key,
        proposed_upgrade_time: 0, // No upgrade proposed yet
        timelock_duration,
        is_upgrade_pending: false,
    };
    
    // Serialize and store state
    upgrade_timelock.serialize(&mut *timelock_account_info.data.borrow_mut())?;
}
```

### Upgrade Proposal & Execution

Upgrades must be proposed and can only be executed after the timelock period:

```rust
fn process_propose_upgrade(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Calculate the proposed upgrade time
    let proposed_time = current_time
        .checked_add(upgrade_timelock.timelock_duration)
        .ok_or(VCoinError::CalculationError)?;
    
    // Update timelock state
    upgrade_timelock.proposed_upgrade_time = proposed_time;
    upgrade_timelock.is_upgrade_pending = true;
    
    // Save updated state
    upgrade_timelock.serialize(&mut *timelock_account_info.data.borrow_mut())?;
}

fn process_execute_upgrade(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    buffer: Pubkey,
) -> ProgramResult {
    // Account validation...

    // Verify timelock has expired
    if current_time < upgrade_timelock.proposed_upgrade_time {
        let time_left = upgrade_timelock.proposed_upgrade_time - current_time;
        msg!("Upgrade timelock has not expired yet. {} seconds left", time_left);
        return Err(VCoinError::TooEarlyForMinting.into()); // Reuse this error for timelock
    }
    
    // Create the upgrade instruction
    let upgrade_ix = solana_program::bpf_loader_upgradeable::upgrade(
        program_account_info.key,
        buffer_account_info.key,
        upgrade_authority_info.key,
        spill_account_info.key,
    );
    
    // Execute the upgrade instruction
    invoke(
        &upgrade_ix,
        // Account infos...
    )?;
    
    // Reset upgrade state
    upgrade_timelock.proposed_upgrade_time = 0;
    upgrade_timelock.is_upgrade_pending = false;
    
    // Save updated state
    upgrade_timelock.serialize(&mut *timelock_account_info.data.borrow_mut())?;
}
```

### Permanent Upgrade Lock

For final production deployments, upgrades can be permanently disabled:

```rust
fn process_permanently_disable_upgrades(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Create the set upgrade authority instruction with null authority (permanent)
    let set_authority_ix = solana_program::bpf_loader_upgradeable::set_upgrade_authority(
        program_account_info.key,
        upgrade_authority_info.key,
        None, // Setting to None permanently disables upgrades
    );
    
    // Execute the set authority instruction
    invoke(
        &set_authority_ix,
        // Account infos...
    )?;
    
    msg!("Program upgrades permanently disabled");
    Ok(())
}
```

This provides a strong security guarantee for users that the program cannot be modified once it reaches its final state.

---

## 8. Security Features

### Authority Validation

Throughout the codebase, authority validation ensures only authorized entities can perform privileged operations:

```rust
// Verify authority signed transaction
if !authority_info.is_signer {
    msg!("Authority must sign transaction");
    return Err(VCoinError::Unauthorized.into());
}

// Verify authority matches expected
if presale_state.authority != *authority_info.key {
    msg!("Caller is not the presale authority");
    return Err(VCoinError::Unauthorized.into());
}
```

This pattern is consistent across all administrative functions.

### PDA Derivation

Program Derived Addresses (PDAs) are used extensively for programmatic control of accounts:

```rust
// Derive mint authority PDA
let (expected_mint_authority, authority_bump) = 
    Pubkey::find_program_address(&[b"mint_authority", mint_info.key.as_ref()], program_id);
    
if expected_mint_authority != *mint_authority_info.key {
    msg!("Invalid mint authority PDA");
    return Err(VCoinError::InvalidMintAuthority.into());
}
```

PDAs are used for:
- Mint authority control
- Treasury management
- Burn operations
- Vesting releases

This prevents external tampering with controlled accounts.

### Arithmetic Safety

All arithmetic operations use checked variants to prevent overflow/underflow:

```rust
let new_total = presale_state.total_raised
    .checked_add(contribution_amount)
    .ok_or(VCoinError::CalculationError)?;

let token_amount = contribution_amount
    .checked_mul(TOKEN_MULTIPLIER)
    .and_then(|amount| amount.checked_div(presale_state.token_price))
    .ok_or(VCoinError::CalculationError)?;
```

This pattern is consistent throughout the codebase, preventing potential attack vectors through arithmetic manipulation.

---

## 9. Error Handling

### Custom Error Types

Custom error types in `error.rs` provide specific error codes:

```rust
#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum VCoinError {
    /// Invalid instruction
    #[error("Invalid instruction")]
    InvalidInstruction,

    /// Not rent exempt
    #[error("Not rent exempt")]
    NotRentExempt,

    // ... Many more error types ...

    /// Refund period has ended
    #[error("Refund period has ended")]
    RefundPeriodEnded,
    
    /// No contribution found
    #[error("No contribution found for this address")]
    NoContribution,
}
```

These error types are mapped to Solana's `ProgramError` through an implementation of the `From` trait:

```rust
impl From<VCoinError> for ProgramError {
    fn from(e: VCoinError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
```

### Error Propagation

Errors are propagated using Rust's `?` operator:

```rust
// Example of error propagation
let presale_state = PresaleState::try_from_slice(&presale_info.data.borrow())?;

// Verify presale is initialized
if !presale_state.is_initialized {
    msg!("Presale not initialized");
    return Err(VCoinError::NotInitialized.into());
}
```

This allows errors to bubble up to the program's entry point, where they're converted to the appropriate return value.

### User Feedback

Detailed error messages provide user feedback:

```rust
// Example of informative error messages
if current_time < presale_state.start_time {
    msg!("Presale has not started yet");
    msg!("Presale starts at {}", presale_state.start_time);
    return Err(VCoinError::PresaleNotStarted.into());
}

if current_time > presale_state.end_time {
    msg!("Presale has already ended");
    return Err(VCoinError::PresaleEnded.into());
}
```

These messages help client applications provide meaningful feedback to users when operations fail.

---

## 10. Appendix

### Data Structures

Key data structures include:

1. **PresaleState**: Manages presale configuration and contributions
2. **PresaleContribution**: Tracks individual contributions
3. **VestingState**: Manages vesting schedules
4. **VestingBeneficiary**: Tracks individual beneficiaries
5. **AutonomousSupplyController**: Manages algorithmic supply
6. **TokenMetadata**: Stores token descriptive information
7. **UpgradeTimelock**: Manages upgrade governance

### Instruction Format

Instructions are defined in `instruction.rs` with a clear enum structure:

```rust
pub enum VCoinInstruction {
    /// Initialize a new token
    InitializeToken {
        name: String,
        symbol: String,
        decimals: u8,
        transfer_fee_basis_points: u16,
        maximum_fee_rate: u64,
    },
    
    /// Initialize presale
    InitializePresale {
        start_time: i64,
        end_time: i64,
        token_price: u64,
        hard_cap: u64,
        soft_cap: u64,
        min_purchase: u64,
        max_purchase: u64,
    },
    
    // ... Many more instructions ...
}
```

Each instruction variant includes the parameters needed for that specific operation.

### Account Requirements

Each instruction requires specific accounts in a defined order:

```rust
// Example: Initialize token accounts
// 0. `[signer]` The payer/authority account
// 1. `[writable]` The token mint account (must be a newly created account)
// 2. `[]` The mint authority PDA
// 3. `[]` The SPL Token-2022 program
// 4. `[]` The system program
// 5. `[]` The rent sysvar
```

These account requirements are documented in the processor function for each instruction.

---

## Installation & Deployment

### Prerequisites
- Rust 1.65+
- Solana CLI 1.14.0+
- [Solana Program Library](https://github.com/solana-labs/solana-program-library) (SPL)

### Building
```bash
# Clone the repository
git clone https://github.com/yourusername/vcoin.git
cd vcoin

# Build the program
cd program
cargo build-bpf
```

### Deployment
```bash
# Deploy to devnet
solana program deploy --keypair <PATH_TO_KEYPAIR> target/deploy/vcoin_program.so

# Deploy to mainnet
solana program deploy --keypair <PATH_TO_KEYPAIR> target/deploy/vcoin_program.so
```

### Client Integration

The program can be integrated with client applications using the Solana Web3.js library:

```javascript
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { initializeToken, buyTokens, claimRefund } from './vcoin-client';

// Connect to cluster
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Create a new token
const tx = await initializeToken(
  connection,
  wallet, // Wallet instance
  {
    name: "VCoin Token",
    symbol: "VCOIN",
    decimals: 9,
    transferFeeBasisPoints: 100, // 1%
    maximumFeeRate: 1_000_000_000 // 1 VCOIN
  }
);

// Send and confirm transaction
const signature = await wallet.sendTransaction(tx, connection);
await connection.confirmTransaction(signature, 'confirmed');
```

## Conclusion

The VCoin program provides a comprehensive suite of token functionality on the Solana blockchain. Its modular design, attention to security details, and innovative algorithmic supply management make it suitable for a wide range of token projects. The integration with SPL Token 2022 ensures compatibility with the evolving Solana token ecosystem while providing advanced features like transfer fees and metadata management.

By combining presale mechanics, vesting schedules, and autonomous supply control, VCoin offers a complete solution for token issuance and management. The secure upgrade path with timelock protection and permanent locking options provides the right balance between maintainability and security.
