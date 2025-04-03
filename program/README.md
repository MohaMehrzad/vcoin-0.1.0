# VCoin - Advanced Solana Token Program

VCoin (VCN) is a feature-rich token program built on Solana using the Token-2022 standard. It provides advanced tokenomics with autonomous supply control, secure presale functionality, vesting mechanisms, and robust governance features.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Token Management](#token-management)
- [Presale System](#presale-system)
- [Refund Mechanism](#refund-mechanism)
- [Autonomous Supply Control](#autonomous-supply-control)
- [Vesting System](#vesting-system)
- [Upgrade Controls](#upgrade-controls)
- [Oracle Integration](#oracle-integration)
- [Security Features](#security-features)
- [Installation](#installation)
- [Usage Examples](#usage-examples)
- [Error Handling](#error-handling)
- [License](#license)
- [Token Allocation](#token-allocation)
- [Deployment](#deployment)

## Overview

VCoin is a fully-featured Solana token program that combines modern tokenomics with market-responsive supply management. It uses the Token-2022 standard for enhanced functionality including transfer fees and provides mechanisms for presales, vesting, and secure upgrades.

## Features

- **Token-2022 Standard**: Leverages Solana's latest token standard for enhanced features.
- **Dynamic Supply**: Supply controls with 1B token minimum and adaptive mint/burn mechanisms.
- **Presale Management**: Complete presale system with stablecoin payments and refund capabilities.
- **Dual Treasury System**: 50/50 split between development and locked funds.
- **Autonomous Supply Control**: Price-reactive supply management based on oracle data.
- **Vesting System**: Configurable token vesting schedules for team, investors, etc.
- **Oracle Integration**: Multi-source price feed integration with Pyth and Switchboard.
- **Upgrade Controls**: Timelock and governance features for secure upgrades.
- **Transfer Fees**: Configurable transfer fees with a 1% maximum cap.
- **Reentrancy Protection**: Guards against reentrancy attacks.

## Token Management

The token uses the Token-2022 standard with the following configurable parameters:

- **Name**: Token name (e.g., "VCoin")
- **Symbol**: Token symbol (e.g., "VCN")
- **Decimals**: Token decimal places (e.g., 6)
- **Initial Supply**: Starting token supply
- **Transfer Fee**: Optional fee on transfers (max 1%)

### Instructions

- `InitializeToken`: Creates the token with configurable parameters
- `UpdateTokenMetadata`: Updates token name, symbol, or URI
- `SetTransferFee`: Sets transfer fee (capped at 1%)

## Token Allocation

The 1 billion total supply is allocated as follows:

- **Development and Operations**: 50% (500,000,000 VCN)
- **Presale**: 10% (100,000,000 VCN)
- **Airdrops and Community Rewards**: 5% (50,000,000 VCN)
- **Team and Investor Vesting**: 35% (350,000,000 VCN)

This allocation ensures sufficient funding for development while providing appropriate incentives for early supporters and the broader community.

## Presale System

The presale system allows for token sales with the following features:

- Multiple stablecoin support (USDC, USDT)
- Configurable start and end times
- Hard and soft caps
- Minimum and maximum purchase limits
- Expandable capacity (supports up to 1 million unique buyers)

### Instructions

- `InitializePresale`: Sets up the presale with configurable parameters
- `AddSupportedStablecoin`: Adds a supported stablecoin for purchases
- `BuyTokensWithStablecoin`: Purchases tokens with approved stablecoins
- `EndPresale`: Manually ends the presale
- `LaunchToken`: Marks the token as launched, beginning the refund availability countdown
- `ExpandPresaleAccount`: Increases the capacity for more buyers (up to 1M)

## Refund Mechanism

VCoin implements a sophisticated refund system with dual treasury management:

- **Development Treasury (50%)**: Immediately available for project development
- **Locked Treasury (50%)**: Reserved for potential refunds

When tokens are purchased:
1. 50% of funds go to the development treasury
2. 50% go to the locked treasury

Refund Windows:
- **Initial Refund**: 3 months after token launch, investors can claim 50% refund from locked treasury
- **Dev Fund Refund**: 1 year after token launch, if softcap wasn't reached, investors can claim the remaining 50%

If softcap is reached, all funds are released for development.

### Instructions

- `ClaimRefund`: Claims refund from locked treasury (available 3 months post-launch)
- `ClaimDevFundRefund`: Claims refund from development treasury (available 1 year post-launch if softcap wasn't reached)
- `WithdrawLockedFunds`: Allows project to withdraw remaining locked funds after refund period ends

## Autonomous Supply Control

VCoin features an algorithm-controlled supply that reacts to market conditions:

- Price data from multiple trusted oracles (Pyth/Switchboard)
- Adaptive minting and burning based on price performance
- Guaranteed minimum supply of 1B tokens (no burning below this threshold)
- Special minting rules for supply above 5B tokens
- Growth-responsive minting rules:
  - 5-10% growth: Mint 5% of current supply
  - >10% growth: Mint 10% of current supply
  - Above 5B tokens: Only mint 2% when growth exceeds 30%

### Instructions

- `InitializeAutonomousController`: Sets up supply controller with initial parameters
- `UpdateOraclePrice`: Updates the price from multiple oracle sources with aggregation
- `ExecuteAutonomousMint`: Mints new tokens based on price growth
- `ExecuteAutonomousBurn`: Burns tokens from burn treasury based on price decline
- `InitializeBurnTreasury`: Creates the burn treasury for controlled token burning
- `DepositToBurnTreasury`: Deposits tokens to the burn treasury

## Vesting System

The vesting system allows tokens to be released gradually to beneficiaries:

- Configurable vesting schedules
- Multiple beneficiaries
- Time-based unlocks
- Cliff periods support

### Instructions

- `InitializeVesting`: Creates a vesting schedule with configurable parameters
- `AddVestingBeneficiary`: Adds a beneficiary to the vesting schedule
- `ReleaseVestedTokens`: Releases vested tokens to a beneficiary when available

## Upgrade Controls

VCoin implements secure upgrade mechanisms:

- Timelock for upgrades to prevent rushed changes
- Option to permanently disable upgrades for immutability
- Multi-phase upgrade process

### Instructions

- `InitializeUpgradeTimelock`: Sets up upgrade timelock with configurable duration
- `ProposeUpgrade`: Proposes an upgrade, starting the timelock
- `ExecuteUpgrade`: Executes a proposed upgrade after timelock expires
- `PermanentlyDisableUpgrades`: Permanently removes upgrade capability

## Oracle Integration

VCoin integrates with multiple price oracles with enhanced reliability:

- **Multi-Source Price Feeds**: Uses multiple oracle sources with price aggregation
- **Primary/Backup System**: Automatically falls back to backup oracles if primary fails
- **Cross-Network Support**: Works with both mainnet and devnet oracle addresses
- **Supported Oracle Providers**:
  - Pyth Network (mainnet: `FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH`, devnet: `gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s`)
  - Switchboard (mainnet: `DtmE9D2CSB4L5D6A15mraeEjrGMm6auWVzgaD8hK2tZM`, devnet: `7azgmy1pFXHikv36q1zZASvFq5vFa39TT9NweVugKKTU`)
- **Freshness Checks**: Tiered staleness thresholds:
  - Standard: 3 hours for general data
  - Strict: 1 hour for economic decisions
  - Maximum: 24 hours absolute maximum
- **Confidence Validation**: Ensures reliable price data with confidence interval checks
- **Price Manipulation Protection**: Maximum 50% change allowed in a single update

## Security Features

VCoin implements several security features:

- **Reentrancy Guards**: Prevents reentrancy attacks on sensitive operations
- **Checked Math**: Uses checked arithmetic to prevent overflow/underflow
- **PDA Authorization**: Uses program derived addresses for secure authorization
- **Timelock Mechanisms**: Prevents rushed changes and actions
- **Oracle Validation**: Thorough validation of oracle data with multi-source verification
- **Bounded Loops**: Prevents gas limit issues with bounded iterations
- **Access Controls**: Strict validation on all sensitive operations
- **Transfer Fee Cap**: Hard 1% cap on transfer fees

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/vcoin.git
cd vcoin

# Install dependencies
npm install

# Build the program
cargo build-bpf
```

## Building and Testing

### Prerequisites

- Rust and Cargo: [Install instructions](https://doc.rust-lang.org/cargo/getting-started/installation.html)
- Solana CLI (v1.16.0 or later): [Install instructions](https://docs.solana.com/cli/install-solana-cli-tools)
- Node.js and npm (for client)
- Git

### Build Steps

```bash
# Navigate to the program directory
cd program

# Build the program
cargo build-bpf

# Output will be in target/deploy/vcoin.so
```

### Environment Setup

Create a `.env` file with the following configuration:

```
TOKEN_NAME=VCoin
TOKEN_SYMBOL=VCN
TOKEN_DECIMALS=6
TOKEN_TOTAL_SUPPLY=1000000000

# Token Allocation (percentage of total supply)
# Must add up to 100
DEV_ALLOCATION_PERCENT=50
PRESALE_ALLOCATION_PERCENT=10
AIRDROP_ALLOCATION_PERCENT=5
VESTING_ALLOCATION_PERCENT=35
```

### Testing

The project includes both unit and integration tests:

```bash
# Run all unit tests
cargo test

# Run specific unit tests
cargo test -- --nocapture test_initialize_token

# Start a local validator for testing
solana-test-validator

# Run integration tests in a separate terminal
npm test

# Test specific functionality
node test_deployment.js
```

## Usage Examples

### Token Creation

```javascript
// Initialize token
const tx = await program.methods.initializeToken({
  name: "VCoin",
  symbol: "VCN",
  decimals: 6,
  initialSupply: new BN("1000000000000000"), // 1B tokens with 6 decimals
  transferFeeBasisPoints: 50, // 0.5%
  maximumFeeRate: 1, // 1% of supply
}).accounts({
  authority: wallet.publicKey,
  mint: mintKeypair.publicKey,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
  rent: SYSVAR_RENT_PUBKEY,
  metadata: metadataAddress,
}).signers([mintKeypair]).rpc();
```

### Presale Setup

```javascript
// Initialize presale
const tx = await program.methods.initializePresale({
  startTime: new BN(Math.floor(Date.now()/1000) + 3600), // 1 hour from now
  endTime: new BN(Math.floor(Date.now()/1000) + 15552000), // 6 months from now
  tokenPrice: new BN(30000), // $0.03 with 6 decimals
  hardCap: new BN(3000000000000), // $3M with 6 decimals
  softCap: new BN(1000000000000), // $1M with 6 decimals (100M tokens at $0.03)
  minPurchase: new BN(3000000), // $3 USD (100 tokens at $0.03)
  maxPurchase: new BN(10000000000), // $10K with 6 decimals
}).accounts({
  authority: wallet.publicKey,
  presale: presaleKeypair.publicKey,
  mint: mintAddress,
  devTreasury: devTreasuryAddress,
  lockedTreasury: lockedTreasuryAddress,
  systemProgram: SystemProgram.programId,
  rent: SYSVAR_RENT_PUBKEY,
}).signers([presaleKeypair]).rpc();
```

### Buying Tokens

```javascript
// Buy tokens with stablecoin
const tx = await program.methods.buyTokensWithStablecoin({
  amount: new BN(100000000), // 100 USDC (with 6 decimals)
}).accounts({
  buyer: wallet.publicKey,
  presale: presaleAddress,
  mint: mintAddress,
  buyerTokenAccount: buyerTokenAddress,
  authority: authorityAddress,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  buyerStablecoinAccount: buyerUsdcAddress,
  devTreasuryStablecoinAccount: devTreasuryUsdcAddress,
  lockedTreasuryStablecoinAccount: lockedTreasuryUsdcAddress,
  stablecoinTokenProgram: TOKEN_PROGRAM_ID,
  stablecoinMint: USDC_MINT,
  clock: SYSVAR_CLOCK_PUBKEY,
}).rpc();
```

### Updating Oracle Price

```javascript
// Update price from multiple oracles
const tx = await program.methods.updateOraclePrice().accounts({
  controller: controllerAddress,
  primaryOracle: pythOracleAddress,
  clock: SYSVAR_CLOCK_PUBKEY,
  // Add backup oracles for increased reliability
  backupOracle1: switchboardOracleAddress,
  backupOracle2: anotherPythOracleAddress,
}).rpc();
```

### Claim Refund

```javascript
// Claim refund after 3 months
const tx = await program.methods.claimRefund().accounts({
  buyer: wallet.publicKey,
  presale: presaleAddress,
  buyerStablecoinAccount: buyerUsdcAddress,
  lockedTreasuryStablecoinAccount: lockedTreasuryUsdcAddress,
  lockedTreasuryAuthority: lockedTreasuryAuthPda,
  stablecoinTokenProgram: TOKEN_PROGRAM_ID,
  stablecoinMint: USDC_MINT,
  clock: SYSVAR_CLOCK_PUBKEY,
}).rpc();
```

## Error Handling

The program uses custom error types for precise error reporting:

- `InvalidInstruction`: Invalid instruction type provided
- `Unauthorized`: Caller lacks required permissions
- `InvalidAccountOwner`: Account not owned by expected program
- `InvalidMint`: Incorrect mint provided
- `CalculationError`: Arithmetic overflow/underflow
- `InvalidOracleData`: Oracle data is invalid or corrupt
- `StaleOracleData`: Oracle data is too old
- `PriceManipulationDetected`: Suspicious price changes detected
- `UnauthorizedBurnSource`: Attempt to burn tokens from unauthorized account
- `InvalidFeeAmount`: Transfer fee exceeds 1% maximum
- And many more specialized errors

## License

VCoin is licensed under MIT license. See LICENSE file for details.

## Deployment

### Deploying to Devnet

```bash
# Configure for devnet
solana config set --url https://api.devnet.solana.com

# Deploy program
solana program deploy target/deploy/vcoin.so

# Initialize token with client
node client.ts initialize
```

### Deploying to Mainnet

```bash
# Configure for mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Deploy program (use keypair with sufficient SOL)
solana program deploy target/deploy/vcoin.so --keypair path/to/keypair.json

# Initialize token with client
NODE_ENV=production node client.ts initialize
```

### Verifying Deployment

After deployment, the program ID will be displayed. You can verify the deployment with:

```bash
solana program show <PROGRAM_ID>
```

### Setting Up Vesting

```javascript
// Initialize vesting with 1-year schedule, monthly releases
const tx = await program.methods.initializeVesting({
  totalTokens: new BN("350000000000000"), // 350M tokens with 6 decimals
  startTime: new BN(Math.floor(Date.now()/1000) + 2592000), // 30 days from now
  releaseInterval: new BN(2592000), // 30 days in seconds
  numReleases: 12, // Monthly for 1 year
}).accounts({
  authority: wallet.publicKey,
  vesting: vestingKeypair.publicKey,
  mint: mintAddress,
  systemProgram: SystemProgram.programId,
  rent: SYSVAR_RENT_PUBKEY,
}).signers([vestingKeypair]).rpc();

// Add vesting beneficiary
const tx2 = await program.methods.addVestingBeneficiary({
  beneficiary: teamMemberPublicKey,
  amount: new BN("50000000000000"), // 50M tokens with 6 decimals
}).accounts({
  authority: wallet.publicKey,
  vesting: vestingAddress,
}).rpc();

// Release vested tokens (after vesting begins)
const tx3 = await program.methods.releaseVestedTokens({
  beneficiary: teamMemberPublicKey,
}).accounts({
  authority: wallet.publicKey,
  vesting: vestingAddress,
  mint: mintAddress,
  beneficiaryTokenAccount: beneficiaryTokenAddress,
  tokenProgram: TOKEN_2022_PROGRAM_ID,
  clock: SYSVAR_CLOCK_PUBKEY,
}).rpc();
``` 