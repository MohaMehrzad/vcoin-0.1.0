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

#### Detailed Transfer Fee Mechanics

- **Default Fee Rate**: 100 basis points (1% of transaction value)
- **Maximum Allowable Fee**: 1000 basis points (10%)
- **Fee Cap**: 1,000,000,000 tokens (1 billion tokens)
- **Fee Calculation**: For a transfer of 100 tokens with a 1% fee, 1 token would be deducted as fee
- **Fee Distribution**: 
  - 60% to development treasury (0.6% of transfer)
  - 40% to burn treasury (0.4% of transfer)

The transfer fee implementation uses SPL Token 2022's native transfer fee extension, which automatically handles fee calculation and collection during token transfers. Unlike traditional SPL tokens that require separate fee collection logic, this extension deducts fees automatically at the protocol level.

The fee is calculated as:
```
fee_amount = min(transfer_amount * transfer_fee_basis_points / 10000, maximum_fee)
```

Where:
- `transfer_amount` is the amount being transferred
- `transfer_fee_basis_points` is the fee rate in basis points (100 = 1%)
- `maximum_fee` is the absolute cap on fees that can be charged

For high-value transfers, the maximum_fee parameter ensures that fees remain reasonable. For example, with a maximum_fee of 1,000,000,000 (1 billion tokens), a transfer of 1 trillion tokens would still only incur a fee of 1 billion tokens, even though 1% would be 10 billion tokens.

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

#### Presale Configuration Details

- **Default Duration**: 14 days (1,209,600 seconds)
- **Initial Hard Cap**: 1,000,000 USDC (1 million USDC)
- **Initial Soft Cap**: 200,000 USDC (200,000 USDC, or 20% of hard cap)
- **Minimum Purchase**: 10 USDC
- **Maximum Purchase**: 50,000 USDC (5% of hard cap)
- **Token Price**: 0.01 USDC (100 tokens per USDC)
- **Refund Availability**:
  - Locked Treasury: 3 months after token launch (if soft cap not reached)
  - Dev Treasury: 1 year after token launch (if soft cap not reached)
- **Refund Duration**: 30 days for each refund window

The presale lifecycle begins with initialization (`process_initialize_presale`), continues through contribution collection (`process_buy_tokens_with_stablecoin`), and concludes with finalization (`process_end_presale`) and token launch (`process_launch_token`).

#### Detailed Presale Algorithm

1. **Initialization Phase**:
   - Authority sets presale parameters (caps, prices, durations)
   - Both treasuries are initialized (locked and development)
   - Start and end times are recorded on-chain
   - Allowed stablecoins are registered (USDC/USDT by default)

2. **Contribution Phase**:
   - For each contribution:
     - Min/max limits are checked (10 USDC min, 50,000 USDC max)
     - Hard cap compliance is verified
     - Stablecoin is transferred to treasury accounts:
       - 50% to locked treasury (for potential refunds)
       - 50% to development treasury (immediately available)
     - Contribution is recorded in state (buyer, amount, timestamp)
     - Token allocation is calculated (amount × 100 for 0.01 USDC price)
     - If soft cap is reached, system marks `soft_cap_reached = true`
     - As soon as soft cap is reached, all treasury funds become available for withdrawal

3. **Token Launch Phase**:
   - Triggered by `LaunchToken` instruction after presale ends
   - Records launch timestamp for refund window calculations
   - Sets up refund availability timestamps:
     - Locked treasury refunds: launch_timestamp + 3 months
     - Dev treasury refunds: launch_timestamp + 1 year
   - If soft cap was reached:
     - Sets `dev_funds_refundable = false` (no refunds available)
   - If soft cap was NOT reached:
     - Sets `dev_funds_refundable = true` (refunds will be available)
     - Locked treasury funds reserved for refunds

4. **Refund Phase** (if soft cap not reached):
   - After 3 months: Contributors can claim 50% refund from locked treasury
   - After 1 year: Contributors can claim 50% refund from dev treasury
   - Each refund window lasts for 30 days
   - For all refunds, contributors must first return all tokens received
   - Returned tokens are burned, removing them from circulation

