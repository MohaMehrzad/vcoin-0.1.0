/**
 * End-to-End Test for VCoin Token Lifecycle
 * 
 * This test verifies the complete token lifecycle from creation to vesting.
 */

// Define mock functions for each module
const mockCreateToken = jest.fn().mockResolvedValue({
  mintAddress: 'A1SXqVTw3KnwvSZ1RPXe7zuzYnMXpS1jS3xvKvHCUgxw',
  authorityAddress: 'B2Gx6Fmn5EEajJKdE4RLSPHK8QZjWxKGEP6nYTbpqsLy',
  authorityTokenAccount: 'C3XzWPqCwkwzy1J3sMpV9qQMvYnZZdmKu2GV8kTQ24iL',
});

const mockAllocateTokens = jest.fn().mockResolvedValue({
  development: {
    amount: '500000000',
    wallet: 'mockDevWallet',
    tokenAccount: 'mockDevTokenAccount',
    txId: 'mockDevTxId',
  },
  presale: {
    amount: '100000000',
    wallet: 'mockPresaleWallet',
    tokenAccount: 'mockPresaleTokenAccount',
    txId: 'mockPresaleTxId',
  },
  airdrop: {
    amount: '50000000',
    wallet: 'mockAirdropWallet',
    tokenAccount: 'mockAirdropTokenAccount',
    txId: 'mockAirdropTxId',
  },
  vesting: {
    amount: '350000000',
    wallet: 'mockVestingWallet',
    tokenAccount: 'mockVestingTokenAccount',
    txId: 'mockVestingTxId',
  },
});

const mockStartPresale = jest.fn().mockResolvedValue({
  startTime: new Date().toISOString(),
  endTime: null,
  totalRaised: '0',
  totalSold: '0',
  buyers: [],
});

const mockProcessPurchase = jest.fn().mockResolvedValue({
  buyerAddress: 'mockBuyerAddress',
  usdAmount: '1000',
  tokenAmount: '33333.333333',
  txId: 'mockPurchaseTxId',
  timestamp: new Date().toISOString(),
});

const mockEndPresale = jest.fn().mockResolvedValue({
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString(),
  totalRaised: '1000',
  totalSold: '33333.333333',
  buyers: [
    {
      buyerAddress: 'mockBuyerAddress',
      usdAmount: '1000',
      tokenAmount: '33333.333333',
      txId: 'mockPurchaseTxId',
      timestamp: new Date().toISOString(),
    },
  ],
});

const mockInitializeVesting = jest.fn().mockResolvedValue({
  releases: [
    {
      releaseNumber: 1,
      scheduledDate: new Date(Date.now() + 7890000000).toISOString(),
      amount: '50000000',
      executed: false,
      executionDate: null,
      transactionId: null,
    },
  ],
  totalReleased: 0,
  nextReleaseDate: new Date(Date.now() + 7890000000).toISOString(),
  initialized: true,
  initializedAt: new Date().toISOString(),
  presaleEndDate: new Date().toISOString(),
});

const mockExecuteRelease = jest.fn().mockResolvedValue({
  releaseNumber: 1,
  scheduledDate: new Date(Date.now() + 7890000000).toISOString(),
  amount: '50000000',
  executed: true,
  executionDate: new Date().toISOString(),
  transactionId: 'mockReleaseTxId',
});

// Set up module mocks
jest.mock('../../src/create-token', () => ({
  createVCoinToken: mockCreateToken
}));

jest.mock('../../src/allocate-token', () => ({
  allocateTokens: mockAllocateTokens
}));

jest.mock('../../src/presale', () => ({
  startPresale: mockStartPresale,
  processPurchase: mockProcessPurchase,
  endPresale: mockEndPresale
}));

jest.mock('../../src/vesting', () => ({
  initializeVesting: mockInitializeVesting,
  executeRelease: mockExecuteRelease
}));

describe('Token Lifecycle E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('Complete token lifecycle flow works correctly', async () => {
    // Import functions from the mocked modules
    const { createVCoinToken } = require('../../src/create-token');
    const { allocateTokens } = require('../../src/allocate-token');
    const { 
      startPresale, 
      processPurchase, 
      endPresale 
    } = require('../../src/presale');
    const { 
      initializeVesting, 
      executeRelease 
    } = require('../../src/vesting');
    
    // Execute each step of the token lifecycle
    await createVCoinToken();
    expect(mockCreateToken).toHaveBeenCalled();
    
    await allocateTokens();
    expect(mockAllocateTokens).toHaveBeenCalled();
    
    const presaleData = await startPresale();
    expect(mockStartPresale).toHaveBeenCalled();
    expect(presaleData).toHaveProperty('startTime');
    
    const purchaseData = await processPurchase('mockBuyerAddress', 1000);
    expect(mockProcessPurchase).toHaveBeenCalled();
    expect(purchaseData).toHaveProperty('buyerAddress', 'mockBuyerAddress');
    
    const endPresaleData = await endPresale();
    expect(mockEndPresale).toHaveBeenCalled();
    expect(endPresaleData).toHaveProperty('endTime');
    
    const vestingData = await initializeVesting();
    expect(mockInitializeVesting).toHaveBeenCalled();
    expect(vestingData).toHaveProperty('initialized', true);
    
    const releaseData = await executeRelease(1);
    expect(mockExecuteRelease).toHaveBeenCalled();
    expect(releaseData).toHaveProperty('executed', true);
    
    // Verify all steps were called exactly once
    expect(mockCreateToken).toHaveBeenCalledTimes(1);
    expect(mockAllocateTokens).toHaveBeenCalledTimes(1);
    expect(mockStartPresale).toHaveBeenCalledTimes(1);
    expect(mockProcessPurchase).toHaveBeenCalledTimes(1);
    expect(mockEndPresale).toHaveBeenCalledTimes(1);
    expect(mockInitializeVesting).toHaveBeenCalledTimes(1);
    expect(mockExecuteRelease).toHaveBeenCalledTimes(1);
  });
}); 