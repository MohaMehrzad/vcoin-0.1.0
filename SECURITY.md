# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities to [security@vcoin.example.com](mailto:security@vcoin.example.com). 
Do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.

Please include the following information (if applicable):
- Type of issue
- Full paths of source file(s) related to the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

## Known Security Issues

### Rust Dependency Issues

The VCoin project has several dependencies with security notices that we are actively monitoring. Many of these are transitive dependencies used by the Solana SDK and cannot be directly upgraded by our project. These include:

- **Unmaintained dependencies:**
  - `derivative` 2.2.0 - Used by Solana's cryptographic libraries
  - `paste` 1.0.15 - Used by Solana's cryptographic libraries
  - `proc-macro-error` 1.0.4 - Used by Solana's runtime
  - `ring` 0.16.20 - Used by Solana's cryptographic libraries

- **Potentially unsound implementations:**
  - `borsh` 0.9.3 - Has an unsoundness issue when parsing zero-sized types
  - `atty` 0.2.14 - Has a potential unaligned read issue
  - `ouroboros` 0.15.6 - Has an unsoundness issue in its implementation

- **Compiler Warnings:**
  - The Solana `entrypoint!` macro generates several cfg warnings related to attributes `custom-heap`, `solana`, and `custom-panic`
  - These warnings are internal to Solana's macro implementations and cannot be fixed by our code
  - They don't affect the security or functionality of the contract and are documented in our .auditignore file

These issues are being tracked in our `.auditignore` file and will be resolved as Solana updates their SDK dependencies. None of these issues directly impact the security of the VCoin contract implementation, as they are all in transitive dependencies and the specific unsoundness conditions are not triggered by our code.

### TypeScript Issues

The TypeScript client code has several issues that are in the process of being fixed:

- **Extensive use of `any` types** - Makes the code less type-safe and more prone to runtime errors
- **Unused error handlers** - Could allow errors to go undetected
- **Unused imports and variables** - Increases bundle size and makes code harder to maintain

## Audit Status

This project is preparing for a formal security audit with the following steps:

1. ✅ Updated dependencies to use compatible versions
2. ✅ Restructured Rust code to improve maintainability
3. ✅ Documented known security issues that cannot be immediately fixed
4. ⏳ Addressing TypeScript code quality issues

## Security Measures

The VCoin token contract implements the following security measures:

- **Transfer fee configuration** - Enables transfer fees with configurable parameters
- **Presale functionality** - Allows for a secure token distribution process
- **Vesting schedules** - Prevents token dumping through time-locked vesting
- **Authority controls** - Restricts sensitive operations to authorized addresses
- **Metadata control** - Prevents metadata tampering

## Best Practices

When using this codebase:

1. Ensure all token operations go through proper authority checks
2. Validate parameters in all public-facing functions
3. Use the TypeScript client with proper error handling
4. Keep private keys secure and never commit them to source control 