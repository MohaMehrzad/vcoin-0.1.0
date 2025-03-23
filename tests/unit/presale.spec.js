const fs = require('fs');
const path = require('path');

// Mock Solana modules
jest.mock('@solana/spl-token', () => ({
  TOKEN_2022_PROGRAM_ID: 'token-2022-program-id',
  createAssociatedTokenAccountIdempotent: jest.fn().mockResolvedValue('mock-token-account'),
  transfer: jest.fn().mockResolvedValue('mock-transfer-signature'),
}));

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn().mockResolvedValue(5 * 1000000000), // 5 SOL
  })),
  Keypair: {
    generate: jest.fn().mockReturnValue({
      publicKey: { toBase58: () => 'mock-public-key' },
      secretKey: new Uint8Array(32).fill(1),
    }),
    fromSecretKey: jest.fn().mockReturnValue({
      publicKey: { toBase58: () => 'mock-public-key' },
      secretKey: new Uint8Array(32).fill(1),
    }),
  },
  PublicKey: jest.fn().mockImplementation((key) => ({
    toBase58: () => key,
    toString: () => key,
  })),
  LAMPORTS_PER_SOL: 1000000000,
}));

// Mock fs operations with a centralized data store to simulate the file system
const mockFileSystem = {
  'presale-data.json': JSON.stringify({
    participants: [],
    totalTokensSold: 0,
    totalUsdRaised: 0,
    isActive: false,
  }),
  'token-metadata.json': JSON.stringify({
    mintAddress: 'mock-mint-address',
    allocations: {
      presale: {
        wallet: 'presale-wallet-address',
        tokenAccount: 'presale-token-account',
      },
    },
  }),
};

jest.mock('fs', () => ({
  existsSync: jest.fn().mockImplementation(filePath => {
    return Object.keys(mockFileSystem).some(file => filePath.includes(file)) || filePath.includes('keypairs');
  }),
  readFileSync: jest.fn().mockImplementation((filePath, encoding) => {
    for (const file of Object.keys(mockFileSystem)) {
      if (filePath.includes(file)) {
        return mockFileSystem[file];
      }
    }
    if (filePath.includes('keypairs')) {
      return JSON.stringify(Array.from(new Uint8Array(64).fill(1)));
    }
    return '{}';
  }),
  writeFileSync: jest.fn().mockImplementation((filePath, data, options) => {
    for (const file of Object.keys(mockFileSystem)) {
      if (filePath.includes(file)) {
        mockFileSystem[file] = data;
        return;
      }
    }
  }),
  mkdirSync: jest.fn(),
}));

jest.mock('path', () => ({
  resolve: jest.fn().mockImplementation((_, ...args) => args.join('/')),
  dirname: jest.fn().mockImplementation((path) => {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '.';
  }),
}));

// Mock utils module
jest.mock('../../src/utils', () => ({
  getConnection: jest.fn().mockReturnValue({
    getBalance: jest.fn().mockResolvedValue(5 * 1000000000),
  }),
  getOrCreateKeypair: jest.fn(() => ({
    publicKey: { toBase58: () => 'mock-public-key' },
    secretKey: new Uint8Array(32).fill(1),
  })),
  loadTokenMetadata: jest.fn(() => ({
    mintAddress: 'mock-mint-address',
    allocations: {
      presale: {
        wallet: 'presale-wallet-address',
        tokenAccount: 'presale-token-account',
      },
    },
  })),
  PRESALE_START_DATE: new Date('2025-04-01'),
  PRESALE_END_DATE: new Date('2025-09-30'),
  PRESALE_PRICE_USD: 0.1,
}));

// Mock the Date for deterministic testing
const mockDate = new Date('2025-06-01T12:00:00Z'); // During the presale period
global.Date = class extends Date {
  constructor(...args) {
    if (args.length) {
      return super(...args);
    }
    return mockDate;
  }
  
  static now() {
    return mockDate.getTime();
  }
};

// Prevent process.exit from ending the tests
const originalExit = process.exit;
process.exit = jest.fn();