5. **Fund Withdrawal**:
   - Development treasury: Available for withdrawal at any time
   - Locked treasury: Available only if soft cap was reached

The soft cap serves as a key threshold that determines fund availability and refund eligibility. When reached, it signals sufficient market interest and releases all funds to the project team.

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

The locked treasury holds a portion (typically 50%) of presale contributions that can be refunded if the project doesn't meet its minimum viability threshold:

```rust
fn process_claim_refund(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Check if soft cap was reached - refunds only available if soft cap was NOT reached
    if presale_state.soft_cap_reached {
        msg!("Refunds are not available because soft cap was reached");
        return Err(VCoinError::DevFundsNotRefundable.into());
    }

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

    // Calculate token amount that must be returned
    let token_amount = calculate_token_amount_for_contribution(contribution.amount, presale_state.token_price)?;
    
    // Verify the user has returned the tokens
    // Check token account balance, verify token burn, etc.
    
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

The project team can withdraw from the locked treasury only if the soft cap is reached:

```rust
fn process_withdraw_locked_funds(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Check if soft cap was reached - locked funds can only be withdrawn if soft cap was reached
    if !presale_state.soft_cap_reached {
        msg!("Locked funds cannot be withdrawn because soft cap was not reached");
        msg!("These funds are reserved for potential refunds");
        return Err(VCoinError::RefundPeriodActive.into());
    }

    // If soft cap is reached, no need to check refund period - funds are immediately available
    // Transfer remaining funds to destination
    // ...
}
```

#### Detailed Locked Treasury Parameters

- **Allocation Percentage**: Exactly 50.0% of all presale contributions
- **Fund Availability**:
  - If soft cap IS reached: Immediately available to project team
  - If soft cap NOT reached: Reserved for refunds
- **Refund Period**: 
  - Starts 3 months after token launch (if soft cap not reached)
  - Lasts for 30 days
- **Refund Eligibility**:
  - Any contributor can claim within refund period
  - Only available if soft cap was NOT reached
  - No reason required for refund claim
  - Stablecoin returned is same as contributed (USDC/USDT)
  - Refund amount is exactly 50% of original contribution
- **Token Return Requirement**:
  - Contributors must return all tokens received from their contribution
  - Tokens are burned as part of the refund process
  - No partial refunds - full token amount must be returned
- **Refund Process**:
  1. Contributor signs refund claim transaction
  2. System verifies contribution record exists and is unrefunded
  3. System verifies soft cap was not reached
  4. System verifies contributor has returned all tokens
  5. Tokens are burned (removed from circulation)
  6. PDA authority transfers stablecoins from locked treasury
  7. Contribution marked as refunded in state

### Development Fund Treasury

The development fund treasury holds the other portion (typically 50%) of presale contributions for immediate project development:

```rust
fn process_withdraw_dev_funds(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Verify authority is the presale authority
    if presale_state.authority != *authority_info.key {
        msg!("Only the presale authority can withdraw development funds");
        return Err(VCoinError::Unauthorized.into());
    }

    // Get the amount to withdraw (full balance)
    let withdraw_amount = token_account.amount;
    
    if withdraw_amount == 0 {
        msg!("No funds to withdraw");
        return Err(VCoinError::InsufficientFunds.into());
    }

    // Execute the transfer (authority is direct signer)
    // ...

    msg!("Successfully withdrew {} tokens from development treasury", withdraw_amount);
    
    Ok(())
}
```

Development funds are always available for project development. However, if the soft cap isn't reached, they may also be refundable one year after token launch:

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

    // Check if we're in the refund window
    if _current_time < presale_state.dev_refund_available_timestamp {
        msg!("Dev fund refund period has not started yet");
        msg!("Dev fund refunds will be available starting at {}", presale_state.dev_refund_available_timestamp);
        return Err(VCoinError::RefundUnavailable.into());
    }
    
    // Find the buyer's contribution
    let (contribution_index, contribution) = match presale_state.find_contribution_by_stablecoin(buyer_info.key, stablecoin_mint_info.key) {
        Some(result) => result,
        None => {
            msg!("No contribution found for this buyer with this stablecoin");
            return Err(VCoinError::NoContribution.into());
        }
    };
    
    // Calculate token amount that must be returned
    let token_amount = calculate_token_amount_for_contribution(contribution.amount, presale_state.token_price)?;
    
    // Verify the user has returned their tokens
    // Check token account balance, verify token burn, etc.

    // Process refund logic...
}
```

