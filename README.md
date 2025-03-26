# VCoin (VCN) - Solana Token-2022 Platform

<p align="center">
  <img src="https://via.placeholder.com/200x200?text=VCoin" alt="VCoin Logo" width="200" height="200">
</p>

<p align="center">
  A comprehensive token platform built on Solana using the Token-2022 protocol.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#development">Development</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#security">Security</a> •
  <a href="#license">License</a>
</p>

## Features

VCoin provides an all-in-one solution for creating and managing tokens on the Solana blockchain using the powerful Token-2022 program:

- **Token-2022 Integration**: Full support for Solana's next-generation token program
- **Built-in Transfer Fees**: Configure and collect transfer fees on token transactions
- **Custom Metadata Management**: Create and update token metadata through a custom implementation
- **Presale Management**: Handle the entire presale process with configurable parameters
- **Vesting Schedule**: Manage token vesting schedules for team, investors, and partners
- **Authority Controls**: Role-based permissions and authority transfer functionality

## Architecture

VCoin consists of two main components:

### Smart Contract (Program)

The on-chain program is written in Rust and handles all token operations:

```
program/
├── src/                  # Smart contract source files
│   ├── lib.rs            # Main entry point for the program
│   ├── entrypoint.rs     # Contract entrypoint
│   ├── instruction.rs    # Instruction definitions
│   ├── processor.rs      # Instruction processing logic
│   ├── state.rs          # On-chain data structures
│   └── error.rs          # Error definitions
├── Cargo.toml            # Rust dependencies
└── tests/                # Program tests
```

### Client Application

The off-chain client is written in TypeScript and provides a user-friendly interface:

```
src/
├── create-token.ts       # Token creation functionality
├── presale.ts            # Presale management
├── vesting.ts            # Vesting schedule management
├── update-metadata.ts    # Token metadata update functionality
├── allocate-token.ts     # Token allocation functionality
├── authority-controls.ts # Authority management
├── upgrade-governance.ts # Governance functionality
├── token2022-client.ts   # Token-2022 specific client
└── utils.ts              # Shared utilities
```

## Installation

### Prerequisites

