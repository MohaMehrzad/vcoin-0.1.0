"use client";

import React, { useMemo, useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';

// Import polyfills first to ensure compatibility
import './polyfills';

// Import Solana wallet adapter components
import { 
  ConnectionProvider, 
  WalletProvider 
} from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
  CoinbaseWalletAdapter,
  CloverWalletAdapter,
  MathWalletAdapter,
  SolongWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

// Import Solana wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

// Set up RPC endpoint
const ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

export function Providers({ children }: { children: React.ReactNode }) {
  // Log environment for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('Wallet provider initialized');
      console.log('RPC Endpoint:', ENDPOINT);
      console.log('Solana in window:', !!window.solana);
      console.log('Phantom in window:', window.solana?.isPhantom);
    }
  }, []);

  // Set up Solana network
  const network = WalletAdapterNetwork.Mainnet;
  
  // Configure wallet adapters
  const wallets = useMemo(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    
    return [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new CloverWalletAdapter(),
      new MathWalletAdapter(),
      new SolongWalletAdapter(),
    ];
  }, [network]);
  
  return (
    <ConnectionProvider endpoint={ENDPOINT} config={{ commitment: 'confirmed' }}>
      <WalletProvider wallets={wallets} autoConnect={true}>
        <WalletModalProvider>
          <SessionProvider>
            {children}
          </SessionProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
} 