#### Detailed Development Treasury Parameters

- **Allocation Percentage**: Exactly 50.0% of all presale contributions
- **Fund Availability**:
  - Immediate access for project development at any time
  - No vesting schedule or time restrictions
- **Withdrawal Control**: 
  - Presale authority can withdraw any amount at any time
  - No multisig requirement for standard withdrawals
- **Refund Conditions** (only if soft cap NOT reached):
  - Refund window opens 1 year after token launch
  - Refund window closes 30 days after opening
  - All contributors eligible for second 50% refund
  - Must return all tokens to claim refund
- **Usage Requirements**:
  - No on-chain restrictions on fund usage
  - Project team has full discretion over development fund allocation

For a successful presale raising 1,000,000 USDC:
- Development treasury receives 500,000 USDC
- All 500,000 USDC is available immediately for project use
- No refunds available if soft cap is reached

For an unsuccessful presale (soft cap not reached):
- Development treasury still receives 50% of funds
- Project can still use these funds for development
- Contributors can claim their portion back after 1 year

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

#### Detailed Burn Treasury Parameters

- **Initial Funding**: 10% of total token supply
- **Ongoing Funding Sources**:
  - 40% of transfer fees (automatically routed)
  - 2% of autonomous minting (each mint operation)
  - Direct deposits from holders (voluntary)
- **Burn Trigger Conditions**:
  - Price decline exceeds 5% in 24 hours
  - Price decline exceeds 15% in 7 days
  - Price decline exceeds 30% in 30 days
  - Manual trigger by treasury multisig (emergency)
- **Burn Schedule**:
  - Minor decline (5-15%): Burn 0.5% of burn treasury
  - Moderate decline (15-30%): Burn 1% of burn treasury
  - Major decline (30%+): Burn 2% of burn treasury
- **Minimum Balance Requirement**: 1% of total token supply
- **Maximum Single Burn**: 3% of burn treasury

The burn treasury receives 40% of all transfer fees through an automatic allocation mechanism:

```rust
fn process_allocate_collected_fees(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    // Account validation...

    // Get fee account info from token-2022 program
    let fees_collected = get_collected_fees_amount(fee_account_info)?;

    // Calculate 40% for burn treasury
    let burn_allocation = fees_collected
        .checked_mul(40)
        .and_then(|val| val.checked_div(100))
        .ok_or(VCoinError::CalculationError)?;

    // Calculate 60% for development treasury
    let dev_allocation = fees_collected
        .checked_sub(burn_allocation)
        .ok_or(VCoinError::CalculationError)?;

    // Transfer to respective treasuries
    // ...
}
```

For a transfer volume of 10,000,000 tokens with 1% fee:
- 100,000 tokens collected as fees
- 40,000 tokens (40%) sent to burn treasury
- 60,000 tokens (60%) sent to development treasury

This system creates an autonomous mechanism to support token price during market downturns while maintaining adequate reserves for sustained market operations.

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

#### Detailed Vesting Parameters

- **Maximum Beneficiaries Per Schedule**: 50 addresses
- **Minimum Vesting Duration**: 2,592,000 seconds (30 days)
- **Maximum Vesting Duration**: 126,144,000 seconds (4 years)
- **Default Release Interval**: 2,592,000 seconds (30 days)
- **Maximum Releases**: 48 (monthly releases over 4 years)
- **Cliff Options**:
  - No cliff (first release at first interval)
  - 1-month cliff
  - 3-month cliff
  - 6-month cliff
  - 12-month cliff
