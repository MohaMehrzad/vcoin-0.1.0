/**
 * Example script demonstrating the multi-currency presale functionality
 * This shows how to purchase VCN tokens using SOL, USDC, and USDT
 */

import {
  processPurchase,
  startPresale,
  checkPresaleStatus,
  PaymentMethod
} from '../../src/presale';
import { PublicKey } from '@solana/web3.js';

// Example buyer addresses
const EXAMPLE_BUYERS = {
  sol: 'CBH6VLj3y1YR9s4mbH4M8dCpTVqhBNUt5mUhxdKQ6o5R',
  usdc: '6hUgm4kYmYPxA1eqP85SuARrRYYkEkrn8TQ1s9KpVTdE',
  usdt: 'FSYcMYw8RQz1wNzkTGLGXDzB5iP4rKQwAVbdkLTVDv4o'
};

/**
 * Demonstrate a purchase using SOL
 */
async function demonstrateSolPurchase() {
  console.log('\n===== SOL PURCHASE EXAMPLE =====');
  const usdAmount = 100; // $100 worth of VCN tokens
  const paymentMethod: PaymentMethod = 'SOL';
  
  try {
    console.log(`Processing purchase with ${paymentMethod}...`);
    console.log(`Buyer: ${EXAMPLE_BUYERS.sol}`);
    console.log(`USD Amount: $${usdAmount}`);
    
    const result = await processPurchase(
      EXAMPLE_BUYERS.sol,
      usdAmount,
      paymentMethod
    );
    
    console.log('Purchase successful!');
    console.log('Receipt:', result);
  } catch (error: any) {
    console.error(`Error in SOL purchase: ${error.message}`);
  }
}

/**
 * Demonstrate a purchase using USDC
 */
async function demonstrateUsdcPurchase() {
  console.log('\n===== USDC PURCHASE EXAMPLE =====');
  const usdAmount = 250; // $250 worth of VCN tokens
  const paymentMethod: PaymentMethod = 'USDC';
  
  try {
    console.log(`Processing purchase with ${paymentMethod}...`);
    console.log(`Buyer: ${EXAMPLE_BUYERS.usdc}`);
    console.log(`USD Amount: $${usdAmount}`);
    
    const result = await processPurchase(
      EXAMPLE_BUYERS.usdc,
      usdAmount,
      paymentMethod
    );
    
    console.log('Purchase successful!');
    console.log('Receipt:', result);
  } catch (error: any) {
    console.error(`Error in USDC purchase: ${error.message}`);
  }
}

/**
 * Demonstrate a purchase using USDT
 */
async function demonstrateUsdtPurchase() {
  console.log('\n===== USDT PURCHASE EXAMPLE =====');
  const usdAmount = 500; // $500 worth of VCN tokens
  const paymentMethod: PaymentMethod = 'USDT';
  
  try {
    console.log(`Processing purchase with ${paymentMethod}...`);
    console.log(`Buyer: ${EXAMPLE_BUYERS.usdt}`);
    console.log(`USD Amount: $${usdAmount}`);
    
    const result = await processPurchase(
      EXAMPLE_BUYERS.usdt,
      usdAmount,
      paymentMethod
    );
    
    console.log('Purchase successful!');
    console.log('Receipt:', result);
  } catch (error: any) {
    console.error(`Error in USDT purchase: ${error.message}`);
  }
}

/**
 * Run the multi-currency presale demo
 */
async function runDemo() {
  try {
    // Start the presale
    await startPresale();
    
    // Check initial status
    checkPresaleStatus();
    
    // Demonstrate purchases with different currencies
    await demonstrateSolPurchase();
    await demonstrateUsdcPurchase();
    await demonstrateUsdtPurchase();
    
    // Check final status
    checkPresaleStatus();
    
    console.log('\nDemo completed successfully!');
  } catch (error: any) {
    console.error(`Demo error: ${error.message}`);
  }
}

// Run the demo when executed directly
if (require.main === module) {
  runDemo().catch(console.error);
} 