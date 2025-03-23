/**
 * Global Jest setup file
 * 
 * This file extends the Jest global object with additional functionality
 * needed for our tests.
 */

// Add setTimeout to jest global object for TypeScript compatibility
if (typeof jest !== 'undefined') {
  // @ts-ignore - Extend jest object to add setTimeout
  jest.setTimeout = (timeout: number) => {
    // @ts-ignore - We know this doesn't exist on the type but it works at runtime
    jest.testTimeout = timeout;
  };
}

// Set a longer timeout for Solana tests
jest.setTimeout(60000); // 60 seconds

// Configure environment for tests
process.env.SOLANA_NETWORK = 'devnet';
process.env.NODE_ENV = 'test';

// We use the actual @solana-program/token-2022 package
import { PublicKey } from '@solana/web3.js';
import * as token2022 from '@solana-program/token-2022';

// Set token address constants that tests will need
export const TOKEN_2022_PROGRAM_ID = new PublicKey(token2022.TOKEN_2022_PROGRAM_ADDRESS);

// Don't mock implementation - let tests use the real functionality
// This ensures our code is production-ready 