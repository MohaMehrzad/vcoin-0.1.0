const fs = require('fs');

// Mock process.exit
const originalExit = process.exit;
process.exit = jest.fn();

// Mock the Solana modules
jest.mock('@solana/spl-token', () => ({
  TOKEN_2022_PROGRAM_ID: 'mocked-token-program-id',
  createAssociatedTokenAccountIdempotent: jest.fn().mockResolvedValue('mocked-token-account'),
  transfer: jest.fn().mockResolvedValue('mocked-transaction-signature'),
}));

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn(),
  Keypair: jest.fn().mockImplementation(() => ({
    publicKey: { toString: () => 'mocked-public-key' },
  })),
  PublicKey: jest.fn().mockImplementation((key) => ({
    toString: () => key,
  })),
}));

// Mock the file system
const mockVestingData = {
  releases: [],
  totalReleased: 0,
  nextReleaseDate: null,
  initialized: false
};

const mockPresaleData = {
  startTime: '2025-03-05T00:00:00.000Z',
  endTime: '2025-08-31T00:00:00.000Z',
  isActive: false,
  pricePerToken: 0.1,
  totalTokensSold: 0,
  totalUsdRaised: 0,
  participants: []
};

// Create a mock file system
const mockFs = {
  'vesting-data.json': JSON.stringify(mockVestingData),
  'presale-data.json': JSON.stringify(mockPresaleData)
};

// Mock fs module
jest.mock('fs', () => {
  return {
    existsSync: jest.fn((filePath) => {
      const fileName = filePath.split('/').pop();
      return mockFs[fileName] !== undefined;
    }),
    readFileSync: jest.fn((filePath, encoding) => {
      const fileName = filePath.split('/').pop();
      return mockFs[fileName] || '{}';
    }),
    writeFileSync: jest.fn((filePath, data, encoding) => {
      const fileName = filePath.split('/').pop();
      mockFs[fileName] = data;
    })
  };
});

// Mock path module
jest.mock('path', () => ({
  resolve: jest.fn((cwd, fileName) => fileName),
  basename: jest.fn((filePath) => filePath.split('/').pop())
}));

// Mock utils
jest.mock('../../src/utils', () => ({
  getConnection: jest.fn().mockReturnValue({}),
  getOrCreateKeypair: jest.fn().mockImplementation((name) => ({
    publicKey: { toString: () => `mocked-${name}-public-key` },
  })),
  loadTokenMetadata: jest.fn().mockReturnValue({
    mintAddress: 'mocked-mint-address',
    allocations: {
      vesting: {
        wallet: 'mocked-vesting-wallet',
        tokenAccount: 'mocked-vesting-token-account'
      }
    }
  }),
  tokensToRawAmount: jest.fn().mockImplementation((amount) => BigInt(amount) * BigInt(1000000)),
  VESTING_RELEASE_AMOUNT: 50000000,
  VESTING_RELEASE_INTERVAL_MONTHS: 3
}));

// Mock Date
const RealDate = global.Date;
const mockDate = new Date('2025-09-01T00:00:00.000Z'); // After presale end date
global.Date = jest.fn(() => mockDate);
global.Date.now = jest.fn(() => mockDate.getTime());
global.Date.prototype = RealDate.prototype;

// Import the actual vesting module
const {
  loadVestingData,
  saveVestingData,
  initializeVesting,
  executeRelease,
  checkVestingStatus,
  main
} = require('../../src/vesting');

// Mock console.log and console.error
let consoleOutput = [];
const originalLog = console.log;
const originalError = console.error;

beforeEach(() => {
  consoleOutput = [];
  console.log = jest.fn((...args) => {
    consoleOutput.push(args.join(' '));
  });
  console.error = jest.fn((...args) => {
    consoleOutput.push(args.join(' '));
  });
  
  // Reset mock data before each test
  mockFs['vesting-data.json'] = JSON.stringify({
    releases: [],
    totalReleased: 0,
    nextReleaseDate: null,
    initialized: false
  });
  
  mockFs['presale-data.json'] = JSON.stringify({
    startTime: '2025-03-05T00:00:00.000Z',
    endTime: '2025-08-31T00:00:00.000Z',
    isActive: false,
    pricePerToken: 0.1,
    totalTokensSold: 0,
    totalUsdRaised: 0,
    participants: []
  });
  
  // Reset mocks
  jest.clearAllMocks();
  
  // Make sure fs.existsSync returns true for presale-data.json by default
  fs.existsSync.mockImplementation((filePath) => {
    const fileName = filePath.split('/').pop();
    return mockFs[fileName] !== undefined;
  });
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
});

afterAll(() => {
  global.Date = RealDate;
  process.exit = originalExit;
});

