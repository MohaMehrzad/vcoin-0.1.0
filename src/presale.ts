import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  transfer,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import {
  getConnection,
  getOrCreateKeypair,
  loadTokenMetadata,
  tokensToRawAmount,
  rawAmountToTokens,
  verifyAuthority,
  PRESALE_PRICE_USD,
  PRESALE_START_DATE,
  PRESALE_END_DATE
} from './utils';
import axios from 'axios';

// Presale storage file
const PRESALE_DATA_PATH = path.resolve(process.cwd(), 'presale-data.json');

// Known token addresses for mainnet-beta
const TOKEN_ADDRESSES = {
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  USDT: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
};

// Supported payment methods
export type PaymentMethod = 'SOL' | 'USDC' | 'USDT';

// Replace the mock price oracle with a proper implementation
/**
 * Gets the current USD to SOL conversion rate from multiple price oracles
 * with fallback and reliability mechanisms
 * 
 * @returns {Promise<number>} The current USD to SOL rate
 * @throws {Error} If there's an error fetching the price from all sources
 */
export async function getUsdToSolRate(): Promise<number> {
  // Get price oracle selection from environment or config
  const priceOracleSource = process.env.PRICE_ORACLE_SOURCE || 'pyth';
  
  // Cache key and TTL (time to live) settings
  const cacheKey = 'sol_usd_price';
  const cacheTtlMs = 60000; // 1 minute cache
  
  // Initialize cache if needed
  const priceCache: Map<string, {price: number, timestamp: number}> = 
    global.priceCache || (global.priceCache = new Map());
  
  // Check cache first to avoid unnecessary API calls
  const cachedData = priceCache.get(cacheKey);
  if (cachedData && Date.now() - cachedData.timestamp < cacheTtlMs) {
    console.log(`Using cached SOL price: $${cachedData.price} (from cache)`);
    return cachedData.price;
  }
  
  // Fallback chain of price oracles to try in order
  const oracles = [
    priceOracleSource, 
    'pyth',
    'coinGecko',
    'binance'
  ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
  
  // Try each oracle in sequence until we get a valid price
  for (const oracle of oracles) {
    try {
      let solPriceUsd: number;
      
      switch (oracle) {
        case 'pyth': {
          // Pyth Network Oracle (most reliable for Solana)
          console.log('Fetching SOL price from Pyth Network...');
          
          try {
            // Pyth official price feed for SOL/USD on mainnet-beta
            // Price feed ID for SOL/USD on Pyth
            const solUsdPriceId = 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG';
            
            // Use the Pyth price service API (official docs: https://docs.pyth.network/documentation/pythnet-price-feeds/http-api)
            const pythEndpoint = 'https://xc-mainnet.pyth.network/api/latest_price_feeds';
            const response = await axios.get(pythEndpoint, { timeout: 5000 });
            
            if (!response.data || !Array.isArray(response.data)) {
              throw new Error('Invalid data format from Pyth Network');
            }
            
            // Find the SOL/USD price feed
            const solPriceFeed = response.data.find(
              (feed: any) => feed.id === solUsdPriceId
            );
            
            if (!solPriceFeed) {
              throw new Error('SOL/USD price feed not found in Pyth Network response');
            }
            
            // Get the price and confidence interval
            const price = solPriceFeed.price?.price;
            const conf = solPriceFeed.price?.conf || 0;
            
            if (typeof price !== 'number' || price <= 0) {
              throw new Error(`Invalid SOL price from Pyth: ${price}`);
            }
            
            // Log additional info for monitoring
            console.log(`Retrieved SOL price from Pyth: $${price} (±$${conf})`);
            console.log(`Pyth price last updated: ${new Date(solPriceFeed.price?.publish_time * 1000).toISOString()}`);
            
            solPriceUsd = price;
          } catch (error: any) {
            const pythError = error;
            console.warn(`Error with Pyth's primary endpoint: ${pythError.message || 'Unknown error'}`);
            
            // Fallback to alternative Pyth endpoint
            try {
              const fallbackEndpoint = 'https://hermes.pyth.network/v2/updates';
              console.log('Trying Pyth fallback endpoint...');
              
              const backupResponse = await axios.post(
                fallbackEndpoint,
                { ids: ['0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0013245b9e5e0695'] }, // SOL/USD on Hermes
                { timeout: 5000 }
              );
              
              if (!backupResponse.data || !backupResponse.data.data) {
                throw new Error('Invalid response from Pyth fallback endpoint');
              }
              
              // Extract and convert price (Pyth prices are scaled)
              const priceObj = backupResponse.data.data[0]?.price;
              if (!priceObj) {
                throw new Error('Price data missing in Pyth fallback response');
              }
              
              // Calculate actual price from Pyth's fixed-point representation
              const expo = priceObj.expo;
              const price = priceObj.price * Math.pow(10, expo);
              
              if (isNaN(price) || price <= 0) {
                throw new Error(`Invalid price calculation: ${price}`);
              }
              
              console.log(`Retrieved SOL price from Pyth fallback: $${price.toFixed(2)}`);
              solPriceUsd = price;
            } catch (error: any) {
              const fallbackError = error;
              // Re-throw to continue to next oracle
              throw new Error(`Both Pyth endpoints failed: ${pythError.message || 'Unknown error'}, Fallback: ${fallbackError.message || 'Unknown error'}`);
            }
          }
          break;
        }
          
        case 'coinGecko': {
          // CoinGecko API
          console.log('Fetching SOL price from CoinGecko...');
          
          const response = await axios.get(
            'https://api.coingecko.com/api/v3/simple/price',
            {
              params: {
                ids: 'solana',
                vs_currencies: 'usd'
              },
              timeout: 5000
            }
          );
          
          if (!response.data?.solana?.usd) {
            throw new Error('Invalid response from CoinGecko');
          }
          
          solPriceUsd = response.data.solana.usd;
          console.log(`Retrieved SOL price from CoinGecko: $${solPriceUsd}`);
          break;
        }
          
        case 'binance': {
          // Binance API
          console.log('Fetching SOL price from Binance...');
          
          const response = await axios.get(
            'https://api.binance.com/api/v3/ticker/price',
            {
              params: { symbol: 'SOLUSDT' },
              timeout: 5000
            }
          );
          
          if (!response.data?.price) {
            throw new Error('Invalid response from Binance');
          }
          
          solPriceUsd = parseFloat(response.data.price);
          console.log(`Retrieved SOL price from Binance: $${solPriceUsd}`);
          break;
        }
          
        default:
          throw new Error(`Unknown price oracle source: ${oracle}`);
      }
      
      // Validate price
      if (typeof solPriceUsd !== 'number' || isNaN(solPriceUsd) || solPriceUsd <= 0) {
        throw new Error(`Invalid SOL price value: ${solPriceUsd}`);
      }
      
      // Cache the valid price
      priceCache.set(cacheKey, {
        price: solPriceUsd,
        timestamp: Date.now()
      });
      
      // Return valid price
      return solPriceUsd;
    } catch (error: any) {
      console.warn(`Error getting price from ${oracle}: ${error.message}`);
      // Continue to next oracle in the chain
    }
  }
  
  // All oracles failed, check if we have a cached price that's not too old
  const cachedData2 = priceCache.get(cacheKey);
  if (cachedData2 && Date.now() - cachedData2.timestamp < 3600000) { // 1 hour
    console.warn(`Using stale cached price as last resort: $${cachedData2.price}`);
    return cachedData2.price;
  }
  
  // All oracles failed and no valid cache
  throw new Error('Failed to retrieve SOL price from all available oracles');
}

// Add a cache mechanism to prevent too frequent API calls
let cachedRates: Record<PaymentMethod, { value: number; timestamp: number } | null> = {
  SOL: null,
  USDC: null,
  USDT: null
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Gets the USD to token rate for a specific payment method
 * @param {PaymentMethod} paymentMethod - The payment method (SOL, USDC, USDT)
 * @returns {Promise<number>} The exchange rate
 */
export async function getUsdToTokenRate(paymentMethod: PaymentMethod): Promise<number> {
  const now = Date.now();

  // USDC and USDT are stablecoins pegged to USD (1:1)
  if (paymentMethod === 'USDC' || paymentMethod === 'USDT') {
    return 1.0; // 1 USDC/USDT = 1 USD
  } else if (paymentMethod === 'SOL') {
    // For SOL, use the existing price oracle implementation
    return await getUsdToSolRate();
  } else {
    throw new Error(`Unsupported payment method: ${paymentMethod}`);
  }
}

/**
 * Gets the USD to token rate with caching for a specific payment method
 * @param {PaymentMethod} paymentMethod - The payment method (SOL, USDC, USDT)
 * @returns {Promise<number>} The USD to token rate
 */
export async function getCachedRate(paymentMethod: PaymentMethod): Promise<number> {
  const now = Date.now();
  
  // Return cached value if it's still valid
  if (cachedRates[paymentMethod] && (now - cachedRates[paymentMethod]!.timestamp < CACHE_TTL)) {
    return cachedRates[paymentMethod]!.value;
  }
  
  // Otherwise fetch a new rate
  const rate = await getUsdToTokenRate(paymentMethod);
  
  // Update cache
  cachedRates[paymentMethod] = { value: rate, timestamp: now };
  
  return rate;
}

// Update the old function to use the new one for backward compatibility
export async function getCachedUsdToSolRate(): Promise<number> {
  return getCachedRate('SOL');
}

// Load presale data
export function loadPresaleData(): any {
  if (!fs.existsSync(PRESALE_DATA_PATH)) {
    return {
      participants: [],
      totalTokensSold: 0,
      totalUsdRaised: 0,
      isActive: false,
    };
  }
  return JSON.parse(fs.readFileSync(PRESALE_DATA_PATH, 'utf-8'));
}

// Save presale data
export function savePresaleData(data: any): void {
  fs.writeFileSync(PRESALE_DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// Check if presale is currently active
export function isPresaleActive(): boolean {
  const now = new Date();
  return now >= PRESALE_START_DATE && now <= PRESALE_END_DATE;
}

// Calculate tokens for a given USD amount
export function calculateTokensForUsd(usdAmount: number): number {
  return usdAmount / PRESALE_PRICE_USD;
}

// Start the presale
export async function startPresale() {
  const presaleData = loadPresaleData();
  
  if (presaleData.isActive) {
    console.log('Presale is already active.');
    return;
  }
  
  if (!isPresaleActive()) {
    console.log('Cannot start presale: Current date is outside the presale date range.');
    console.log(`Presale window: ${PRESALE_START_DATE.toISOString()} to ${PRESALE_END_DATE.toISOString()}`);
    return;
  }
  
  presaleData.isActive = true;
  presaleData.startTime = new Date().toISOString();
  savePresaleData(presaleData);
  
  console.log('Presale has been started successfully!');
  console.log(`Presale price: $${PRESALE_PRICE_USD} per VCN`);
  console.log(`Presale window: ${PRESALE_START_DATE.toISOString()} to ${PRESALE_END_DATE.toISOString()}`);
}

// End the presale
export async function endPresale() {
  const presaleData = loadPresaleData();
  
  if (!presaleData.isActive) {
    console.log('Presale is not active.');
    return;
  }
  
  presaleData.isActive = false;
  presaleData.endTime = new Date().toISOString();
  savePresaleData(presaleData);
  
  console.log('Presale has been ended.');
  console.log(`Total tokens sold: ${presaleData.totalTokensSold} VCN`);
  console.log(`Total USD raised: $${presaleData.totalUsdRaised}`);
}

// Setup rate limiting mechanism
type RateLimitEntry = {
  timestamp: number;
  attempts: number;
};

// Rate limiting configuration with defaults from environment variables
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute window
const RATE_LIMIT_MAX_ATTEMPTS = parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS || '5', 10); // 5 attempts per window
const MIN_PURCHASE_INTERVAL_MS = parseInt(process.env.MIN_PURCHASE_INTERVAL_MS || '60000', 10); // 1 minute between purchases per user
const MAX_PURCHASE_AMOUNT_USD = parseFloat(process.env.MAX_PURCHASE_AMOUNT_USD || '5000'); // Max $5000 per purchase

// Keep track of purchase attempts
const rateLimitMap: Map<string, RateLimitEntry> = new Map();
const lastPurchaseMap: Map<string, number> = new Map();

/**
 * Checks if a buyer is rate limited
 * @param {string} buyerAddress - The buyer's wallet address
 * @param {number} usdAmount - The USD amount being contributed
 * @throws {Error} If the buyer is rate limited
 */
function checkRateLimit(buyerAddress: string, usdAmount: number): void {
  const now = Date.now();
  
  // Check purchase interval for this buyer
  const lastPurchaseTime = lastPurchaseMap.get(buyerAddress);
  if (lastPurchaseTime) {
    const timeSinceLastPurchase = now - lastPurchaseTime;
    if (timeSinceLastPurchase < MIN_PURCHASE_INTERVAL_MS) {
      const timeRemaining = Math.ceil((MIN_PURCHASE_INTERVAL_MS - timeSinceLastPurchase) / 1000);
      throw new Error(`Rate limit: Please wait ${timeRemaining} seconds between purchases`);
    }
  }
  
  // Check purchase amount
  if (usdAmount > MAX_PURCHASE_AMOUNT_USD) {
    throw new Error(`Purchase amount exceeds maximum of $${MAX_PURCHASE_AMOUNT_USD} per transaction`);
  }
  
  // Check general rate limit
  const rateLimit = rateLimitMap.get(buyerAddress);
  
  if (rateLimit) {
    // Reset rate limit if window has expired
    if (now - rateLimit.timestamp > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.set(buyerAddress, { timestamp: now, attempts: 1 });
    } else {
      // Increment attempts within window
      rateLimit.attempts++;
      
      // Check if over limit
      if (rateLimit.attempts > RATE_LIMIT_MAX_ATTEMPTS) {
        const resetTime = new Date(rateLimit.timestamp + RATE_LIMIT_WINDOW_MS);
        throw new Error(`Rate limit exceeded. Try again after ${resetTime.toLocaleTimeString()}`);
      }
      
      rateLimitMap.set(buyerAddress, rateLimit);
    }
  } else {
    // First attempt for this address
    rateLimitMap.set(buyerAddress, { timestamp: now, attempts: 1 });
  }
}

/**
 * Record a successful purchase for rate limiting
 * @param {string} buyerAddress - The buyer's wallet address
 */
function recordSuccessfulPurchase(buyerAddress: string): void {
  lastPurchaseMap.set(buyerAddress, Date.now());
}

/**
 * Process a payment in SOL for the presale
 * @param {Keypair} presaleWalletKeypair - The presale wallet keypair
 * @param {PublicKey} buyerPublicKey - The buyer's wallet public key
 * @param {number} usdAmount - The USD amount being contributed
 * @returns {Promise<boolean>} Whether the payment was successful
 */
async function processSolPayment(
  presaleWalletKeypair: Keypair,
  buyerPublicKey: PublicKey,
  usdAmount: number
): Promise<boolean> {
  try {
    const connection = getConnection();
    
    // Get SOL price
    const solPrice = await getCachedRate('SOL');
    
    // Calculate SOL amount required
    const solAmount = usdAmount / solPrice;
    const lamportsRequired = Math.ceil(solAmount * LAMPORTS_PER_SOL);
    
    console.log(`Processing SOL payment: $${usdAmount} = ${solAmount} SOL (${lamportsRequired} lamports)`);
    
    // Check if buyer has enough SOL
    const buyerBalance = await connection.getBalance(buyerPublicKey);
    if (buyerBalance < lamportsRequired) {
      throw new Error(`Insufficient SOL balance. Required: ${solAmount} SOL, Available: ${buyerBalance / LAMPORTS_PER_SOL} SOL`);
    }
    
    // Create a transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: buyerPublicKey,
        toPubkey: presaleWalletKeypair.publicKey,
        lamports: lamportsRequired,
      })
    );
    
    // Send the transaction - this would need to be signed by the buyer in a real application
    // For testing purposes we're using direct keypair signatures, but in production
    // you would use a wallet adapter and have the buyer sign the transaction
    console.log(`Transaction would require the buyer to send ${solAmount} SOL to complete the purchase`);
    
    // In an actual implementation, return the transaction for the buyer to sign
    // For now we're returning true for testing
    return true;
    
  } catch (error: any) {
    console.error('Error processing SOL payment:', error);
    throw new Error(`SOL payment failed: ${error.message}`);
  }
}

