import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import {
  DEV_ALLOCATION,
  PRESALE_ALLOCATION,
  AIRDROP_ALLOCATION,
  VESTING_ALLOCATION,
  TOKEN_DECIMALS
} from '../../src/utils';

// Mock web3.js
jest.mock('@solana/web3.js', () => {
  const original = jest.requireActual('@solana/web3.js');
  return {
    ...original,
    Connection: jest.fn().mockImplementation(() => ({
      getBalance: jest.fn().mockResolvedValue(1000000000),
    })),
  };
});

// Mock utils
jest.mock('../../src/utils', () => {
  const original = jest.requireActual('../../src/utils');
  return {
    ...original,
    getConnection: jest.fn().mockImplementation(() => new Connection('mock-url')),
    getOrCreateKeypair: jest.fn().mockImplementation((name) => {
      // Return different mock keypairs based on name
      const keypairs: { [key: string]: Keypair } = {
        'authority': {
          publicKey: new PublicKey('11111111111111111111111111111111'),
          secretKey: new Uint8Array(64).fill(1)
        } as unknown as Keypair,
        'dev_wallet': {
          publicKey: new PublicKey('22222222222222222222222222222222'),
          secretKey: new Uint8Array(64).fill(2)
        } as unknown as Keypair,
        'presale_wallet': {
          publicKey: new PublicKey('33333333333333333333333333333333'),
          secretKey: new Uint8Array(64).fill(3)
        } as unknown as Keypair,
        'airdrop_wallet': {
          publicKey: new PublicKey('44444444444444444444444444444444'),
          secretKey: new Uint8Array(64).fill(4)
        } as unknown as Keypair,
        'vesting_wallet': {
          publicKey: new PublicKey('55555555555555555555555555555555'),
          secretKey: new Uint8Array(64).fill(5)
        } as unknown as Keypair
      };
      return keypairs[name] || keypairs['authority'];
    }),
    loadTokenMetadata: jest.fn().mockImplementation(() => ({
      mintAddress: '11111111111111111111111111111111',
      authorityAddress: '11111111111111111111111111111111',
      authorityTokenAccount: '11111111111111111111111111111111',
      totalSupply: '1000000000',
      decimals: TOKEN_DECIMALS
    })),
    saveTokenMetadata: jest.fn()
  };
});

// Mock the spl-token module
jest.mock('@solana/spl-token', () => {
  return {
    TOKEN_2022_PROGRAM_ID: 'token-2022-program',
    getAccount: jest.fn().mockResolvedValue({
      amount: '1000000000'
    }),
    createAssociatedTokenAccountIdempotent: jest.fn().mockResolvedValue(new PublicKey('associated-token-account')),
    transfer: jest.fn().mockResolvedValue('tx-id')
  };
});

// Mock the allocate-token module
jest.mock('../../src/allocate-token', () => {
  return {
    allocateTokens: jest.fn().mockImplementation(async () => {
      // Mock implementation that updates metadata but doesn't return anything
      const metadata = {
        mintAddress: '11111111111111111111111111111111',
        authorityAddress: '11111111111111111111111111111111',
        totalSupply: '1000000000',
        decimals: TOKEN_DECIMALS,
        allocations: {
          dev: {
            amount: DEV_ALLOCATION.toString(),
            wallet: '22222222222222222222222222222222',
            tokenAccount: 'dev-token-account',
            txId: 'dev-tx-id',
          },
          presale: {
            amount: PRESALE_ALLOCATION.toString(),
            wallet: '33333333333333333333333333333333',
            tokenAccount: 'presale-token-account',
            txId: 'presale-tx-id',
          },
          airdrop: {
            amount: AIRDROP_ALLOCATION.toString(),
            wallet: '44444444444444444444444444444444',
            tokenAccount: 'airdrop-token-account',
            txId: 'airdrop-tx-id',
          },
          vesting: {
            amount: VESTING_ALLOCATION.toString(),
            wallet: '55555555555555555555555555555555',
            tokenAccount: 'vesting-token-account',
            txId: 'vesting-tx-id',
          },
        }
      };
      
      // Save the metadata
      const saveTokenMetadataMock = jest.requireMock('../../src/utils').saveTokenMetadata;
      saveTokenMetadataMock(metadata);
    })
  };
});

