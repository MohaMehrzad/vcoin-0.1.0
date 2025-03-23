# VCoin - Solidproof Audit Guide

## Project Overview

VCoin (VCN) is a Solana Token-2022 implementation with presale and vesting functionality. The project consists of a Rust smart contract and TypeScript client code.

## Key Components

### Smart Contract (Primary Audit Focus)

The Rust smart contract is located in the `/program` directory:

- `/program/src/processor.rs` - Main instruction handling
- `/program/src/state.rs` - Data structure definitions and state management
- `/program/src/vesting.rs` - Vesting implementation logic
- `/program/src/presale.rs` - Presale management logic
- `/program/src/entrypoint.rs` - Program entry point
- `/program/src/error.rs` - Error definitions
- `/program/src/instruction.rs` - Instruction definitions

### TypeScript Client Code

The TypeScript client code is in the `/src` directory:

- `/src/token2022-client.ts` - Client for interacting with SPL Token-2022
- `/src/presale.ts` - Presale client implementation
- `/src/vesting.ts` - Vesting client implementation
- `/src/utils.ts` - Utility functions and helpers

## Build Instructions

To build the Rust smart contract:

```bash
cd program
cargo build
```

To build the TypeScript client:

```bash
npm install
npm run build
```

## Security Considerations

1. **Authority Management**: The contract implements strict authority controls for mint, update, and fee operations.

2. **Input Validation**: All public functions validate inputs to prevent security issues.

3. **Error Handling**: Comprehensive error handling is implemented throughout the codebase.

4. **Overflow Protection**: The code includes checks to prevent arithmetic overflows.

5. **Reentrancy Protection**: The contract includes measures to prevent reentrancy attacks.

## Known Issues

1. The Rust code generates warnings related to Solana's internal macros but these do not affect functionality.

2. Some TypeScript tests may fail in the test environment but this doesn't affect the core smart contract functionality.

## Audit Focus Areas

We recommend focusing on:

1. Token allocation logic and security
2. Vesting implementation
3. Presale security and fund management
4. Authority control mechanisms
5. Validation of numeric operations

## Contact

For any questions during the audit process, please contact:

- Security Team: security@vcoin-example.com
- Lead Developer: developer@vcoin-example.com 