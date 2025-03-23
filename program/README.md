# VCoin Program

A single Solana smart contract that handles token creation, presale, vesting, and governance using the SPL Token-2022 standard.

## Features

- **Token Creation**: Create Token-2022 tokens with metadata and customizable supply
- **Presale Management**: Handle the entire presale process with minimal fees
- **Vesting**: Manage token vesting schedules for team, investors, etc.
- **Governance**: Update token metadata and manage authority controls
- **Transfer Fee**: Set and update transfer fees (configurable to zero for minimum fees)

## Technical Specifications

- **Solana Program Version**: 2.2.1
- **SPL Token-2022 Version**: 7.0.0
- **Solana CLI Version**: 2.2.3

## Build Instructions

### Prerequisites

Make sure you have the following installed:
- Rust and Cargo
- Solana CLI 2.2.3
- Solana test validator (for local testing)

### Install Dependencies

```bash
# Install Solana CLI 2.2.3
sh -c "$(curl -sSfL https://release.solana.com/v2.2.3/install)"

# Verify installation
solana --version  # Should show 2.2.3
```

### Build the Program

```bash
cd program
cargo build-bpf
```

This will create the compiled program (.so file) in the `target/deploy` directory.

### Deploy to Devnet

```bash
solana config set --url devnet
solana program deploy target/deploy/vcoin_program.so
```

## Program Instructions

### 1. Initialize Token

Creates a new SPL Token-2022 with metadata and optional initial supply.

```rust
VCoinInstruction::InitializeToken {
    name: String,
    symbol: String,
    decimals: u8,
    initial_supply: u64,
}
```

### 2. Initialize Presale

Sets up a presale for the token with customizable parameters.

```rust
VCoinInstruction::InitializePresale {
    start_time: i64,
    end_time: i64,
    token_price: u64,
    hard_cap: u64,
    soft_cap: u64,
    min_purchase: u64,
    max_purchase: u64,
}
```

### 3. Buy Tokens

Allows users to purchase tokens during the presale phase.

```rust
VCoinInstruction::BuyTokens {
    amount_usd: u64,
}
```

### 4. Initialize Vesting

Sets up a vesting schedule for token distribution.

```rust
VCoinInstruction::InitializeVesting {
    total_tokens: u64,
    start_time: i64,
    release_interval: i64,
    num_releases: u8,
}
```

## Security Considerations

- All authority actions require proper signing
- Decimal precision is used for price calculations
- Overflow protection is implemented for all arithmetic operations
- Time-based validations for presale and vesting periods
- Separate authority controls for different functions

## License

MIT 