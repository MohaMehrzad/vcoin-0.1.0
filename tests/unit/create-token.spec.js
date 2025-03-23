// Set NODE_ENV to test to ensure errors are thrown instead of calling process.exit
process.env.NODE_ENV = 'test';

// Save original process.exit
const originalExit = process.exit;

// Mock process.exit to prevent tests from exiting
const mockExit = jest.fn();
process.exit = mockExit;

// Mock the required dependencies
jest.mock('@solana/web3.js', () => {
  return {
    Connection: jest.fn().mockImplementation(() => ({
      getBalance: jest.fn().mockResolvedValue(1000000000),
      requestAirdrop: jest.fn().mockResolvedValue('airdrop-signature'),
      confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } })
    })),
    Keypair: {
      generate: jest.fn().mockReturnValue({
        publicKey: {
          toBase58: jest.fn().mockReturnValue('mocked-public-key'),
          toString: jest.fn().mockReturnValue('mocked-public-key-string'),
          toBuffer: jest.fn().mockReturnValue(Buffer.from('mocked-public-key-buffer'))
        },
        secretKey: new Uint8Array(32).fill(1)
      }),
      fromSecretKey: jest.fn().mockImplementation((secretKey) => ({
        publicKey: {
          toBase58: jest.fn().mockReturnValue('mocked-public-key-from-secret'),
          toString: jest.fn().mockReturnValue('mocked-public-key-string-from-secret'),
          toBuffer: jest.fn().mockReturnValue(Buffer.from('mocked-public-key-buffer'))
        },
        secretKey
      }))
    },
    clusterApiUrl: jest.fn().mockReturnValue('https://api.devnet.solana.com'),
    PublicKey: jest.fn().mockImplementation((key) => ({
      toBase58: jest.fn().mockReturnValue(typeof key === 'string' ? key : 'mocked-public-key'),
      toString: jest.fn().mockReturnValue(typeof key === 'string' ? key : 'mocked-public-key-string'),
      toBuffer: jest.fn().mockReturnValue(Buffer.from('mocked-public-key-buffer'))
    })),
    LAMPORTS_PER_SOL: 1000000000
  };
});

jest.mock('@solana/spl-token', () => {
  return {
    TOKEN_2022_PROGRAM_ID: {
      toString: jest.fn().mockReturnValue('Token2022ProgramId')
    },
    createMint: jest.fn().mockResolvedValue({
      toString: jest.fn().mockReturnValue('mocked-token-mint')
    }),
    createAssociatedTokenAccountIdempotent: jest.fn().mockResolvedValue({
      toString: jest.fn().mockReturnValue('mocked-token-account')
    }),
    mintTo: jest.fn().mockResolvedValue('mocked-mint-signature'),
    ExtensionType: {}
  };
});

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    readFileSync: jest.fn().mockImplementation((path) => {
      if (path.includes('keypair.json')) {
        return JSON.stringify([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
      }
      return '{}';
    }),
    writeFileSync: jest.fn(),
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn()
  };
});

jest.mock('path', () => {
  const actualPath = jest.requireActual('path');
  return {
    ...actualPath,
    resolve: jest.fn().mockImplementation((...args) => args.join('/'))
  };
});

jest.mock('readline', () => {
  return {
    createInterface: jest.fn().mockReturnValue({
      question: jest.fn().mockImplementation((query, callback) => {
        callback('1'); // Choose option 1 by default
      }),
      close: jest.fn()
    })
  };
});

jest.mock('bs58', () => {
  return {
    encode: jest.fn().mockReturnValue('encoded-string'),
    decode: jest.fn().mockReturnValue(new Uint8Array(32).fill(1))
  };
});

