import * as fs from 'fs';
import * as path from 'path';
import { TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, TOKEN_TOTAL_SUPPLY } from '../../src/utils';

// Mock the fs and path modules
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

jest.mock('path', () => ({
  resolve: jest.fn().mockImplementation((...args) => args.join('/')),
}));

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

// We need to mock the imported constants before importing the module
jest.mock('../../src/utils', () => ({
  TOKEN_NAME: 'VCoin',
  TOKEN_SYMBOL: 'VCN',
  TOKEN_DECIMALS: 6,
  TOKEN_TOTAL_SUPPLY: 1000000000,
}));

// Create sample mock data for our tests
const mockTokenMetadata = {
  mintAddress: 'mock-mint-address',
  allocations: {
    development: { amount: 500000000 },
    presale: { amount: 100000000 },
    airdrop: { amount: 50000000 },
    vesting: { amount: 350000000 }
  }
};

const mockPresaleData = {
  isActive: true,
  totalTokensSold: 50000000,
  totalUsdRaised: 1500000
};

const mockVestingData = {
  initialized: true,
  totalReleased: 87500000,
  nextReleaseDate: '2025-12-01T00:00:00.000Z'
};

describe('Index Module Tests', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Information Display', () => {
    test('displays basic token information', () => {
      // Mock that no metadata files exist
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      // Import and execute the module
      require('../../src/index');
      
      // Check that console.log was called with basic token info
      expect(mockConsoleLog).toHaveBeenCalledWith(`Total Supply: ${TOKEN_TOTAL_SUPPLY} ${TOKEN_SYMBOL}`);
      expect(mockConsoleLog).toHaveBeenCalledWith(`Decimals: ${TOKEN_DECIMALS}`);
      expect(mockConsoleLog).toHaveBeenCalledWith('Protocol: Token-2022 (Solana)');
      expect(mockConsoleLog).toHaveBeenCalledWith('Token Status: Not Created');
    });

    test('displays token metadata when file exists', () => {
      // Setup the mocks to simulate token metadata existence
      (fs.existsSync as jest.Mock).mockImplementation((path) => {
        return path.includes('token-metadata.json');
      });
      
      (fs.readFileSync as jest.Mock).mockImplementation((path) => {
        if (path.includes('token-metadata.json')) {
          return JSON.stringify(mockTokenMetadata);
        }
        return '';
      });
      
      // Import and execute the module
      jest.isolateModules(() => {
        require('../../src/index');
      });
      
      // Check that console.log was called with token metadata
      expect(mockConsoleLog).toHaveBeenCalledWith('Token Status: Created');
      expect(mockConsoleLog).toHaveBeenCalledWith(`Mint Address: ${mockTokenMetadata.mintAddress}`);
      expect(mockConsoleLog).toHaveBeenCalledWith('\nToken Allocations:');
      expect(mockConsoleLog).toHaveBeenCalledWith(`Development: ${mockTokenMetadata.allocations.development.amount} ${TOKEN_SYMBOL}`);
    });

    test('displays presale data when file exists', () => {
      // Setup the mocks to simulate presale data existence
      (fs.existsSync as jest.Mock).mockImplementation((path) => {
        return path.includes('presale-data.json');
      });
      
      (fs.readFileSync as jest.Mock).mockImplementation((path) => {
        if (path.includes('presale-data.json')) {
          return JSON.stringify(mockPresaleData);
        }
        return '';
      });
      
      // Import and execute the module
      jest.isolateModules(() => {
        require('../../src/index');
      });
      
      // Check that console.log was called with presale data
      expect(mockConsoleLog).toHaveBeenCalledWith('\nPresale Status:');
      expect(mockConsoleLog).toHaveBeenCalledWith(`Active: Yes`);
      expect(mockConsoleLog).toHaveBeenCalledWith(`Tokens Sold: ${mockPresaleData.totalTokensSold} ${TOKEN_SYMBOL}`);
      expect(mockConsoleLog).toHaveBeenCalledWith(`USD Raised: $${mockPresaleData.totalUsdRaised}`);
    });

    test('displays vesting data when file exists', () => {
      // Setup the mocks to simulate vesting data existence
      (fs.existsSync as jest.Mock).mockImplementation((path) => {
        return path.includes('vesting-data.json');
      });
      
      (fs.readFileSync as jest.Mock).mockImplementation((path) => {
        if (path.includes('vesting-data.json')) {
          return JSON.stringify(mockVestingData);
        }
        return '';
      });
      
      // Import and execute the module
      jest.isolateModules(() => {
        require('../../src/index');
      });
      
      // Check that console.log was called with vesting data
      expect(mockConsoleLog).toHaveBeenCalledWith('\nVesting Status:');
      expect(mockConsoleLog).toHaveBeenCalledWith(`Initialized: Yes`);
      expect(mockConsoleLog).toHaveBeenCalledWith(`Tokens Released: ${mockVestingData.totalReleased} ${TOKEN_SYMBOL}`);
      
      // Check for next release date display
      const expectedDate = new Date(mockVestingData.nextReleaseDate).toLocaleDateString();
      expect(mockConsoleLog).toHaveBeenCalledWith(`Next Release: ${expectedDate}`);
    });

    test('displays all data when all files exist', () => {
      // Setup the mocks to simulate all data exists
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      (fs.readFileSync as jest.Mock).mockImplementation((path) => {
        if (path.includes('token-metadata.json')) {
          return JSON.stringify(mockTokenMetadata);
        } else if (path.includes('presale-data.json')) {
          return JSON.stringify(mockPresaleData);
        } else if (path.includes('vesting-data.json')) {
          return JSON.stringify(mockVestingData);
        }
        return '';
      });
      
      // Import and execute the module
      jest.isolateModules(() => {
        require('../../src/index');
      });
      
      // Check that console.log was called with all data
      expect(mockConsoleLog).toHaveBeenCalledWith('Token Status: Created');
      expect(mockConsoleLog).toHaveBeenCalledWith(`Mint Address: ${mockTokenMetadata.mintAddress}`);
      expect(mockConsoleLog).toHaveBeenCalledWith('\nPresale Status:');
      expect(mockConsoleLog).toHaveBeenCalledWith('\nVesting Status:');
    });
  });

  describe('Usage Instructions', () => {
    test('displays all available commands', () => {
      // Reset mocks to ensure clean state
      jest.clearAllMocks();
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      // Import and execute the module in isolation
      jest.isolateModules(() => {
        require('../../src/index');
      });
      
      // Check that console.log was called with usage instructions
      expect(mockConsoleLog).toHaveBeenCalledWith('\n=========================================');
      expect(mockConsoleLog).toHaveBeenCalledWith('VCoin Management System - Usage Instructions');
      
      // Check for token creation commands
      expect(mockConsoleLog).toHaveBeenCalledWith('1. Token Creation:');
      expect(mockConsoleLog).toHaveBeenCalledWith('   npm run create-token');
      
      // Check for token allocation commands
      expect(mockConsoleLog).toHaveBeenCalledWith('\n2. Token Allocation:');
      expect(mockConsoleLog).toHaveBeenCalledWith('   npm run allocate-token');
      
      // Check for presale management commands
      expect(mockConsoleLog).toHaveBeenCalledWith('\n3. Presale Management:');
      expect(mockConsoleLog).toHaveBeenCalledWith('   npm run presale start');
      expect(mockConsoleLog).toHaveBeenCalledWith('   npm run presale buy <buyer_address> <usd_amount>');
      
      // Check for vesting management commands
      expect(mockConsoleLog).toHaveBeenCalledWith('\n4. Vesting Management:');
      expect(mockConsoleLog).toHaveBeenCalledWith('   npm run vesting init');
      expect(mockConsoleLog).toHaveBeenCalledWith('   npm run vesting execute <release_number>');
    });
  });
}); 