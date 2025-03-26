"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Connection, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } from '@solana/spl-token';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Image from 'next/image';

// Constants from backend
const VCOIN_DECIMALS = 6;
const PRESALE_PRICE_USD = 0.03;
const TOKEN_SYMBOL = "VCN";
const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";

// Token addresses (replace with actual addresses from your deployed contract)
const USDC_TOKEN = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDT_TOKEN = new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
const VCOIN_TOKEN = new PublicKey(process.env.NEXT_PUBLIC_VCOIN_TOKEN_ADDRESS || "11111111111111111111111111111111");
const PRESALE_WALLET = new PublicKey(process.env.NEXT_PUBLIC_PRESALE_WALLET_ADDRESS || "11111111111111111111111111111111");

// Backend API endpoints
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const PRICE_API_ENDPOINT = `${API_BASE_URL}/prices`;

export default function Home() {
  const { publicKey, connected, signTransaction, sendTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState<boolean>(true);
  const [priceSource, setPriceSource] = useState<string>('');
  const [tokenPrice, setTokenPrice] = useState<{[key: string]: number}>({
    SOL: 143, // Fallback SOL price
    USDC: 1,
    USDT: 1
  });
  const [presaleAmount, setPresaleAmount] = useState("1000");
  const [paymentMethod, setPaymentMethod] = useState("SOL");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  
  useEffect(() => {
    setMounted(true);
    fetchPrices();
    
    // Set up price refresh interval (every 60 seconds)
    const intervalId = setInterval(fetchPrices, 60000);
    
    // Log wallet connection status for debugging
    console.log("Wallet connection status:", { 
      connected, 
      publicKey: publicKey?.toString(),
      adapters: window?.solana?.isPhantom
    });
    
    if (window?.solana) {
      console.log("Phantom detected in window object");
    } else {
      console.log("Phantom not detected in window object");
      setWalletError("Phantom wallet extension not detected. Please install the extension and refresh the page.");
    }
    
    return () => {
      clearInterval(intervalId);
    };
  }, [connected, publicKey]);

  // Fetch cryptocurrency prices from our API endpoint
  const fetchPrices = async () => {
    setIsPriceLoading(true);
    try {
      // First attempt to fetch from our API endpoint
      const response = await axios.get('/api/prices/latest');
      
      if (response.data?.success && response.data?.prices) {
        setTokenPrice(response.data.prices);
        setPriceSource(response.data.source || 'Price Oracle');
        console.log('Prices fetched successfully:', response.data);
      } else {
        throw new Error('Invalid response from price API');
      }
    } catch (error) {
      console.error('Error fetching prices:', error);
      
      // Fallback prices if API fails
      toast.error('Could not fetch latest prices. Using fallback values.');
      setTokenPrice({
        SOL: 143, // Updated fallback SOL price
        USDC: 1,
        USDT: 1
      });
      setPriceSource('Fallback');
    } finally {
      setIsPriceLoading(false);
    }
  };

  // Calculate the amount of tokens to receive based on the payment method and amount
  const calculateTokensToReceive = useCallback(() => {
    const usdAmount = Number(presaleAmount) * PRESALE_PRICE_USD;
    
    if (paymentMethod === 'SOL' && tokenPrice.SOL) {
      return usdAmount / tokenPrice.SOL;
    } else {
      return usdAmount; // For USDC and USDT, it's 1:1 with USD
    }
  }, [presaleAmount, paymentMethod, tokenPrice]);

  // Amount of VCoin to purchase
  const tokensToPurchase = useCallback(() => {
    return Number(presaleAmount); 
  }, [presaleAmount]);

  // Handle purchase submission
  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!connected || !publicKey || !signTransaction || !sendTransaction) {
      setErrorMessage("Please connect your wallet first");
      return;
    }
    
    // Check if we have valid price data
    if (paymentMethod === 'SOL' && (tokenPrice.SOL === 0 || isPriceLoading)) {
      setErrorMessage("Price data is still loading. Please try again in a moment.");
      return;
    }
    
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");
    
    try {
      const connection = new Connection(RPC_ENDPOINT, 'confirmed');
      const parsedAmount = Number(presaleAmount);
      
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Please enter a valid amount");
      }
      
      // Calculate payment amount based on token price
      const paymentTokenAmount = calculateTokensToReceive();
      
      // Create transaction
      let transaction = new Transaction();
      
      if (paymentMethod === 'SOL') {
        // SOL payment - direct transfer to the presale wallet
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: PRESALE_WALLET,
            lamports: Math.floor(paymentTokenAmount * LAMPORTS_PER_SOL)
          })
        );
      } else {
        // SPL Token payment (USDC or USDT)
        const tokenMint = paymentMethod === 'USDC' ? USDC_TOKEN : USDT_TOKEN;
        const paymentInstructionsData = await createSplTokenTransferInstructions(
          connection,
          publicKey,
          PRESALE_WALLET,
          tokenMint,
          BigInt(Math.floor(paymentTokenAmount * 1000000)) // 6 decimals for USDC/USDT
        );
        transaction.add(...paymentInstructionsData.instructions);
      }
      
      // Add metadata to record the purchase intent
      transaction.feePayer = publicKey;
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      
      // Send transaction
      const signedTx = await sendTransaction(transaction, connection);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signedTx, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error("Transaction failed: " + JSON.stringify(confirmation.value.err));
      }
      
      // Register the purchase on backend
      await registerPurchase(
        publicKey.toString(), 
        parsedAmount, 
        paymentMethod,
        signedTx
      );
      
      setSuccessMessage(`Successfully purchased ${parsedAmount} ${TOKEN_SYMBOL} tokens! Transaction ID: ${signedTx}`);
    } catch (error: any) {
      console.error("Error during purchase:", error);
      setErrorMessage(error.message || "An error occurred during the purchase");
    } finally {
      setLoading(false);
    }
  };
  
  // Create SPL token transfer instructions
  const createSplTokenTransferInstructions = async (
    connection: Connection,
    from: PublicKey,
    to: PublicKey,
    tokenMint: PublicKey,
    amount: bigint
  ) => {
    // Get associated token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(tokenMint, from, false);
    const toTokenAccount = await getAssociatedTokenAddress(tokenMint, to, false);
    
    // Check if destination token account exists
    let instructions = [];
    try {
      await connection.getTokenAccountBalance(toTokenAccount);
    } catch (error) {
      // If it doesn't exist, create it
      instructions.push(
        createAssociatedTokenAccountInstruction(
          from,
          toTokenAccount,
          to,
          tokenMint
        )
      );
    }
    
    // Add transfer instruction
    instructions.push(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        from,
        amount
      )
    );
    
    return {
      fromTokenAccount,
      toTokenAccount,
      instructions
    };
  };
  
  // Register purchase with backend
  const registerPurchase = async (
    wallet: string,
    amount: number,
    paymentMethod: string,
    txId: string
  ) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/presale/register`, {
        wallet,
        amount,
        paymentMethod,
        txId
      });
      
      return response.data;
    } catch (error) {
      console.error("Failed to register purchase with backend:", error);
      throw new Error("Transaction was sent, but failed to register with backend. Please contact support with your transaction ID.");
    }
  };

  return (
    <div style={{ 
      minHeight: "100vh", 
      display: "flex", 
      flexDirection: "column",
      background: "linear-gradient(135deg, rgba(10, 15, 30, 0.95) 0%, rgba(5, 10, 25, 0.98) 100%)",
      position: "relative",
      overflow: "hidden"
    }}>
      <ToastContainer position="top-right" theme="dark" />
      
      {/* Grid pattern overlay */}
      <div style={{ 
        position: "absolute", 
        inset: 0, 
        backgroundImage: `
          linear-gradient(to right, rgba(var(--accent-cyan), 0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(var(--accent-cyan), 0.03) 1px, transparent 1px)
        `,
        backgroundSize: "50px 50px",
        opacity: 0.4,
        zIndex: 1
      }}></div>
      
      {/* Glowing orbs */}
      <div style={{ 
        position: "absolute", 
        width: "400px", 
        height: "400px", 
        borderRadius: "50%", 
        background: "radial-gradient(circle, rgba(var(--accent-cyan), 0.15) 0%, transparent 70%)",
        top: "-100px",
        right: "-100px",
        zIndex: 1
      }}></div>
      
      <div style={{ 
        position: "absolute", 
        width: "600px", 
        height: "600px", 
        borderRadius: "50%", 
        background: "radial-gradient(circle, rgba(var(--accent-magenta), 0.1) 0%, transparent 70%)",
        bottom: "-200px",
        left: "-200px",
        zIndex: 1
      }}></div>

      {/* Header with wallet connection */}
      <header style={{ 
        padding: "1.5rem", 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        position: "relative",
        zIndex: 10
      }}>
        <div style={{ 
          fontSize: "1.5rem", 
          fontWeight: "300", 
          letterSpacing: "0.1em",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem"
        }}>
          <div style={{ 
            backgroundColor: "rgba(var(--accent-cyan), 0.9)",
            width: "30px",
            height: "30px",
            clipPath: "polygon(0% 33%, 50% 0%, 100% 33%, 100% 66%, 50% 100%, 0% 66%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 15px rgba(var(--accent-cyan), 0.7)"
          }}></div>
          <span style={{ color: "rgb(var(--accent-cyan))" }}>V</span>
          <span>COIN</span>
        </div>
        
        {mounted && (
          <div className="wallet-adapter-dropdown" style={{
            background: "transparent"
          }}>
            <WalletMultiButton />
            {walletError && (
              <div style={{
                color: "rgb(var(--accent-magenta))",
                fontSize: "0.75rem",
                marginTop: "0.5rem",
                textAlign: "right"
              }}>
                {walletError}
              </div>
            )}
          </div>
        )}
      </header>

      <main style={{ 
        flex: "1", 
        display: "flex", 
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "2rem 1rem",
        position: "relative",
        zIndex: 10
      }}>
        <div style={{ 
          maxWidth: "1200px",
          width: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "4rem",
          alignItems: "center",
          marginBottom: "4rem"
        }}>
          {/* Left side - Hero content */}
          <div style={{ padding: "2rem" }}>
            <h1 className="glow-text" style={{ 
              fontSize: "clamp(2.5rem, 5vw, 4rem)", 
              fontWeight: "200", 
              letterSpacing: "0.1em", 
              marginBottom: "1.5rem",
              lineHeight: "1.1"
            }}>
              The <span style={{ color: "rgb(var(--accent-magenta))" }}>Future</span> of <span style={{ color: "rgb(var(--accent-cyan))" }}>Finance</span> is Here
            </h1>
            
            <p style={{ 
              fontSize: "1.125rem", 
              color: "rgba(255, 255, 255, 0.7)", 
              marginBottom: "2rem", 
              maxWidth: "500px",
              lineHeight: "1.6"
            }}>
              VCOIN is a secure cryptocurrency built on Solana's Token-2022 protocol, designed for the next generation of financial technology.
            </p>
            
            <div style={{ 
              display: "flex", 
              gap: "1.5rem", 
              flexWrap: "wrap",
              marginBottom: "3rem" 
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem"
              }}>
                <div style={{ 
                  width: "10px", 
                  height: "10px", 
                  background: "rgb(var(--accent-cyan))",
                  borderRadius: "50%",
                  boxShadow: "0 0 10px rgba(var(--accent-cyan), 0.7)"
                }}></div>
                <span style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.6)" }}>
                  Token-2022 Protocol
                </span>
              </div>
              
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem"
              }}>
                <div style={{ 
                  width: "10px", 
                  height: "10px", 
                  background: "rgb(var(--accent-magenta))",
                  borderRadius: "50%",
                  boxShadow: "0 0 10px rgba(var(--accent-magenta), 0.7)"
                }}></div>
                <span style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.6)" }}>
                  Multi-currency Support
                </span>
              </div>
              
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem"
              }}>
                <div style={{ 
                  width: "10px", 
                  height: "10px", 
                  background: "rgb(var(--accent-cyan))",
                  borderRadius: "50%",
                  boxShadow: "0 0 10px rgba(var(--accent-cyan), 0.7)"
                }}></div>
                <span style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.6)" }}>
                  Enhanced Security
                </span>
              </div>
            </div>
          </div>
          
          {/* Right side - Presale form */}
          <div style={{ 
            backdropFilter: "blur(10px)",
            backgroundColor: "rgba(15, 20, 35, 0.5)",
            border: "1px solid rgba(var(--accent-cyan), 0.2)",
            borderRadius: "12px",
            padding: "2.5rem",
            boxShadow: "0 0 30px rgba(var(--accent-cyan), 0.15)",
            position: "relative",
            overflow: "hidden"
          }}>
            <div style={{ 
              position: "absolute", 
              top: 0, 
              right: 0, 
              width: "150px", 
              height: "150px", 
              background: "radial-gradient(circle, rgba(var(--accent-cyan), 0.15), transparent 70%)",
              zIndex: -1
            }}></div>
            
            <h2 style={{ 
              fontSize: "1.5rem", 
              fontWeight: "300", 
              marginBottom: "1.5rem", 
              color: "rgb(var(--accent-cyan))",
              textAlign: "center",
              letterSpacing: "0.05em"
            }}>
              Join the Presale
            </h2>
            
            {successMessage && (
              <div style={{
                padding: "1rem",
                marginBottom: "1.5rem",
                backgroundColor: "rgba(0, 200, 83, 0.1)",
                border: "1px solid rgba(0, 200, 83, 0.3)",
                borderRadius: "4px",
                color: "rgba(0, 200, 83, 0.9)"
              }}>
                {successMessage}
              </div>
            )}
            
            {errorMessage && (
              <div style={{
                padding: "1rem",
                marginBottom: "1.5rem",
                backgroundColor: "rgba(255, 0, 0, 0.1)",
                border: "1px solid rgba(255, 0, 0, 0.3)",
                borderRadius: "4px",
                color: "rgba(255, 0, 0, 0.9)"
              }}>
                {errorMessage}
              </div>
            )}
            
            <form onSubmit={handlePurchase} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ 
                  fontSize: "0.875rem", 
                  color: "rgba(255, 255, 255, 0.7)",
                  marginBottom: "0.25rem"
                }}>
                  Amount to Purchase
                </label>
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  position: "relative",
                  border: "1px solid rgba(var(--accent-cyan), 0.3)",
                  borderRadius: "4px",
                  padding: "0.5rem 1rem",
                  backgroundColor: "rgba(15, 20, 35, 0.5)"
                }}>
                  <input
                    type="text"
                    value={presaleAmount}
                    onChange={(e) => setPresaleAmount(e.target.value)}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      color: "white",
                      fontSize: "1rem",
                      outline: "none"
                    }}
                  />
                  <span style={{ 
                    position: "absolute", 
                    right: "1rem", 
                    color: "rgba(var(--accent-cyan), 0.8)",
                    fontSize: "0.875rem",
                    fontWeight: "500"
                  }}>
                    {TOKEN_SYMBOL}
                  </span>
                </div>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ 
                  fontSize: "0.875rem", 
                  color: "rgba(255, 255, 255, 0.7)",
                  marginBottom: "0.25rem"
                }}>
                  Payment Method
                </label>
                <div style={{ 
                  display: "flex", 
                  gap: "1rem", 
                  flexWrap: "wrap"
                }}>
                  {["SOL", "USDC", "USDT"].map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      style={{
                        flex: 1,
                        minWidth: "80px",
                        padding: "0.75rem",
                        border: `1px solid ${paymentMethod === method ? 
                          'rgba(var(--accent-cyan), 0.8)' : 
                          'rgba(var(--accent-cyan), 0.2)'}`,
                        borderRadius: "4px",
                        background: paymentMethod === method ? 
                          "rgba(var(--accent-cyan), 0.15)" : 
                          "transparent",
                        color: paymentMethod === method ? 
                          "rgba(var(--accent-cyan), 1)" : 
                          "rgba(255, 255, 255, 0.6)",
                        cursor: "pointer",
                        transition: "all 0.2s ease"
                      }}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Payment Summary */}
              <div style={{ 
                marginBottom: '1.5rem',
                backgroundColor: 'rgba(0, 0, 0, 0.2)', 
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '1px dashed var(--accent-cyan)'
              }}>
                <h3 style={{ marginBottom: '0.75rem', color: 'var(--text-color)' }}>Transaction Summary</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>VCN Tokens:</span>
                  <span>{presaleAmount.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Price per Token:</span>
                  <span>${PRESALE_PRICE_USD}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Total USD:</span>
                  <span>${(Number(presaleAmount) * PRESALE_PRICE_USD).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-cyan)' }}>
                  <span>Payment ({paymentMethod === 'SOL' ? 'SOL' : paymentMethod === 'USDC' ? 'USDC' : 'USDT'}):</span>
                  <span>
                    {isPriceLoading ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span className="loading-pulse" style={{ 
                          display: 'inline-block',
                          width: '10px',
                          height: '10px',
                          backgroundColor: 'var(--accent-cyan)',
                          borderRadius: '50%',
                          marginRight: '8px',
                          animation: 'pulse 1.5s infinite'
                        }}></span>
                        Updating...
                      </span>
                    ) : (
                      `${calculateTokensToReceive().toFixed(paymentMethod === 'SOL' ? 4 : 2)} ${paymentMethod}`
                    )}
                  </span>
                </div>
                {isPriceLoading ? (
                  <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', textAlign: 'right', color: 'var(--text-color)' }}>
                    Fetching latest market prices...
                  </p>
                ) : (
                  <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', textAlign: 'right', color: 'var(--text-color)' }}>
                    1 {paymentMethod === 'SOL' ? 'SOL' : paymentMethod === 'USDC' ? 'USDC' : 'USDT'} = ${tokenPrice[paymentMethod === 'SOL' ? 'SOL' : paymentMethod === 'USDC' ? 'USDC' : 'USDT']} 
                    <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '5px', fontSize: '0.7rem' }}>
                      (Source: {priceSource})
                    </span>
                    <button 
                      onClick={fetchPrices}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-cyan)',
                        cursor: 'pointer',
                        marginLeft: '0.5rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      ↻ refresh
                    </button>
                  </p>
                )}
              </div>
              
              <button 
                type="submit" 
                disabled={!connected || loading || (paymentMethod === 'SOL' && isPriceLoading)}
                className="btn-futuristic"
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem",
                  background: !connected || loading || (paymentMethod === 'SOL' && isPriceLoading) ? 
                    "rgba(100, 100, 100, 0.2)" : 
                    "linear-gradient(135deg, rgba(var(--accent-cyan), 0.8), rgba(var(--accent-cyan), 0.6))",
                  border: `1px solid ${!connected || loading || (paymentMethod === 'SOL' && isPriceLoading) ? 
                    'rgba(100, 100, 100, 0.3)' : 
                    'rgba(var(--accent-cyan), 0.3)'}`,
                  color: !connected || loading || (paymentMethod === 'SOL' && isPriceLoading) ? "rgba(255, 255, 255, 0.4)" : "white",
                  cursor: connected && !loading && !(paymentMethod === 'SOL' && isPriceLoading) ? "pointer" : "not-allowed",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "400",
                  textAlign: "center",
                  boxShadow: connected && !loading && !(paymentMethod === 'SOL' && isPriceLoading) ? "0 0 20px rgba(var(--accent-cyan), 0.3)" : "none",
                  position: "relative",
                  overflow: "hidden"
                }}
              >
                {loading ? (
                  <>
                    <span style={{ 
                      display: "inline-block", 
                      width: "16px", 
                      height: "16px", 
                      borderRadius: "50%", 
                      border: "2px solid rgba(255, 255, 255, 0.3)",
                      borderTopColor: "white",
                      animation: "spin 1s linear infinite",
                      marginRight: "8px"
                    }}></span>
                    Processing...
                  </>
                ) : !connected ? (
                  "Connect wallet to purchase"
                ) : isPriceLoading && paymentMethod === 'SOL' ? (
                  "Loading price data..."
                ) : (
                  `Purchase ${TOKEN_SYMBOL} Tokens`
                )}
              </button>
              
              {!connected && (
                <p style={{ 
                  fontSize: "0.75rem", 
                  color: "rgba(255, 255, 255, 0.5)",
                  textAlign: "center",
                  marginTop: "0.5rem"
                }}>
                  Please connect your wallet to participate in the presale
                </p>
              )}
              
              <style jsx>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </form>
          </div>
        </div>
      </main>

      {/* Executive Summary Section */}
      <section style={{
        padding: "4rem 0",
        background: "linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5))",
        position: "relative",
        zIndex: 10
      }}>
        <div style={{ 
          maxWidth: "1200px", 
          margin: "0 auto", 
          padding: "0 1.5rem"
        }}>
          <h2 style={{ 
            textAlign: "center", 
            color: "white",
            fontSize: "2rem",
            marginBottom: "2rem",
            position: "relative",
            display: "inline-block",
            left: "50%",
            transform: "translateX(-50%)"
          }}>
            <span style={{ 
              background: "linear-gradient(to right, rgb(var(--accent-cyan)), rgb(var(--accent-magenta)))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>Executive Summary</span>
          </h2>
          
          <div style={{
            background: "rgba(20, 30, 48, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgb(var(--accent-cyan))",
            borderRadius: "1rem",
            padding: "2rem",
            marginBottom: "2rem"
          }}>
            <p style={{
              color: "rgba(255, 255, 255, 0.8)",
              fontSize: "1.125rem",
              lineHeight: "1.6",
              marginBottom: "2rem",
              textAlign: "center"
            }}>
              ViWo combines social media functionality with a decentralized marketplace for digital and physical products, powered by its proprietary cryptocurrency, <strong>V-Coin</strong>. The platform empowers users, creators, and suppliers through seamless content monetization, eco-friendly initiatives, and fee-free transactions.
            </p>
            
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "2rem"
            }}>
              <div style={{
                padding: "1.5rem",
                background: "rgba(var(--accent-cyan), 0.1)",
                borderRadius: "0.5rem",
                border: "1px solid rgba(var(--accent-cyan), 0.2)"
              }}>
                <h3 style={{
                  color: "rgb(var(--accent-cyan))",
                  marginBottom: "1rem",
                  fontSize: "1.125rem",
                  textAlign: "center"
                }}>Mission</h3>
                <p style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  textAlign: "center",
                  lineHeight: "1.6"
                }}>
                  To empower individuals globally by merging technology, content, and commerce within a user-centric platform.
                </p>
              </div>
              
              <div style={{
                padding: "1.5rem",
                background: "rgba(var(--accent-magenta), 0.1)",
                borderRadius: "0.5rem",
                border: "1px solid rgba(var(--accent-magenta), 0.2)"
              }}>
                <h3 style={{
                  color: "rgb(var(--accent-magenta))",
                  marginBottom: "1rem",
                  fontSize: "1.125rem",
                  textAlign: "center"
                }}>Vision</h3>
                <p style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  textAlign: "center",
                  lineHeight: "1.6"
                }}>
                  To be the leading global platform for social interaction, content creation, and ethical commerce powered by dynamic cryptocurrency.
                </p>
              </div>
              
              <div style={{
                padding: "1.5rem",
                background: "rgba(var(--accent-cyan), 0.1)",
                borderRadius: "0.5rem",
                border: "1px solid rgba(var(--accent-cyan), 0.2)"
              }}>
                <h3 style={{
                  color: "rgb(var(--accent-cyan))",
                  marginBottom: "1rem",
                  fontSize: "1.125rem",
                  textAlign: "center"
                }}>Goals</h3>
                <ul style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  paddingLeft: "1.5rem",
                  lineHeight: "1.6"
                }}>
                  <li>Launch the ViWo app and onboard 1 million users within the first year</li>
                  <li>Develop an ecosystem enabling direct monetization of creativity</li>
                  <li>Expand to global markets with localized features</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Problem and Opportunity Section */}
      <section style={{
        padding: "4rem 0",
        background: "rgba(0, 0, 0, 0.4)",
        position: "relative",
        zIndex: 10
      }}>
        <div style={{ 
          maxWidth: "1200px", 
          margin: "0 auto", 
          padding: "0 1.5rem"
        }}>
          <h2 style={{ 
            textAlign: "center", 
            color: "white",
            fontSize: "2rem",
            marginBottom: "2rem",
            position: "relative",
            display: "inline-block",
            left: "50%",
            transform: "translateX(-50%)"
          }}>
            <span style={{ 
              background: "linear-gradient(to right, rgb(var(--accent-cyan)), rgb(var(--accent-magenta)))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>Problem and Opportunity</span>
          </h2>
          
          <div style={{ 
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "2rem"
          }}>
            {/* Challenges */}
            <div style={{ 
              background: "rgba(20, 30, 48, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgb(var(--accent-cyan))",
              borderRadius: "1rem",
              padding: "2rem"
            }}>
              <h3 style={{ 
                color: "rgb(var(--accent-cyan))",
                marginBottom: "1.5rem"
              }}>Challenges Addressed by ViWo</h3>
              
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem"
              }}>
                <div>
                  <h4 style={{
                    color: "white",
                    marginBottom: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "24px",
                      fontSize: "0.75rem",
                      color: "black",
                      fontWeight: "bold"
                    }}>✓</span>
                    Limited Monetization Options
                  </h4>
                  <p style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                    Traditional social media platforms offer limited and centralized monetization methods.
                  </p>
                </div>
                
                <div>
                  <h4 style={{
                    color: "white",
                    marginBottom: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "24px",
                      fontSize: "0.75rem",
                      color: "black",
                      fontWeight: "bold"
                    }}>✓</span>
                    Decentralized User Management
                  </h4>
                  <p style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                    Current platforms lack seamless integration of content creation, commerce, and financial tools.
                  </p>
                </div>
                
                <div>
                  <h4 style={{
                    color: "white",
                    marginBottom: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "24px",
                      fontSize: "0.75rem",
                      color: "black",
                      fontWeight: "bold"
                    }}>✓</span>
                    High Transaction Fees
                  </h4>
                  <p style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                    Cryptocurrency and marketplace platforms often incur prohibitive costs for users.
                  </p>
                </div>
                
                <div>
                  <h4 style={{
                    color: "white",
                    marginBottom: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "24px",
                      fontSize: "0.75rem",
                      color: "black",
                      fontWeight: "bold"
                    }}>✓</span>
                    Sustainability Initiatives
                  </h4>
                  <p style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                    Few platforms integrate meaningful eco-friendly actions into their ecosystems.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Opportunities */}
            <div style={{ 
              background: "rgba(20, 30, 48, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgb(var(--accent-cyan))",
              borderRadius: "1rem",
              padding: "2rem"
            }}>
              <h3 style={{ 
                color: "rgb(var(--accent-cyan))",
                marginBottom: "1.5rem"
              }}>Opportunities</h3>
              
              <ul style={{
                color: "rgba(255, 255, 255, 0.7)",
                paddingLeft: "1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem"
              }}>
                <li>
                  <span style={{
                    color: "white",
                    fontWeight: "500",
                    display: "block",
                    marginBottom: "0.25rem"
                  }}>Direct Earning Capabilities</span>
                  Empowering users with direct earning capabilities through V-Coin
                </li>
                <li>
                  <span style={{
                    color: "white",
                    fontWeight: "500",
                    display: "block",
                    marginBottom: "0.25rem"
                  }}>Global Marketplace</span>
                  Providing a global marketplace for digital and physical products with Super low fee transactions
                </li>
                <li>
                  <span style={{
                    color: "white",
                    fontWeight: "500",
                    display: "block",
                    marginBottom: "0.25rem"
                  }}>Sustainable Commerce</span>
                  Encouraging sustainable and ethical commerce by tying V-Coin's valuation to environmental initiatives
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Company Overview Section */}
      <section style={{
        padding: "4rem 0",
        background: "linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.3))",
        position: "relative",
        zIndex: 10
      }}>
        <div style={{ 
          maxWidth: "1200px", 
          margin: "0 auto", 
          padding: "0 1.5rem"
        }}>
          <h2 style={{ 
            textAlign: "center", 
            color: "white",
            fontSize: "2rem",
            marginBottom: "2rem",
            position: "relative",
            display: "inline-block",
            left: "50%",
            transform: "translateX(-50%)"
          }}>
            <span style={{ 
              background: "linear-gradient(to right, rgb(var(--accent-cyan)), rgb(var(--accent-magenta)))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>About SmarTech LLC</span>
          </h2>
          
          <div style={{
            background: "rgba(20, 30, 48, 0.6)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgb(var(--accent-cyan))",
            borderRadius: "1rem",
            padding: "2rem",
            marginBottom: "2rem"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1.5rem"
            }}>
              <div style={{
                padding: "0.5rem 1rem",
                background: "rgba(var(--accent-cyan), 0.1)",
                border: "1px solid rgba(var(--accent-cyan), 0.3)",
                borderRadius: "0.5rem",
                color: "white",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}>
                <span style={{
                  width: "20px",
                  height: "20px",
                  background: "rgb(var(--accent-cyan))",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  color: "black",
                  fontWeight: "bold"
                }}>✓</span>
                USPTO-Registered Innovation
              </div>
            </div>
            
            <p style={{
              color: "rgba(255, 255, 255, 0.7)",
              marginBottom: "1.5rem",
              textAlign: "center",
              maxWidth: "800px",
              margin: "0 auto 2rem"
            }}>
              SmarTech LLC is a technology firm headquartered in Kirkland, Washington, specializing in innovative solutions that integrate social media, e-commerce, and blockchain technologies. As the developer of the ViWo App, we are dedicated to creating platforms that empower users through seamless digital experiences.
            </p>
            
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "1.5rem"
            }}>
              <div style={{
                padding: "1.5rem",
                background: "rgba(var(--accent-cyan), 0.1)",
                borderRadius: "0.5rem",
                border: "1px solid rgba(var(--accent-cyan), 0.2)"
              }}>
                <h3 style={{
                  color: "rgb(var(--accent-cyan))",
                  marginBottom: "1rem",
                  fontSize: "1.125rem"
                }}>Our Expertise</h3>
                <ul style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  paddingLeft: "1.5rem"
                }}>
                  <li>Blockchain technology</li>
                  <li>AR, VR, and XR applications</li>
                  <li>E-commerce platforms</li>
                  <li>Social media innovations</li>
                </ul>
              </div>
              
              <div style={{
                padding: "1.5rem",
                background: "rgba(var(--accent-magenta), 0.1)",
                borderRadius: "0.5rem",
                border: "1px solid rgba(var(--accent-magenta), 0.2)"
              }}>
                <h3 style={{
                  color: "rgb(var(--accent-magenta))",
                  marginBottom: "1rem",
                  fontSize: "1.125rem"
                }}>Sub-Brand: GenX</h3>
                <p style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  marginBottom: "1rem"
                }}>
                  Our retail division focuses on cutting-edge technology devices through verified shops on Amazon and Meta platforms.
                </p>
              </div>
            </div>
          </div>
          
          <div style={{
            textAlign: "center"
          }}>
            <p style={{
              color: "rgba(255, 255, 255, 0.6)",
              fontSize: "0.875rem",
              marginBottom: "1rem"
            }}>
              SmarTech LLC • 11410 NE 124th ST PMB 103, Kirkland WA, USA 98034-4305
            </p>
            <div style={{
              display: "flex",
              justifyContent: "center",
              gap: "1.5rem",
              flexWrap: "wrap"
            }}>
              <a href="https://www.smartechllc.tech" target="_blank" rel="noopener noreferrer" style={{
                color: "rgb(var(--accent-cyan))",
                textDecoration: "none",
                transition: "color 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}
              onMouseOver={(e) => mounted && (e.currentTarget.style.color = "rgb(var(--accent-magenta))")}
              onMouseOut={(e) => mounted && (e.currentTarget.style.color = "rgb(var(--accent-cyan))")}>
                <span>SmartechLLC.tech</span>
              </a>
              <a href="https://www.viwoapp.org" target="_blank" rel="noopener noreferrer" style={{
                color: "rgb(var(--accent-cyan))",
                textDecoration: "none",
                transition: "color 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}
              onMouseOver={(e) => mounted && (e.currentTarget.style.color = "rgb(var(--accent-magenta))")}
              onMouseOut={(e) => mounted && (e.currentTarget.style.color = "rgb(var(--accent-cyan))")}>
                <span>ViwoApp.org</span>
              </a>
              <a href="mailto:info@viwoapp.org" style={{
                color: "rgb(var(--accent-cyan))",
                textDecoration: "none",
                transition: "color 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}
              onMouseOver={(e) => mounted && (e.currentTarget.style.color = "rgb(var(--accent-magenta))")}
              onMouseOut={(e) => mounted && (e.currentTarget.style.color = "rgb(var(--accent-cyan))")}>
                <span>info@viwoapp.org</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ViWo Ecosystem Section */}

      <footer style={{ 
        padding: "1.5rem 0", 
        borderTop: "1px solid rgba(var(--accent-cyan), 0.1)",
        textAlign: "center",
        position: "relative",
        zIndex: 10
      }}>
        <div style={{ 
          maxWidth: "1200px", 
          margin: "0 auto", 
          padding: "0 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem"
        }}>
          <div style={{ 
            fontSize: "0.875rem", 
            color: "rgba(255, 255, 255, 0.5)",
            display: "flex",
            gap: "2rem"
          }}>
            <Link href="/terms" style={{ 
              color: "rgba(255, 255, 255, 0.5)",
              transition: "color 0.2s ease"
            }}
            onMouseOver={(e) => mounted && (e.currentTarget.style.color = "rgb(var(--accent-cyan))")}
            onMouseOut={(e) => mounted && (e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)")}
            >
              Terms
            </Link>
            <Link href="/privacy" style={{ 
              color: "rgba(255, 255, 255, 0.5)",
              transition: "color 0.2s ease"
            }}
            onMouseOver={(e) => mounted && (e.currentTarget.style.color = "rgb(var(--accent-cyan))")}
            onMouseOut={(e) => mounted && (e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)")}
            >
              Privacy
            </Link>
            <Link href="/docs" style={{ 
              color: "rgba(255, 255, 255, 0.5)",
              transition: "color 0.2s ease"
            }}
            onMouseOver={(e) => mounted && (e.currentTarget.style.color = "rgb(var(--accent-cyan))")}
            onMouseOut={(e) => mounted && (e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)")}
            >
              Docs
            </Link>
          </div>
          
          <div style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.4)" }}>
            &copy; {new Date().getFullYear()} VCOIN. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