// Mock the utils
jest.mock('../../src/utils', () => {
  return {
    getConnection: jest.fn().mockReturnValue({
      getBalance: jest.fn().mockResolvedValue(1000000000),
      requestAirdrop: jest.fn().mockResolvedValue('airdrop-signature'),
      confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } })
    }),
    getOrCreateKeypair: jest.fn().mockReturnValue({
      publicKey: {
        toBase58: jest.fn().mockReturnValue('mocked-public-key'),
        toString: jest.fn().mockReturnValue('mocked-public-key-string'),
        toBuffer: jest.fn().mockReturnValue(Buffer.from('mocked-public-key-buffer'))
      },
      secretKey: new Uint8Array(32).fill(1)
    }),
    TOKEN_NAME: 'VCoin',
    TOKEN_SYMBOL: 'VCN',
    TOKEN_DECIMALS: 6,
    TOKEN_TOTAL_SUPPLY: 1000000000,
    tokensToRawAmount: jest.fn().mockReturnValue('1000000000000'),
    saveTokenMetadata: jest.fn(),
    displayBalance: jest.fn(),
    sleep: jest.fn().mockResolvedValue(undefined),
    LAMPORTS_PER_SOL: 1000000000
  };
});

// Import directly from the source file in src directory
const { getKeypairFromPhantom, createVCoinToken, handleError } = require('../../src/create-token');