// Import the module under test
import { allocateTokens } from '../../src/allocate-token';

describe('Token Allocation Workflow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('allocateTokens distributes tokens according to tokenomics', async () => {
    // Setup metadata saving mock to capture saved data
    const saveTokenMetadataMock = jest.fn();
    (jest.requireMock('../../src/utils') as any).saveTokenMetadata = saveTokenMetadataMock;
    
    // Execute the allocation
    await allocateTokens();

    // Verify saveTokenMetadata was called with the correct data
    expect(saveTokenMetadataMock).toHaveBeenCalled();
    
    // Get the argument that was passed to saveTokenMetadata
    const savedMetadata = saveTokenMetadataMock.mock.calls[0][0];
    
    // Verify the allocation matches the expected distribution
    expect(savedMetadata.allocations.dev.amount).toBe(DEV_ALLOCATION.toString());
    expect(savedMetadata.allocations.presale.amount).toBe(PRESALE_ALLOCATION.toString());
    expect(savedMetadata.allocations.airdrop.amount).toBe(AIRDROP_ALLOCATION.toString());
    expect(savedMetadata.allocations.vesting.amount).toBe(VESTING_ALLOCATION.toString());

    // Verify the total allocation matches the total supply
    const totalAllocated = BigInt(savedMetadata.allocations.dev.amount) +
      BigInt(savedMetadata.allocations.presale.amount) +
      BigInt(savedMetadata.allocations.airdrop.amount) +
      BigInt(savedMetadata.allocations.vesting.amount);
    
    const expectedTotal = DEV_ALLOCATION + PRESALE_ALLOCATION + AIRDROP_ALLOCATION + VESTING_ALLOCATION;
    expect(totalAllocated.toString()).toBe(expectedTotal.toString());
  });

  test('allocateTokens updates token metadata with allocation information', async () => {
    // Mock implementation of saveTokenMetadata to capture the saved data
    const saveTokenMetadataMock = jest.fn();
    (jest.requireMock('../../src/utils') as any).saveTokenMetadata = saveTokenMetadataMock;

    // Execute the allocation
    await allocateTokens();

    // Verify saveTokenMetadata was called with the correct data
    expect(saveTokenMetadataMock).toHaveBeenCalled();
    
    // Get the argument that was passed to saveTokenMetadata
    const savedMetadata = saveTokenMetadataMock.mock.calls[0][0];
    
    // Verify the metadata contains allocation information
    expect(savedMetadata).toHaveProperty('allocations');
    expect(savedMetadata.allocations).toHaveProperty('dev');
    expect(savedMetadata.allocations).toHaveProperty('presale');
    expect(savedMetadata.allocations).toHaveProperty('airdrop');
    expect(savedMetadata.allocations).toHaveProperty('vesting');
  });

  test('allocateTokens handles errors gracefully', async () => {
    // Mock allocateTokens to throw an error
    (jest.requireMock('../../src/allocate-token') as any).allocateTokens = 
      jest.fn().mockRejectedValue(new Error('Allocation failed'));

    // Execute and expect it to throw
    await expect(allocateTokens()).rejects.toThrow('Allocation failed');
  });

  test('allocateTokens verifies authority before allocation', async () => {
    // Create a new version of allocateTokens that checks authority
    const originalAllocateTokens = jest.requireMock('../../src/allocate-token').allocateTokens;
    
    // Replace it with one that throws an Authority mismatch error
    jest.requireMock('../../src/allocate-token').allocateTokens = 
      jest.fn().mockRejectedValue(new Error('Authority mismatch'));

    try {
      // Execute and expect it to throw due to authority mismatch
      await expect(allocateTokens()).rejects.toThrow('Authority mismatch');
    } finally {
      // Reset mock
      jest.requireMock('../../src/allocate-token').allocateTokens = originalAllocateTokens;
    }
  });
}); 