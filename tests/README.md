# VCoin Test Suite

This directory contains comprehensive test suites for the VCoin (VCN) token implementation. Testing is a critical component of audit preparation and ensures the reliability and security of the token.

## Test Structure

The test suite is organized as follows:

- `unit/` - Unit tests for individual functions and components
  - `vesting-coverage.spec.js` - Enhanced branch coverage for vesting.ts
  - `utils-coverage.spec.js` - Specialized tests for utilities branch coverage
- `integration/` - Tests for interactions between components
- `e2e/` - End-to-end tests simulating real-world scenarios
- `security/` - Specific tests targeting security concerns
- `fixtures/` - Test data and fixtures
- `mocks/` - Mock objects for testing

## Test Categories

### Unit Tests

- **Token Creation Tests** (`token.test.ts`)
  - Test token initialization parameters
  - Verify mint authority setup
  - Test metadata creation

- **Token Allocation Tests** (`allocation.test.ts`)
  - Verify correct distribution of tokens
  - Test allocation to various wallets
  - Verify allocation history

- **Presale Tests** (`presale.test.ts`)
  - Test presale start/end logic
  - Verify price calculations
  - Test buyer allocation logic
  - Verify presale cap enforcement

- **Vesting Tests** (`vesting.test.ts`, `vesting-coverage.spec.js`)
  - Test vesting schedule implementation
  - Verify time-based releases
  - Test vesting authorization
  - Complete branch coverage for error conditions and edge cases
  - Mock implementation for file system operations
  - Test uncovered execution paths

- **Utility Tests** (`utils.test.ts`, `utils-coverage.spec.js`)
  - Test helper functions
  - Verify token conversion calculations
  - Test keypair management functions
  - Branch coverage for error handling paths
  - Test boundary conditions and edge cases

### Integration Tests

- **Allocation Workflow Tests** (`allocation-workflow.test.ts`)
  - Test end-to-end allocation process
  - Verify cross-component interactions

- **Presale Workflow Tests** (`presale-workflow.test.ts`)
  - Test complete presale lifecycle
  - Verify interaction with token allocation

- **Vesting Workflow Tests** (`vesting-workflow.test.ts`)
  - Test complete vesting lifecycle
  - Verify interaction with token allocation

### Security Tests

- **Authentication Tests** (`auth.test.ts`)
  - Test access controls
  - Verify signature verification

- **Input Validation Tests** (`validation.test.ts`)
  - Test handling of invalid inputs
  - Verify boundary conditions

- **Error Handling Tests** (`error.test.ts`)
  - Test error recovery scenarios
  - Verify graceful failure modes

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm test -- --coverage

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:security

# Run specific test file
npm test -- --testPathPattern=token.test.ts

# Run specific coverage-focused tests
npm test -- --testPathPattern=vesting-coverage.spec.js
```

## Test Coverage

Code coverage reports are generated automatically when running tests and can be found in the `coverage/` directory. We maintain a minimum coverage threshold of 80% for all code.

### Current Coverage Metrics
- Statement coverage: 94.22%
- Branch coverage: 81.1% (previously 77.41%)
- Function coverage: 95.55%
- Line coverage: 94.72%

### Coverage Improvements
Recent test enhancements have specifically targeted branch coverage:
- `vesting.ts`: Improved from 71.87% to 81.25% branch coverage
- Added dedicated coverage tests targeting uncovered execution paths
- Implemented comprehensive mocking for file system and Solana operations
- Enhanced error condition testing for all modules

## Writing New Tests

When adding new features or modifying existing ones, follow these guidelines for writing tests:

1. Create unit tests for all new functions
2. Update integration tests if component interactions change
3. Consider security implications and add specific tests for them
4. Ensure tests cover both happy path and error scenarios
5. Document the purpose of each test case
6. Focus on branch coverage for conditional logic
7. Use mocking for external dependencies

## Testing Approach

Our testing approach includes:

1. **Comprehensive Unit Testing**: Testing individual functions in isolation
2. **Branch Coverage Focus**: Targeting conditional branches with specific tests
3. **Mocking External Dependencies**: Using Jest mocks for file system, web3, and other dependencies
4. **Edge Case Testing**: Deliberately testing boundary conditions and error paths
5. **Security-Focused Tests**: Specific tests for security-critical components

## Pre-Audit Test Checklist

Before submitting for audit, ensure:

- [x] All tests pass with 100% success rate
- [x] Code coverage meets minimum thresholds (80% branch coverage)
- [x] Edge cases and error scenarios are tested
- [x] Security-specific tests are included
- [x] Performance tests pass acceptable thresholds
- [x] Mock implementations accurately represent production behavior
- [x] Test coverage focuses on high-risk areas
- [x] Test suite is documented and maintainable 