/**
 * Process a payment in SPL tokens (USDC/USDT) for the presale
 * @param {Keypair} presaleWalletKeypair - The presale wallet keypair
 * @param {PublicKey} buyerPublicKey - The buyer's wallet public key
 * @param {number} usdAmount - The USD amount being contributed
 * @param {PaymentMethod} paymentMethod - The token being used for payment (USDC/USDT)
 * @returns {Promise<boolean>} Whether the payment was successful
 */
async function processSplTokenPayment(
  presaleWalletKeypair: Keypair,
  buyerPublicKey: PublicKey,
  usdAmount: number,
  paymentMethod: 'USDC' | 'USDT'
): Promise<boolean> {
  try {
    const connection = getConnection();
    
    // Get the token mint address
    const tokenMintAddress = TOKEN_ADDRESSES[paymentMethod];
    if (!tokenMintAddress) {
      throw new Error(`Unknown payment token: ${paymentMethod}`);
    }
    
    // For stablecoins, the token amount is the same as the USD amount (1:1)
    const tokenAmount = usdAmount;
    console.log(`Processing ${paymentMethod} payment: $${usdAmount} = ${tokenAmount} ${paymentMethod}`);
    
    // Get or create the presale wallet's token account
    const presaleTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      presaleWalletKeypair,
      tokenMintAddress,
      presaleWalletKeypair.publicKey
    );
    
    // Get the buyer's token account
    try {
      const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        presaleWalletKeypair, // Payer for account creation if needed
        tokenMintAddress,
        buyerPublicKey
      );
      
      // Check if buyer has enough tokens (convert to raw amount based on decimals)
      const tokenInfo = await getAccount(connection, buyerTokenAccount.address);
      const tokenDecimals = 6; // Both USDC and USDT have 6 decimals on Solana
      const rawAmount = BigInt(Math.floor(tokenAmount * 10**tokenDecimals));
      
      if (tokenInfo.amount < rawAmount) {
        throw new Error(`Insufficient ${paymentMethod} balance. Required: ${tokenAmount}, Available: ${Number(tokenInfo.amount) / 10**tokenDecimals}`);
      }
      
      console.log(`Transaction would require the buyer to send ${tokenAmount} ${paymentMethod} to complete the purchase`);
      
      // In an actual implementation, return a transaction for the buyer to sign
      // For now we're returning true for testing
      return true;
      
    } catch (error: any) {
      if (error.message.includes('TokenAccountNotFoundError')) {
        throw new Error(`Buyer doesn't have a ${paymentMethod} token account`);
      }
      throw error;
    }
    
  } catch (error: any) {
    console.error(`Error processing ${paymentMethod} payment:`, error);
    throw new Error(`${paymentMethod} payment failed: ${error.message}`);
  }
}

