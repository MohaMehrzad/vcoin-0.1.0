import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Types for price data
interface PriceResponse {
  success: boolean;
  prices: {
    SOL: number;
    USDC: number;
    USDT: number;
  };
  source?: string;
  timestamp?: number;
  message?: string;
}

// Time to cache prices (in milliseconds)
const CACHE_TTL = 60 * 1000; // 1 minute

// In-memory cache
let priceCache: {
  data: PriceResponse | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0
};

/**
 * API handler for fetching latest cryptocurrency prices
 * Implements a multi-source oracle with fallbacks and validation
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check if we have a fresh cache
    const now = Date.now();
    if (priceCache.data && (now - priceCache.timestamp < CACHE_TTL)) {
      return NextResponse.json(priceCache.data);
    }
    
    // Fetch from multiple sources
    const prices = await fetchPricesFromMultipleSources();
    
    // Create response
    const response: PriceResponse = {
      success: true,
      prices,
      timestamp: now
    };
    
    // Cache the result
    priceCache = {
      data: response,
      timestamp: now
    };
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching prices:', error);
    
    // Return cached data if available, even if stale
    if (priceCache.data) {
      const response: PriceResponse = {
        ...priceCache.data,
        success: true,
        message: 'Using cached data due to fetch error'
      };
      return NextResponse.json(response);
    }
    
    // If no cache, return error
    return NextResponse.json({
      success: false,
      prices: { SOL: 143, USDC: 1, USDT: 1 }, // Fallback prices
      message: error.message || 'Failed to fetch prices',
      timestamp: Date.now()
    }, { status: 500 });
  }
}

/**
 * Fetch cryptocurrency prices from multiple sources
 * @returns Price data for SOL, USDC, and USDT
 */
async function fetchPricesFromMultipleSources(): Promise<{ SOL: number; USDC: number; USDT: number }> {
  const solPrices: number[] = [];
  const results: { source: string; price: number; error?: string }[] = [];
  
  // CoinGecko - most reliable public API
  try {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { timeout: 3000 }
    );
    
    if (response.data?.solana?.usd) {
      const price = response.data.solana.usd;
      solPrices.push(price);
      results.push({ source: 'coingecko', price });
    }
  } catch (error: any) {
    results.push({ source: 'coingecko', price: 0, error: error.message });
  }
  
  // Binance - high volume exchange API
  try {
    const response = await axios.get(
      'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
      { timeout: 3000 }
    );
    
    if (response.data?.price) {
      const price = parseFloat(response.data.price);
      solPrices.push(price);
      results.push({ source: 'binance', price });
    }
  } catch (error: any) {
    results.push({ source: 'binance', price: 0, error: error.message });
  }
  
  // Kraken - another major exchange API
  try {
    const response = await axios.get(
      'https://api.kraken.com/0/public/Ticker?pair=SOLUSD',
      { timeout: 3000 }
    );
    
    if (response.data?.result?.XSOLUSD?.c?.[0]) {
      const price = parseFloat(response.data.result.XSOLUSD.c[0]);
      solPrices.push(price);
      results.push({ source: 'kraken', price });
    }
  } catch (error: any) {
    results.push({ source: 'kraken', price: 0, error: error.message });
  }
  
  // Log results for debugging
  console.log('Price oracle results:', JSON.stringify(results));
  
  // Select the best SOL price (use lowest after validation)
  let solPrice = 143; // Fallback price
  
  if (solPrices.length > 0) {
    // Sort ascending
    solPrices.sort((a, b) => a - b);
    
    // Simple validation
    if (solPrices.length >= 3) {
      // With 3+ sources, we can identify and remove outliers
      const median = solPrices[Math.floor(solPrices.length / 2)];
      
      // If lowest price is more than 5% off from median, it might be an outlier
      if (solPrices[0] < median * 0.95) {
        // Use second lowest price instead
        solPrice = solPrices[1];
      } else {
        // Lowest price passes validation
        solPrice = solPrices[0];
      }
    } else {
      // With fewer sources, use the lowest price
      solPrice = solPrices[0];
    }
  }
  
  // Stablecoins are always $1 (in ideal conditions)
  // For production, you might want to fetch their actual prices
  return {
    SOL: solPrice,
    USDC: 1,
    USDT: 1
  };
} 