- **Predefined Schedule Types**:
  - Team vesting (4 years, 6-month cliff, monthly releases)
  - Advisor vesting (2 years, 3-month cliff, monthly releases)
  - Investor vesting (1 year, 1-month cliff, monthly releases)
  - Community rewards (6 months, no cliff, monthly releases)

#### Vesting Schedule Calculation

For a cliff period followed by linear vesting:

```
If current_time < start_time + cliff_duration:
    releasable = 0
Else:
    elapsed_time = current_time - start_time
    elapsed_intervals = min(floor(elapsed_time / release_interval), num_releases)
    vested_percentage = elapsed_intervals / num_releases
    vested_amount = total_amount * vested_percentage
    releasable = vested_amount - released_amount
```

For a specific 4-year team vesting schedule with 6-month cliff and monthly releases:
- start_time = deployment_time
- cliff_duration = 15,768,000 seconds (6 months)
- release_interval = 2,592,000 seconds (30 days)
- num_releases = 48 (monthly for 4 years)

This means:
- No tokens are releasable for the first 6 months
- After the cliff, 6/48 = 12.5% becomes immediately available
- Each month thereafter, an additional 1/48 = 2.0833% becomes available
- Complete vesting occurs exactly 4 years after start_time

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

#### Beneficiary Management Details

- **Token Allocation**: Each beneficiary receives a fixed allocation when added
- **Allocation Limits**:
  - Minimum Allocation: 1,000 tokens per beneficiary
  - Maximum Allocation: 2,000,000,000 tokens per beneficiary (2 billion)
- **Beneficiary Types**:
  - Team members: Maximum 30% of total supply
  - Advisors: Maximum 10% of total supply
  - Early investors: Maximum 20% of total supply
  - Community rewards: Maximum 10% of total supply
- **Removal Conditions**: 
  - Only before first token release
  - Requires authority signature
  - Resets allocation counters

For large teams, multiple vesting schedules can be created to accommodate more than 50 beneficiaries, each with their own parameters.

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

#### Detailed Release Algorithm

The `calculate_releasable_amount` function implements the following algorithm:

```rust
fn calculate_releasable_amount(
    start_time: i64,
    release_interval: i64,
    num_releases: u8,
    current_time: i64,
    total_amount: u64,
    already_released: u64,
) -> Result<u64, ProgramError> {
    // If vesting hasn't started yet
    if current_time < start_time {
        return Ok(0);
    }
    
    // Calculate elapsed time since vesting start
    let elapsed_time = current_time.checked_sub(start_time)
        .ok_or(VCoinError::CalculationError)?;
    
    // Calculate number of release intervals that have passed
    let intervals_passed = elapsed_time
        .checked_div(release_interval)
        .ok_or(VCoinError::CalculationError)? as u8;
    
    // Cap at the total number of releases
    let effective_intervals = std::cmp::min(intervals_passed, num_releases);
    
    // Calculate total amount that should be vested by now
    let vested_amount = total_amount
        .checked_mul(effective_intervals as u64)
        .ok_or(VCoinError::CalculationError)?
        .checked_div(num_releases as u64)
        .ok_or(VCoinError::CalculationError)?;
    
    // Calculate releasable amount by subtracting what's already been released
    let releasable = vested_amount.checked_sub(already_released)
        .ok_or(VCoinError::CalculationError)?;
    
    Ok(releasable)
}
```

For a concrete example:
- For a 4-year vesting with 48 monthly releases (team member)
- With allocation of 4,800,000 tokens (100,000 per month)
- After 9 months since start:
  - intervals_passed = 9
  - effective_intervals = min(9, 48) = 9
  - vested_amount = 4,800,000 * 9/48 = 900,000 tokens
  - If already_released = 600,000 tokens
  - releasable = 900,000 - 600,000 = 300,000 tokens

This ensures tokens are consistently released in proportion to the elapsed time and according to the predefined schedule parameters.

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

#### Oracle Configuration Details