// Modify the processPurchase function to include multiple payment methods
/**
 * Process a purchase in the presale
 * @param {string} buyerAddress - The buyer's wallet address
 * @param {number} usdAmount - The USD amount being contributed
 * @param {PaymentMethod} paymentMethod - The method used for payment (SOL, USDC, USDT)
 * @returns {Promise<object>} The purchase details
 * @throws {Error} If the presale is not active or if there's an error processing the purchase
 */
export async function processPurchase(
  buyerAddress: string, 
  usdAmount: number,
  paymentMethod: PaymentMethod = 'SOL' // Default to SOL for backward compatibility
): Promise<any> {
  try {
    // Validate inputs
    if (!buyerAddress || typeof buyerAddress !== 'string') {
      throw new Error('Buyer address is required');
    }
    
    // Validate the buyer address is a valid Solana public key
    let buyerPublicKey: PublicKey;
    try {
      buyerPublicKey = new PublicKey(buyerAddress);
    } catch (error) {
      throw new Error(`Invalid Solana address: ${buyerAddress}`);
    }
    
    if (!usdAmount || typeof usdAmount !== 'number' || usdAmount <= 0) {
      throw new Error('USD amount must be a positive number');
    }
    
    // Validate payment method
    if (!['SOL', 'USDC', 'USDT'].includes(paymentMethod)) {
      throw new Error(`Unsupported payment method: ${paymentMethod}. Supported methods are SOL, USDC, and USDT.`);
    }
    
    // Check rate limits
    checkRateLimit(buyerAddress, usdAmount);
    
    // Load presale data
    const presaleData = loadPresaleData();
    
    if (!presaleData.isActive) {
      throw new Error('Presale is not active');
    }
    
    // Load token metadata
    const tokenMetadata = loadTokenMetadata();
    
    // Check presale wallet details
    if (!tokenMetadata.allocations || !tokenMetadata.allocations.presale) {
      throw new Error('Presale allocation not found in token metadata');
    }
    
    const mintAddress = new PublicKey(tokenMetadata.mintAddress);
    const presaleWalletKeypair = await getOrCreateKeypair('presale_wallet');
    
    // Get presale token account
    const presaleTokenAccount = await createAssociatedTokenAccountIdempotent(
      getConnection(),
      presaleWalletKeypair,
      mintAddress,
      presaleWalletKeypair.publicKey,
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    
    // Calculate token amount based on USD amount and token price
    const tokenAmount = Math.floor(usdAmount / PRESALE_PRICE_USD);
    
    if (tokenAmount <= 0) {
      throw new Error(`USD amount too small. Minimum purchase is ${PRESALE_PRICE_USD} USD`);
    }
    
    // Check remaining allocation
    const remainingTokens = parseInt(tokenMetadata.allocations.presale.amount) - presaleData.totalTokensSold;
    if (tokenAmount > remainingTokens) {
      throw new Error(`Purchase exceeds remaining allocation. Only ${remainingTokens} tokens available.`);
    }
    
    // Process payment based on payment method
    let paymentSuccess = false;
    
    if (paymentMethod === 'SOL') {
      paymentSuccess = await processSolPayment(presaleWalletKeypair, buyerPublicKey, usdAmount);
    } else if (paymentMethod === 'USDC' || paymentMethod === 'USDT') {
      paymentSuccess = await processSplTokenPayment(presaleWalletKeypair, buyerPublicKey, usdAmount, paymentMethod);
    } else {
      throw new Error(`Unsupported payment method: ${paymentMethod}`);
    }
    
    if (!paymentSuccess) {
      throw new Error(`Payment processing failed for ${paymentMethod}`);
    }
    
    // Check if buyer token account exists and create it if not
    let buyerTokenAccount: PublicKey;
    try {
      buyerTokenAccount = await createAssociatedTokenAccountIdempotent(
        getConnection(),
        presaleWalletKeypair,
        mintAddress,
        buyerPublicKey,
        { commitment: 'confirmed' },
        TOKEN_2022_PROGRAM_ID
      );
      
      // Check if account exists
      await getConnection().getAccountInfo(buyerTokenAccount);
    } catch (error: any) {
      if (error.message.includes('TokenAccountNotFoundError')) {
        console.log(`Creating token account for buyer...`);
        
        // Create token account for buyer
        await createAssociatedTokenAccountIdempotent(
          getConnection(),
          presaleWalletKeypair,
          mintAddress,
          buyerPublicKey,
          { commitment: 'confirmed' },
          TOKEN_2022_PROGRAM_ID
        );
        
        buyerTokenAccount = await createAssociatedTokenAccountIdempotent(
          getConnection(),
          presaleWalletKeypair,
          mintAddress,
          buyerPublicKey,
          { commitment: 'confirmed' },
          TOKEN_2022_PROGRAM_ID
        );
      } else {
        throw error;
      }
    }

    // Transfer tokens to buyer
    console.log(`Transferring ${tokenAmount} VCN to ${buyerAddress}...`);
    const rawTokenAmount = tokensToRawAmount(BigInt(tokenAmount));
    
    // Verify presale wallet has sufficient balance
    try {
      const presaleAccount = await getConnection().getAccountInfo(presaleTokenAccount);
      
      if (presaleAccount && BigInt(presaleAccount.lamports) < BigInt(rawTokenAmount)) {
        throw new Error(
          `Presale wallet has insufficient tokens. ` +
            `Required: ${tokenAmount}, Available: ${rawAmountToTokens(BigInt(presaleAccount.lamports))}`
        );
      }
    } catch (error: any) {
      if (error.message.includes('TokenAccountNotFoundError')) {
        throw new Error('Presale token account not found. Please check the presale setup.');
      }
      throw error;
    }
    
    await transfer(
      getConnection(),
      presaleWalletKeypair,
      presaleTokenAccount,
      buyerTokenAccount,
      presaleWalletKeypair,
      BigInt(rawTokenAmount),
      [],
      { commitment: 'confirmed' },
      TOKEN_2022_PROGRAM_ID
    );
    
    // Update presale data
    presaleData.participants.push({
      address: buyerAddress,
      usdAmount,
      tokenAmount,
      paymentMethod, // Add payment method to the record
      timestamp: new Date().toISOString(),
    });
    
    presaleData.totalTokensSold += tokenAmount;
    presaleData.totalUsdRaised += usdAmount;
    savePresaleData(presaleData);
    
    console.log('Purchase processed successfully!');
    console.log(`${tokenAmount} VCN transferred to ${buyerAddress}`);
    console.log(`Payment method: ${paymentMethod}`);
    console.log(`Total tokens sold: ${presaleData.totalTokensSold} VCN`);
    console.log(`Total USD raised: $${presaleData.totalUsdRaised}`);
    
    // After successful purchase
    recordSuccessfulPurchase(buyerAddress);
    
    return {
      address: buyerAddress,
      usdAmount,
      tokenAmount,
      paymentMethod,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error processing purchase:', error);
    throw error;
  }
}

// Check presale status
export function checkPresaleStatus() {
  const presaleData = loadPresaleData();
  const now = new Date();
  
  console.log('===== VCoin Presale Status =====');
  console.log(`Status: ${presaleData.isActive ? 'Active' : 'Inactive'}`);
  console.log(`Start date: ${PRESALE_START_DATE.toISOString()}`);
  console.log(`End date: ${PRESALE_END_DATE.toISOString()}`);
  console.log(`Price per token: $${PRESALE_PRICE_USD}`);
  console.log(`Total tokens sold: ${presaleData.totalTokensSold}`);
  console.log(`Total USD raised: $${presaleData.totalUsdRaised}`);
  console.log(`Number of participants: ${presaleData.participants.length}`);
  console.log(`Payment methods: SOL, USDC, USDT`);
  console.log('================================');
}

// Command line interface
export async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  try {
    switch (command) {
      case 'start':
        await startPresale();
        break;
      case 'end':
        await endPresale();
        break;
      case 'buy':
        if (args.length < 3) {
          console.error('Usage: npm run presale buy <buyer_address> <usd_amount> [payment_method]');
          console.error('Supported payment methods: SOL (default), USDC, USDT');
          process.exit(1);
        }
        const buyerAddress = args[1];
        const usdAmount = parseFloat(args[2]);
        const paymentMethod = (args[3] || 'SOL').toUpperCase() as PaymentMethod;
        await processPurchase(buyerAddress, usdAmount, paymentMethod);
        break;
      case 'status':
        checkPresaleStatus();
        break;
      default:
        console.log('Available commands:');
        console.log('  npm run presale start - Start the presale');
        console.log('  npm run presale end - End the presale');
        console.log('  npm run presale buy <buyer_address> <usd_amount> [payment_method] - Process a purchase');
        console.log('     Supported payment methods: SOL (default), USDC, USDT');
        console.log('  npm run presale status - Check presale status');
        break;
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Only execute if this file is run directly
if (require.main === module) {
  main();
} 