describe('Vesting Module', () => {
  describe('loadVestingData', () => {
    it('should load vesting data from file', () => {
      const testData = {
        releases: [{ releaseNumber: 1, amount: '50000000' }],
        totalReleased: 0,
        nextReleaseDate: '2025-09-01T00:00:00.000Z',
        initialized: true
      };
      mockFs['vesting-data.json'] = JSON.stringify(testData);
      
      const result = loadVestingData();
      expect(result).toEqual(testData);
      expect(fs.readFileSync).toHaveBeenCalled();
    });
    
    it('should return default data if file does not exist', () => {
      fs.existsSync.mockReturnValueOnce(false);
      
      const result = loadVestingData();
      expect(result).toEqual({
        releases: [],
        totalReleased: 0,
        nextReleaseDate: null,
        initialized: false
      });
    });
  });
  
  describe('saveVestingData', () => {
    it('should save vesting data to file', () => {
      const testData = {
        releases: [{ releaseNumber: 1, amount: '50000000' }],
        totalReleased: 0,
        nextReleaseDate: '2025-09-01T00:00:00.000Z',
        initialized: true
      };
      
      saveVestingData(testData);
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(JSON.parse(mockFs['vesting-data.json'])).toEqual(testData);
    });
  });
  
  describe('initializeVesting', () => {
    it('should set up vesting schedule', async () => {
      const result = await initializeVesting();
      
      expect(result.initialized).toBe(true);
      expect(result.releases.length).toBe(7);
      expect(result.releases[0].amount).toBe('50000000');
      expect(result.nextReleaseDate).toBe(result.releases[0].scheduledDate);
      expect(consoleOutput).toContain('Vesting schedule initialized successfully.');
    });
    
    it('should not initialize if already initialized', async () => {
      mockFs['vesting-data.json'] = JSON.stringify({
        releases: [{ releaseNumber: 1, amount: '50000000' }],
        totalReleased: 0,
        nextReleaseDate: '2025-09-01T00:00:00.000Z',
        initialized: true
      });
      
      const result = await initializeVesting();
      expect(result.initialized).toBe(true);
      expect(consoleOutput).toContain('Vesting schedule already initialized.');
    });
    
    it('should throw error if presale data not found', async () => {
      fs.existsSync.mockImplementation((filePath) => {
        const fileName = filePath.split('/').pop();
        return fileName !== 'presale-data.json';
      });
      
      await expect(initializeVesting()).rejects.toThrow('Presale data not found');
    });
    
    it('should throw error if presale has not ended', async () => {
      mockFs['presale-data.json'] = JSON.stringify({
        startTime: '2025-03-05T00:00:00.000Z',
        isActive: true,
        endTime: null
      });
      
      await expect(initializeVesting()).rejects.toThrow('Presale has not ended yet');
    });
  });
  
  describe('executeVestingRelease', () => {
    beforeEach(async () => {
      // Initialize vesting first
      await initializeVesting();
    });
    
    it('should execute a vesting release', async () => {
      await executeRelease(1);
      
      const vestingData = JSON.parse(mockFs['vesting-data.json']);
      expect(vestingData.releases[0].executed).toBe(true);
      expect(vestingData.releases[0].transactionId).toBe('mocked-transaction-signature');
      expect(vestingData.totalReleased).toBe(50000000);
      expect(consoleOutput.some(log => log.includes('Release #1 executed successfully'))).toBe(true);
    });
    
    it('should not execute an already released vesting', async () => {
      // Execute first release
      await executeRelease(1);
      consoleOutput = []; // Clear console output
      
      // Try to execute it again
      await executeRelease(1);
      
      expect(consoleOutput.some(log => log.includes('has already been executed'))).toBe(true);
    });
    
    it('should throw error for invalid release number', async () => {
      await expect(executeRelease(10)).rejects.toThrow('Invalid release number');
    });
    
    it('should update next release date after execution', async () => {
      await executeRelease(1);
      
      const vestingData = JSON.parse(mockFs['vesting-data.json']);
      expect(vestingData.nextReleaseDate).toBe(vestingData.releases[1].scheduledDate);
    });
  });
  
  describe('checkVestingStatus', () => {
    it('should display vesting status when initialized', async () => {
      await initializeVesting();
      consoleOutput = []; // Clear console output
      
      checkVestingStatus();
      
      expect(consoleOutput.some(log => log.includes('VCoin Vesting Status'))).toBe(true);
      expect(consoleOutput.some(log => log.includes('Initialized: true'))).toBe(true);
      expect(consoleOutput.some(log => log.includes('Release Schedule:'))).toBe(true);
    });
    
    it('should handle uninitialized vesting', () => {
      checkVestingStatus();
      
      expect(consoleOutput.some(log => log.includes('Vesting schedule has not been initialized yet'))).toBe(true);
    });
  });
  
  describe('main function', () => {
    let originalArgv;
    
    beforeEach(() => {
      originalArgv = process.argv;
    });
    
    afterEach(() => {
      process.argv = originalArgv;
    });
    
    it('should handle init command', async () => {
      process.argv = ['node', 'vesting.js', 'init'];
      await main();
      
      const vestingData = JSON.parse(mockFs['vesting-data.json']);
      expect(vestingData.initialized).toBe(true);
      expect(consoleOutput.some(log => log.includes('Vesting schedule initialized successfully'))).toBe(true);
    });
    
    it('should handle release command', async () => {
      // Initialize first
      await initializeVesting();
      consoleOutput = []; // Clear console output
      
      process.argv = ['node', 'vesting.js', 'release', '1'];
      await main();
      
      const vestingData = JSON.parse(mockFs['vesting-data.json']);
      expect(vestingData.releases[0].executed).toBe(true);
      expect(consoleOutput.some(log => log.includes('Release #1 executed successfully'))).toBe(true);
    });
    
    it('should handle status command', async () => {
      await initializeVesting();
      consoleOutput = []; // Clear console output
      
      process.argv = ['node', 'vesting.js', 'status'];
      await main();
      
      expect(consoleOutput.some(log => log.includes('VCoin Vesting Status'))).toBe(true);
    });
    
    it('should show usage for invalid command', async () => {
      process.argv = ['node', 'vesting.js', 'invalid'];
      await main();
      
      expect(consoleOutput.some(log => log.includes('Available commands:'))).toBe(true);
    });
    
    it('should show usage for missing release index', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
      
      process.argv = ['node', 'vesting.js', 'release'];
      await main();
      
      expect(consoleOutput.some(log => log.includes('Usage: npm run vesting release'))).toBe(true);
      expect(mockExit).toHaveBeenCalledWith(1);
      
      mockExit.mockRestore();
    });
  });
}); 