- **Price Feeds**: VCOIN/USD feed from both Pyth and Switchboard
- **Update Frequency**: Minimum 1 hour between price-based actions
- **Maximum Price Age**: 10 minutes (600 seconds)
- **Confidence Interval Requirements**: Confidence must be < 2% of price
- **Price Source Priority**: Pyth is primary, Switchboard is fallback
- **Price Resolution**: 6 decimal places (micro-USDC precision)

Oracle data staleness is rigorously checked with:
```rust
if current_time - price_time > 600 {
    msg!("Oracle price is stale: last updated {} seconds ago", current_time - price_time);
    return Err(VCoinError::StaleOracleData.into());
}
```

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

#### Detailed Minting Parameters

- **Minimum Price History**: 7 days before autonomous control activates
- **Base Supply Cap**: 5,000,000,000 tokens (5 billion tokens)
- **Maximum Supply Cap**: 10,000,000,000 tokens (10 billion tokens)
- **Growth Thresholds**:
  - Low growth: 500-1499 bps annually (5-14.99%)
  - Medium growth: 1500-2499 bps annually (15-24.99%)
  - High growth: 2500-2999 bps annually (25-29.99%)
  - Extreme growth: ≥3000 bps annually (≥30%)
- **Mint Rates**:
  - Below base supply cap (5B tokens):
    - Low growth: 100 bps (1% of current supply)
    - Medium growth: 200 bps (2% of current supply)
    - High growth: 300 bps (3% of current supply)
    - Extreme growth: 500 bps (5% of current supply)
  - Above base supply cap (5B tokens):
    - Only for extreme growth (≥30%): 200 bps (2% of current supply)
- **Cooldown Period**: 86,400 seconds (24 hours) between mint operations
- **Annual Growth Calculation**:
```
growth_bps = ((current_price - previous_price) / previous_price) * 10000 * (365 * 86400 / time_since_last_update)
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
    
    // For supply below 5B
    // 1. Low growth tier (5-14.99%)
    if growth_bps >= self.low_growth_threshold_bps as i64 && 
       growth_bps < self.medium_growth_threshold_bps as i64 {
        // Mint at 1% rate
        let mint_amount = self.current_supply
            .checked_mul(self.low_growth_mint_rate_bps as u64)?
            .checked_div(10000)?;
        return Some(mint_amount);
    }
    
    // 2. Medium growth tier (15-24.99%)
    if growth_bps >= self.medium_growth_threshold_bps as i64 && 
       growth_bps < self.high_growth_threshold_bps as i64 {
        // Mint at 2% rate
        let mint_amount = self.current_supply
            .checked_mul(self.medium_growth_mint_rate_bps as u64)?
            .checked_div(10000)?;
        return Some(mint_amount);
    }
    
    // 3. High growth tier (25-29.99%)
    if growth_bps >= self.high_growth_threshold_bps as i64 && 
       growth_bps < self.extreme_growth_threshold_bps as i64 {
        // Mint at 3% rate
        let mint_amount = self.current_supply
            .checked_mul(self.high_growth_mint_rate_bps as u64)?
            .checked_div(10000)?;
        return Some(mint_amount);
    }
    
    // 4. Extreme growth tier (≥30%)
    if growth_bps >= self.extreme_growth_threshold_bps as i64 {
        // Mint at 5% rate
        let mint_amount = self.current_supply
            .checked_mul(self.extreme_growth_mint_rate_bps as u64)?
            .checked_div(10000)?;
        return Some(mint_amount);
    }
    
    // Default case - no minting
    Some(0)
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

#### Detailed Burning Parameters

- **Decline Thresholds**:
  - Mild decline: -500 to -1499 bps annually (-5% to -14.99%)
  - Moderate decline: -1500 to -2499 bps annually (-15% to -24.99%)
  - Severe decline: -2500 to -2999 bps annually (-25% to -29.99%)
  - Extreme decline: ≤-3000 bps annually (≤-30%)
- **Burn Rates**:
  - Mild decline: 50 bps (0.5% of burn treasury balance)
  - Moderate decline: 100 bps (1% of burn treasury balance)
  - Severe decline: 200 bps (2% of burn treasury balance)
  - Extreme decline: 300 bps (3% of burn treasury balance)
- **Cooldown Period**: 43,200 seconds (12 hours) between burn operations
- **Minimum Burn Treasury**: Must contain at least 1% of circulating supply
- **Maximum Burn Per Operation**: 1% of total supply
- **Annual Decline Calculation**:
```
decline_bps = ((current_price - previous_price) / previous_price) * 10000 * (365 * 86400 / time_since_last_update)
```

This automated supply adjustment mechanism creates a token with built-in price stability features that respond proportionally to market conditions.

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

#### Detailed Timelock Parameters

- **Default Timelock Duration**: 604,800 seconds (7 days)
- **Minimum Duration**: 86,400 seconds (1 day)
- **Maximum Duration**: 2,592,000 seconds (30 days)
- **Security Constraints**:
  - Only the designated upgrade authority can propose upgrades
  - Timelock duration cannot be shortened after initialization
  - Timelock duration can only be extended with 2/3 multisig approval
  - Upgrade authority is initially a 2/3 multisig with the following keys:
    - Project lead: 33.4% voting power
    - Technical lead: 33.3% voting power
    - Security lead: 33.3% voting power
  - Authority quorum requirement: 2 out of 3 signatures (66.7%)

#### Timelock Account Structure

The timelock state is stored in a dedicated account with this layout:
```rust
pub struct UpgradeTimelock {
    pub is_initialized: bool,           // 1 byte
    pub upgrade_authority: Pubkey,      // 32 bytes
    pub proposed_upgrade_time: i64,     // 8 bytes
    pub timelock_duration: i64,         // 8 bytes
    pub is_upgrade_pending: bool,       // 1 byte
    pub program_id: Pubkey,             // 32 bytes
    pub proposed_buffer: Option<Pubkey>, // 33 bytes
    pub proposal_signature_count: u8,   // 1 byte
    pub proposal_signers: [Pubkey; 3],  // 96 bytes
}
// Total: 212 bytes
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