// Import the actual presale module directly (it won't run main because we're overriding require.main)
jest.mock('../../src/presale', () => {
  // Get the actual module (this will import the real functions)
  const actualModule = jest.requireActual('../../src/presale');
  
  // Return all the exported functions
  return {
    ...actualModule,
    // We need to properly handle the process.argv in main
    main: jest.fn().mockImplementation((args) => {
      // Save original argv
      const originalArgv = process.argv;
      
      try {
        // Set process.argv to include our args
        process.argv = ['node', 'presale.js', ...(args || [])];
        
        // Call the actual main function
        return actualModule.main();
      } finally {
        // Restore original argv
        process.argv = originalArgv;
      }
    })
  };
});

const presaleModule = require('../../src/presale');

// Test the functions with our mocked modules
describe('Presale Module (Real Implementation)', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset presale data to initial state
    mockFileSystem['presale-data.json'] = JSON.stringify({
      participants: [],
      totalTokensSold: 0,
      totalUsdRaised: 0,
      isActive: false,
    });
    
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log');
    consoleErrorSpy = jest.spyOn(console, 'error');
  });
  
  afterEach(() => {
    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
  
  afterAll(() => {
    // Restore process.exit
    process.exit = originalExit;
  });
  
  test('loadPresaleData should return presale data', () => {
    const data = presaleModule.loadPresaleData();
    expect(data).toEqual({
      participants: [],
      totalTokensSold: 0,
      totalUsdRaised: 0,
      isActive: false,
    });
  });
  
  test('savePresaleData should update presale data', () => {
    const newData = {
      participants: [],
      totalTokensSold: 100,
      totalUsdRaised: 10,
      isActive: true,
    };
    
    presaleModule.savePresaleData(newData);
    expect(JSON.parse(mockFileSystem['presale-data.json'])).toEqual(newData);
  });
  
  test('isPresaleActive should check date against presale window', () => {
    // Our mock date is set to 2025-06-01 which is within the presale window
    expect(presaleModule.isPresaleActive()).toBe(true);
  });
  
  test('calculateTokensForUsd should convert USD to tokens', () => {
    // If PRESALE_PRICE_USD is 0.1, then 10 USD should be 100 tokens
    expect(presaleModule.calculateTokensForUsd(10)).toBe(100);
  });
  
  test('startPresale should activate the presale', async () => {
    await presaleModule.startPresale();
    
    // Verify presale data was updated
    expect(consoleLogSpy).toHaveBeenCalledWith('Presale has been started successfully!');
    
    // Check that presale data was updated
    const presaleData = JSON.parse(mockFileSystem['presale-data.json']);
    expect(presaleData.isActive).toBe(true);
  });
  
  test('startPresale should not activate if already active', async () => {
    // Set presale as already active
    mockFileSystem['presale-data.json'] = JSON.stringify({
      participants: [],
      totalTokensSold: 0,
      totalUsdRaised: 0,
      isActive: true,
    });
    
    await presaleModule.startPresale();
    
    // Verify appropriate message was shown
    expect(consoleLogSpy).toHaveBeenCalledWith('Presale is already active.');
  });
  
  test('endPresale should end the presale', async () => {
    // Set presale as active first
    mockFileSystem['presale-data.json'] = JSON.stringify({
      participants: [],
      totalTokensSold: 100,
      totalUsdRaised: 10,
      isActive: true,
    });
    
    await presaleModule.endPresale();
    
    // Verify presale data was updated
    expect(consoleLogSpy).toHaveBeenCalledWith('Presale has been ended.');
    
    // Check that the presale data was updated
    const presaleData = JSON.parse(mockFileSystem['presale-data.json']);
    expect(presaleData.isActive).toBe(false);
  });
  
  test('endPresale should handle inactive presale', async () => {
    // Ensure presale is inactive
    mockFileSystem['presale-data.json'] = JSON.stringify({
      participants: [],
      totalTokensSold: 0,
      totalUsdRaised: 0,
      isActive: false,
    });
    
    await presaleModule.endPresale();
    
    // Verify appropriate message was shown
    expect(consoleLogSpy).toHaveBeenCalledWith('Presale is not active.');
  });
  
  test('processPurchase should process a valid purchase', async () => {
    // Set presale as active first
    mockFileSystem['presale-data.json'] = JSON.stringify({
      participants: [],
      totalTokensSold: 0,
      totalUsdRaised: 0,
      isActive: true,
    });
    
    const buyerAddress = 'buyer-address';
    const usdAmount = 10;
    
    await presaleModule.processPurchase(buyerAddress, usdAmount);
    
    // Verify tokens were transferred
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Transferring'));
    expect(consoleLogSpy).toHaveBeenCalledWith('Purchase processed successfully!');
    
    // Check that presale data was updated
    const presaleData = JSON.parse(mockFileSystem['presale-data.json']);
    expect(presaleData.participants.length).toBe(1);
    expect(presaleData.totalTokensSold).toBe(100); // 10 USD at 0.1 USD per token
    expect(presaleData.totalUsdRaised).toBe(10);
  });
  
  test('processPurchase should throw error when presale is not active', async () => {
    // Ensure presale is inactive
    mockFileSystem['presale-data.json'] = JSON.stringify({
      participants: [],
      totalTokensSold: 0,
      totalUsdRaised: 0,
      isActive: false,
    });
    
    await expect(presaleModule.processPurchase('buyer-address', 10)).rejects.toThrow('Presale is not active');
  });
  
  test('checkPresaleStatus should display presale status', () => {
    presaleModule.checkPresaleStatus();
    
    // Check console output
    expect(consoleLogSpy).toHaveBeenCalledWith('===== VCoin Presale Status =====');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Status:'));
  });
  
  test('main should handle start command', async () => {
    await presaleModule.main(['start']);
    
    // Check that presale was started
    const presaleData = JSON.parse(mockFileSystem['presale-data.json']);
    expect(presaleData.isActive).toBe(true);
  });
  
  test('main should handle end command', async () => {
    // Set presale as active first
    mockFileSystem['presale-data.json'] = JSON.stringify({
      participants: [],
      totalTokensSold: 100,
      totalUsdRaised: 10,
      isActive: true,
    });
    
    await presaleModule.main(['end']);
    
    // Check that presale was ended
    const presaleData = JSON.parse(mockFileSystem['presale-data.json']);
    expect(presaleData.isActive).toBe(false);
  });
  
  test('main should handle buy command', async () => {
    // Set presale as active first
    mockFileSystem['presale-data.json'] = JSON.stringify({
      participants: [],
      totalTokensSold: 0,
      totalUsdRaised: 0,
      isActive: true,
    });
    
    await presaleModule.main(['buy', 'buyer-address', '10']);
    
    // Check that purchase was processed
    const presaleData = JSON.parse(mockFileSystem['presale-data.json']);
    expect(presaleData.participants.length).toBe(1);
    expect(presaleData.totalTokensSold).toBe(100);
  });
  
  test('main should handle status command', async () => {
    await presaleModule.main(['status']);
    
    // Check console output
    expect(consoleLogSpy).toHaveBeenCalledWith('===== VCoin Presale Status =====');
  });
  
  test('main should show usage for invalid buy command', async () => {
    await presaleModule.main(['buy']);
    
    // Check console output
    expect(consoleErrorSpy).toHaveBeenCalledWith('Usage: npm run presale buy <buyer_address> <usd_amount>');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
  
  test('main should handle unknown commands', async () => {
    await presaleModule.main(['unknown']);
    
    // Check console output for available commands
    expect(consoleLogSpy).toHaveBeenCalledWith('Available commands:');
  });
  
  test('main should handle errors gracefully', async () => {
    // Force an error by making a dependency undefined
    const originalLoadTokenMetadata = require('../../src/utils').loadTokenMetadata;
    require('../../src/utils').loadTokenMetadata = jest.fn().mockImplementation(() => {
      throw new Error('Test error');
    });
    
    try {
      await presaleModule.main(['buy', 'buyer-address', '10']);
      
      // Should have logged error and exited
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(1);
    } finally {
      // Restore the original implementation
      require('../../src/utils').loadTokenMetadata = originalLoadTokenMetadata;
    }
  });
}); 