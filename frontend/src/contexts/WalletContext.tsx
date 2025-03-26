"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  ConnectionProvider, 
  WalletProvider, 
  useWallet,
  useConnection
} from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

type WalletContextType = {
  connecting: boolean;
  connected: boolean;
  publicKey: PublicKey | null;
  walletAddress: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array | null>;
  connection: Connection | null;
};

const WalletContext = createContext<WalletContextType | null>(null);

export const useWalletContext = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletContext must be used within a WalletContextProvider');
  }
  return context;
};

// Internal component to access wallet hooks
function WalletContextInternal({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const { 
    publicKey, 
    connecting, 
    connected, 
    connect: walletConnect, 
    disconnect: walletDisconnect,
    signMessage: walletSignMessage
  } = useWallet();
  
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    if (publicKey) {
      setWalletAddress(publicKey.toString());
    } else {
      setWalletAddress(null);
    }
  }, [publicKey]);

  const connect = async () => {
    try {
      await walletConnect();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const disconnect = async () => {
    try {
      await walletDisconnect();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  const signMessage = async (message: Uint8Array): Promise<Uint8Array | null> => {
    try {
      if (!connected || !walletSignMessage) return null;
      return await walletSignMessage(message);
    } catch (error) {
      console.error('Failed to sign message:', error);
      return null;
    }
  };

  return (
    <WalletContext.Provider
      value={{
        connecting,
        connected,
        publicKey,
        walletAddress,
        connect,
        disconnect,
        signMessage,
        connection,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function WalletContextProvider({ children }: { children: ReactNode }) {
  // Determine which network to connect to
  const network = 
    (process.env.NEXT_PUBLIC_SOLANA_NETWORK as WalletAdapterNetwork) || 
    WalletAdapterNetwork.Devnet;
  
  // You can also provide a custom RPC endpoint
  const endpoint = 
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 
    clusterApiUrl(network);
  
  // Initialize wallet adapters
  const wallets = [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ];

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletContextInternal>
            {children}
          </WalletContextInternal>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
} 