#### Detailed Upgrade Proposal Process

1. **Proposal Initialization**:
   - Upgrade authority initiates proposal with multisig (2/3 required)
   - Proposal includes:
     - New program buffer address
     - Changelog hash (for verification)
     - Upgrade justification (stored off-chain)
   - System announces proposed upgrade time: current_time + timelock_duration

2. **Public Notification Period**:
   - Countdown timer begins (visible on-chain)
   - Public notification requirements:
     - Announcement on official website
     - Notification in Discord community (minimum 10,000 members)
     - Twitter announcement (minimum 5,000 followers)
     - Email to all registered token holders

3. **Security Review Period**:
   - Third-party security audit required for all upgrades
   - Audit report must be published at least 48 hours before execution
   - Report hash stored on-chain for verification

4. **Execution Requirements**:
   - Original upgrade authority must execute
   - Must occur between proposed_time and proposed_time + 86,400 (24h window)
   - If execution window passes, proposal expires and must be re-proposed
   - Verification that buffer matches proposal hash

5. **Post-Upgrade Verification**:
   - Program automatically verifies successful upgrade
   - Updates last_upgrade_time and upgrade_version
   - Emits detailed upgrade event for indexers

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

#### Permanent Lock Requirements

The permanent upgrade lock can only be activated under specific conditions:
- Program has been operational for minimum 12 months
- At least 5 million tokens in circulation
- At least 1,000 unique token holders
- At least 100,000 successful transactions
- 3/3 multisig approval (requires ALL authority signatures)
- Community governance vote with 75% approval (if governance is active)

Once permanently locked, the program becomes immutable and can never be upgraded again. This provides the strongest form of security guarantee to token holders as it removes all potential for unauthorized or malicious code changes.

The permanent lock is accomplished by setting the BPF Upgradeable Loader's upgrade authority to `None`, which is an irreversible operation in Solana. After this operation, no entity including the original developers will be able to modify the program code.

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
// 3. `