- [Solana CLI](https://docs.solanalabs.com/cli/install) v1.16.23 or later
- [Node.js](https://nodejs.org/) v16 or later
- [Rust](https://www.rust-lang.org/tools/install) and Cargo

### Setup

1. **Clone the repository:**

```bash
git clone https://github.com/yourusername/vcoin.git
cd vcoin
```

2. **Install dependencies:**

```bash
npm install
```

3. **Configure environment:**

```bash
cp .env.example .env
# Edit .env with your settings
```

## Usage

### Create a Token with Token-2022

Create a new SPL Token-2022 token with metadata and transfer fees:

```bash
npm run create-token
```

This interactive process will:
- Generate or use an existing keypair for token authority
- Configure token name, symbol, and decimals
- Set initial supply and metadata URI
- Configure transfer fees (basis points and maximum fee amount)
- Create the token on the Solana blockchain using the Token-2022 program

### Configure Transfer Fees

Set or update transfer fees for your token:

```bash
npm run authority -- --set-transfer-fee
```

You can configure:
- Fee basis points (e.g., 100 = 1%)
- Maximum fee amount
- Fee authority (who can change fees)
- Withdraw authority (who can withdraw collected fees)

### Run a Presale

Set up and manage a token presale:

```bash
npm run presale
```

Configure parameters including:
- Token price
- Presale timeframe (start and end dates)
- Hard cap and soft cap
- Minimum and maximum purchase amounts

### Manage Vesting

Create and manage token vesting schedules:

```bash
npm run vesting
```

Features include:
- Configure vesting start time
- Set release interval and number of releases
- Add multiple beneficiaries
- Release vested tokens according to schedule

### Update Token Metadata

Modify token information:

```bash
npm run update-metadata
```

Update:
- Token name
- Token symbol
- Metadata URI

### Manage Authorities

Control token permissions:

```bash
npm run authority
```

Functions:
- Transfer token authority
- Set fee authority
- Manage multisig authorities

### Secure Configuration Management

VCoin uses a secure configuration management system to protect critical settings:

```bash
# Initialize authority configuration
npm run authority:init

# Check configuration integrity and version
npm run authority:check

# Upgrade configuration to latest version
npm run authority:upgrade

# Create secure backup of configuration
npm run authority:backup
```

Key security features:
- **Mandatory signature verification**: All configuration files are cryptographically signed
- **Version control**: Configuration files include version tracking for safe upgrades
- **Production safeguards**: Enhanced security checks in production environments
- **Backup mechanism**: Securely create and restore configuration backups
- **Role-based access**: Configuration changes require proper authority verification

## Development

### Local Development

1. **Start a local Solana validator:**

```bash
solana-test-validator
```

2. **Configure for local development:**

```bash
solana config set --url localhost
```

3. **Build the program:**

```bash
cd program
cargo build
```

4. **Deploy locally:**

```bash
solana program deploy target/deploy/vcoin_program.so
```

5. **Run client in development mode:**

```bash
cd ..
npm run start
```

### Testing

Run the test suites:

```bash
# Run all tests
npm run test:all

# Run specific test suites
npm run test:unit       # Unit tests
npm run test:integration # Integration tests
npm run test:security   # Security-focused tests
npm run test:e2e        # End-to-end tests

# Run program tests
cd program
cargo test
```

## Deployment

### Devnet Deployment

For testing in a live environment:

```bash
# Configure for Devnet
solana config set --url devnet

# Ensure you have SOL for deployment
solana balance

# Airdrop if needed
solana airdrop 1

# Build and deploy
cd program
cargo build --release
solana program deploy target/release/libvcoin_program.so
```

### Mainnet Deployment

For production deployment:

```bash
# Configure for Mainnet
solana config set --url mainnet-beta

# Verify you have SOL for deployment
solana balance

# Build and deploy
cd program
cargo build --release
solana program deploy target/release/libvcoin_program.so
```

Alternatively, use the deployment script:

```bash
node deployment/deploy_local.js
```

## Program Instructions

### Token-2022 Specific Instructions

| Instruction | Description | Required Accounts |
|-------------|-------------|-------------------|
| `InitializeToken` | Creates a new SPL Token-2022 with metadata and transfer fee | Authority, Mint, TokenProgram, SystemProgram, Rent, Metadata |
| `SetTransferFee` | Updates token transfer fee configuration | Authority, Mint, TokenProgram |

### Other Instructions

| Instruction | Description | Required Accounts |
|-------------|-------------|-------------------|
| `InitializePresale` | Sets up a token presale | Authority, PresaleState, Mint, Treasury, SystemProgram, Rent |
| `BuyTokens` | Purchases tokens during presale | Buyer, PresaleState, Mint, BuyerATA, Authority, TokenProgram, SystemProgram, Treasury, Clock |
| `InitializeVesting` | Creates a vesting schedule | Authority, VestingState, Mint, SystemProgram, Rent |
| `AddVestingBeneficiary` | Adds vesting recipient | Authority, VestingState |
| `ReleaseVestedTokens` | Releases tokens per schedule | Authority, VestingState, Mint, BeneficiaryATA, TokenProgram, Clock |
| `UpdateTokenMetadata` | Updates token metadata | Authority, Metadata, Mint, TokenProgram |
| `EndPresale` | Finalizes a presale | Authority, PresaleState |

## Security

### Best Practices

- Never share private keys or seed phrases
- Always review transactions before signing
- Use hardware wallets for production deployments
- Follow the principle of least privilege for authorities
- Test thoroughly on Devnet before Mainnet deployment

### Security Features

- **Authority Controls**: Separate authorities for different operations (mint, freeze, transfer fee)
- **Input Validation**: Bounds checking on all numeric inputs
- **Arithmetic Safety**: Checked math operations to prevent overflows
- **Access Control**: Account ownership verification and signature requirements
- **Token-2022 Security**: Leveraging the robust security features of the Token-2022 program

## Technical Specifications

- **Solana Program Version**: 1.16.23
- **SPL Token-2022 Version**: 0.9.0
- **Borsh Version**: 0.10.3
- **Programming Languages**: Rust (program), TypeScript (client)
- **Testing Frameworks**: Rust unit tests, Jest for client tests

## Project Status

VCoin is actively developed with ongoing improvements and feature additions. Core functionality is implemented and tested, including Token-2022 integration with transfer fees, presale management, vesting schedules, metadata updates, and authority controls.

## Future Enhancements

1. Enhanced governance mechanisms
2. Staking functionality
3. Integration with additional DeFi protocols
4. Mobile wallet support
5. Analytics dashboard for token metrics

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Solana Labs for the Solana blockchain platform
- The SPL Token-2022 program developers
- All contributors to this project

---

**Program ID:** 9ZskGH6R3iVYPeQMf1XiANgDZQHNMUvZgAC8Xxxj7zae

**Contact:** [Your Contact Information]

# VCoin - Production Deployment Guide

This README provides instructions for deploying and running VCoin in a production environment.

## Production Deployment Requirements

1. **Node.js**: Version 16.x or higher
2. **Solana CLI**: Latest stable version
3. **Environment**: A secure Linux server with proper firewall configuration
4. **Network**: Production deployment should target Solana mainnet-beta
5. **Hardware**: Recommended minimum 4GB RAM, 2 CPU cores, 50GB SSD

## Security Configuration

### Environment Variables

Create a `.env` file with the following required configuration:

```
# Network Configuration
SOLANA_NETWORK=mainnet-beta
NODE_ENV=production

# Security Configuration 
KEYPAIR_PASSWORD=your-secure-password-minimum-16-chars

# Authority-specific passwords (optional but recommended for multiple keypairs)
KEYPAIR_PASSWORD_AUTHORITY=your-secure-authority-password
KEYPAIR_PASSWORD_PRESALE=your-secure-presale-password
KEYPAIR_PASSWORD_VESTING=your-secure-vesting-password
```

### File Permissions

Ensure proper file permissions:

```bash
# Secure the .env file
chmod 600 .env

# Secure the keypairs directory
chmod 700 keypairs
```

## Production Deployment

### 1. Install Dependencies

```bash
npm install --production
```

### 2. Build the Application

```bash
npm run build
```

### 3. Initialize Authority Configuration

```bash
npm run authority:init
```

### 4. Token Creation (if needed)

```bash
npm run create-token
```

### 5. Token Allocation (if needed)

```bash
npm run allocate-token
```

## Running in Production

All scripts are configured to run in production mode by default. For example:

```bash
# Start the main application
npm start

# Run presale operations
npm run presale [command]

# Manage authority
npm run authority [command]

# Manage upgrade governance
npm run upgrade [command]
```

## Backup Procedures

Regularly back up your configuration files and keypairs:

```bash
# Back up authority configuration
npm run authority:backup

# Back up upgrade governance (manually)
cp upgrade-governance.json upgrade-governance.backup-$(date +%Y%m%d).json
```

## Security Best Practices

1. **Keypair Security**: Never expose your keypair files. They should be securely encrypted.
2. **Regular Audits**: Check audit logs regularly to detect unauthorized operations.
3. **Permission Controls**: Ensure all files maintain secure permissions.
4. **Multi-Signature**: Use multi-signature operations for critical actions.
5. **Monitoring**: Implement monitoring for critical operations.

## Troubleshooting Production Issues

If you encounter issues in production:

1. Check log files for errors
2. Verify environment variables are correctly set
3. Ensure file permissions are secure
4. Validate signature verification is working correctly
5. Confirm network connectivity to Solana

## Contact

For production support, contact:
- Email: support@vcoin-example.com
- Security team: security@vcoin-example.com 