describe('Create Token Functions', () => {
  // Save original console methods and process.argv
  const originalConsole = { ...console };
  const originalArgv = process.argv;
  
  beforeEach(() => {
    // Setup console mocks
    console.log = jest.fn();
    console.error = jest.fn();
    
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset process.argv for each test
    process.argv = [...originalArgv];
  });
  
  afterEach(() => {
    // Restore console methods
    console.log = originalConsole.log;
    console.error = originalConsole.error;
  });
  
  afterAll(() => {
    // Restore process.exit after all tests
    process.exit = originalExit;
    delete process.env.NODE_ENV;
  });

  describe('getKeypairFromPhantom', () => {
    test('should use existing keypair when user chooses option 1', async () => {
      // Setup for existing keypair
      const fs = require('fs');
      fs.existsSync.mockReturnValue(true);
      
      const utils = require('../../src/utils');
      
      // Run the function
      const result = await getKeypairFromPhantom();
      
      // Verify the expected calls
      expect(fs.existsSync).toHaveBeenCalled();
      expect(utils.getOrCreateKeypair).toHaveBeenCalledWith('authority');
      expect(result).toBeDefined();
    });
    
    test('should create new keypair from private key when user chooses option 2', async () => {
      // Setup for existing keypair but choosing option 2
      const fs = require('fs');
      fs.existsSync.mockReturnValue(true);
      
      const readline = require('readline');
      const rlInstance = {
        question: jest.fn(),
        close: jest.fn()
      };
      
      // First question: choose option 2
      // Second question: provide private key
      rlInstance.question
        .mockImplementationOnce((query, callback) => callback('2'))
        .mockImplementationOnce((query, callback) => callback('private-key'));
        
      readline.createInterface.mockReturnValue(rlInstance);
      
      const bs58 = require('bs58');
      const web3 = require('@solana/web3.js');
      
      // Run the function
      const result = await getKeypairFromPhantom();
      
      // Verify the expected calls
      expect(fs.existsSync).toHaveBeenCalled();
      expect(rlInstance.question).toHaveBeenCalledTimes(2);
      expect(bs58.decode).toHaveBeenCalledWith('private-key');
      expect(web3.Keypair.fromSecretKey).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
    
    test('should handle errors when creating keypair', async () => {
      // Setup for error scenario
      const fs = require('fs');
      fs.existsSync.mockReturnValue(false);
      
      const readline = require('readline');
      const rlInstance = {
        question: jest.fn().mockImplementationOnce((query, callback) => callback('invalid-key')),
        close: jest.fn()
      };
      readline.createInterface.mockReturnValue(rlInstance);
      
      const bs58 = require('bs58');
      bs58.decode.mockImplementationOnce(() => {
        throw new Error('Invalid base58 string');
      });
      
      // Run the function and expect it to throw an error
      await expect(getKeypairFromPhantom()).rejects.toThrow();
      
      // Verify the expected calls
      expect(console.error).toHaveBeenCalled();
    });

    test('should create keypair when file does not exist (covers line 39)', async () => {
      // Setup for non-existing keypair
      const fs = require('fs');
      fs.existsSync.mockReturnValue(false);
      
      const readline = require('readline');
      const rlInstance = {
        question: jest.fn().mockImplementationOnce((query, callback) => callback('valid-key')),
        close: jest.fn()
      };
      readline.createInterface.mockReturnValue(rlInstance);
      
      // Run the function
      const result = await getKeypairFromPhantom();
      
      // Verify the expected calls
      expect(fs.existsSync).toHaveBeenCalled();
      // This test should now hit line 39 of the file since we're bypassing the "file exists" branch
      expect(rlInstance.question).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });
    
    test('should handle case where keypair dir does not exist', async () => {
      // Setup for non-existing keypair directory
      const fs = require('fs');
      fs.existsSync.mockReturnValueOnce(false); // For keypair file
      fs.existsSync.mockReturnValueOnce(false); // For keypair directory
      
      const readline = require('readline');
      const rlInstance = {
        question: jest.fn().mockImplementationOnce((query, callback) => callback('valid-key')),
        close: jest.fn()
      };
      readline.createInterface.mockReturnValue(rlInstance);
      
      // Run the function
      const result = await getKeypairFromPhantom();
      
      // Verify the expected calls
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    test('should handle case where keypair doesn\'t exist but directory exists', async () => {
      // Setup for non-existing keypair but existing directory
      const fs = require('fs');
      fs.existsSync.mockReturnValueOnce(false); // Keypair file doesn't exist
      fs.existsSync.mockReturnValueOnce(true);  // Directory exists
      
      const readline = require('readline');
      const rlInstance = {
        question: jest.fn().mockImplementationOnce((query, callback) => callback('valid-key')),
        close: jest.fn()
      };
      readline.createInterface.mockReturnValue(rlInstance);
      
      // Run the function
      const result = await getKeypairFromPhantom();
      
      // Verify the expected calls
      expect(fs.existsSync).toHaveBeenCalledTimes(2); // Called for file and directory
      expect(fs.mkdirSync).not.toHaveBeenCalled(); // Directory already exists
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('createVCoinToken', () => {
    test('should create token with existing keypair flag', async () => {
      // Set up process.argv to include --use-existing flag
      process.argv.push('--use-existing');
      
      const utils = require('../../src/utils');
      const splToken = require('@solana/spl-token');
      
      // Run the function
      const result = await createVCoinToken();
      
      // Verify the function was called with correct parameters
      expect(utils.getOrCreateKeypair).toHaveBeenCalled();
      expect(utils.getConnection).toHaveBeenCalled();
      expect(splToken.createMint).toHaveBeenCalled();
      expect(splToken.createAssociatedTokenAccountIdempotent).toHaveBeenCalled();
      expect(splToken.mintTo).toHaveBeenCalled();
      expect(utils.saveTokenMetadata).toHaveBeenCalled();
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result.mint).toBeDefined();
      expect(result.authorityKeypair).toBeDefined();
      expect(result.authorityTokenAccount).toBeDefined();
      expect(result.tokenData).toBeDefined();
    });

    test('should create token without existing keypair flag (use getKeypairFromPhantom)', async () => {
      // Setup mock for getKeypairFromPhantom
      const readline = require('readline');
      const rlInstance = {
        question: jest.fn().mockImplementationOnce((query, callback) => callback('valid-key')),
        close: jest.fn()
      };
      readline.createInterface.mockReturnValue(rlInstance);
      
      const utils = require('../../src/utils');
      const splToken = require('@solana/spl-token');
      
      // Run the function without --use-existing flag
      const result = await createVCoinToken();
      
      // Verify getOrCreateKeypair was not called, but getKeypairFromPhantom was used
      expect(utils.getOrCreateKeypair).not.toHaveBeenCalled();
      expect(splToken.createMint).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
    
    test('should handle insufficient balance error', async () => {
      // Set up process.argv to include --use-existing flag to avoid getKeypairFromPhantom
      process.argv.push('--use-existing');
      
      // Mock insufficient balance
      const utils = require('../../src/utils');
      const connection = {
        getBalance: jest.fn().mockResolvedValue(10000), // Very low balance
        requestAirdrop: jest.fn().mockResolvedValue('airdrop-signature'),
        confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } })
      };
      utils.getConnection.mockReturnValue(connection);
      
      // Run the function and expect it to throw an error
      await expect(createVCoinToken({ skipBalanceCheck: false })).rejects.toThrow();
      
      // Verify error handling
      expect(console.error).toHaveBeenCalled();
    });

    test('should skip balance check when skipBalanceCheck is true (covers line 94)', async () => {
      // Set up process.argv to include --use-existing flag to avoid getKeypairFromPhantom
      process.argv.push('--use-existing');
      
      // Mock low balance that would normally trigger an error
      const utils = require('../../src/utils');
      const connection = {
        getBalance: jest.fn().mockResolvedValue(10000), // Very low balance
        requestAirdrop: jest.fn().mockResolvedValue('airdrop-signature'),
        confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } })
      };
      utils.getConnection.mockReturnValue(connection);
      
      const splToken = require('@solana/spl-token');
      
      // Run the function with skipBalanceCheck set to true
      const result = await createVCoinToken({ skipBalanceCheck: true });
      
      // Verify balance check was skipped and token creation continued
      expect(connection.getBalance).toHaveBeenCalled();
      expect(splToken.createMint).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
    
    test('should handle token creation errors', async () => {
      // Set up process.argv to include --use-existing flag to avoid getKeypairFromPhantom
      process.argv.push('--use-existing');
      
      const splToken = require('@solana/spl-token');
      splToken.createMint.mockRejectedValue(new Error('Token creation failed'));
      
      // Run the function and expect it to throw an error
      await expect(createVCoinToken({ skipBalanceCheck: true })).rejects.toThrow();
      
      // Verify error handling
      expect(console.error).toHaveBeenCalled();
    });

    test('should handle error with Error object (covers line 127)', async () => {
      // Set up process.argv to include --use-existing flag to avoid getKeypairFromPhantom
      process.argv.push('--use-existing');
      
      const splToken = require('@solana/spl-token');
      splToken.createMint.mockRejectedValue(new Error('Error with message'));
      
      // Run the function and expect it to throw an error
      await expect(createVCoinToken({ skipBalanceCheck: true })).rejects.toThrow('Error with message');
      
      // Verify error handling
      expect(console.error).toHaveBeenCalled();
    });
    
    test('should handle undefined error (covers branch in line 127)', async () => {
      // Set up process.argv to include --use-existing flag to avoid getKeypairFromPhantom
      process.argv.push('--use-existing');
      
      const splToken = require('@solana/spl-token');
      splToken.createMint.mockImplementation(() => {
        return Promise.reject(undefined);
      });
      
      // Run the function and expect it to throw an error with default message
      await expect(createVCoinToken({ skipBalanceCheck: true })).rejects.toThrow('\nError creating token:');
      
      // Verify error handling
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('handleError', () => {
    // Save current NODE_ENV
    const originalNodeEnv = process.env.NODE_ENV;
    
    beforeEach(() => {
      // Reset NODE_ENV before each test
      process.env.NODE_ENV = originalNodeEnv;
      jest.clearAllMocks();
    });
    
    test('should throw error in test environment', () => {
      process.env.NODE_ENV = 'test';
      
      const errorMsg = 'Test error message';
      const error = new Error('Test error');
      
      expect(() => handleError(errorMsg, error)).toThrow(error);
      expect(console.error).toHaveBeenCalledWith(errorMsg, error);
      expect(mockExit).not.toHaveBeenCalled();
    });
    
    test('should throw new error when error is not provided', () => {
      process.env.NODE_ENV = 'test';
      
      const errorMsg = 'Test error message';
      
      expect(() => handleError(errorMsg)).toThrow(errorMsg);
      expect(console.error).toHaveBeenCalledWith(errorMsg, undefined);
      expect(mockExit).not.toHaveBeenCalled();
    });
    
    test('should call process.exit(1) in non-test environment', () => {
      // Set NODE_ENV to something other than 'test'
      process.env.NODE_ENV = 'production';
      
      const errorMsg = 'Production error message';
      
      // Call the function
      handleError(errorMsg, null);
      
      // Verify process.exit was called
      expect(console.error).toHaveBeenCalledWith(errorMsg, null);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
}); 