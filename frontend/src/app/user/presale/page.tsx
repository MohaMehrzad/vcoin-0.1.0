"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useWalletContext } from "@/contexts/WalletContext";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// Define form validation schema
const purchaseSchema = z.object({
  amount: z.number({
    required_error: "Amount is required",
    invalid_type_error: "Amount must be a number",
  }).positive("Amount must be positive"),
  paymentMethod: z.enum(["SOL", "USDC", "USDT"], {
    required_error: "Please select a payment method",
  }),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

export default function PresalePage() {
  const { data: session } = useSession();
  const { connected, walletAddress, connect } = useWalletContext();
  const [presaleData, setPresaleData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<any>(null);
  const [paymentDetails, setPaymentDetails] = useState<{
    equivalentAmount: number;
    currency: string;
  }>({ equivalentAmount: 0, currency: "SOL" });

  // Initialize form with validation
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      amount: 100,
      paymentMethod: "SOL",
    },
  });

  // Watch for form value changes
  const watchAmount = watch("amount");
  const watchPaymentMethod = watch("paymentMethod");

  // Fetch presale data
  useEffect(() => {
    const fetchPresaleData = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/presale", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch presale data");
        }

        const data = await response.json();
        setPresaleData(data);
      } catch (error) {
        console.error("Error fetching presale data:", error);
        setError("Failed to load presale information. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchPresaleData();
  }, []);

  // Calculate equivalent payment amount when form values change
  useEffect(() => {
    if (!presaleData) return;

    const calculateEquivalentAmount = async () => {
      try {
        // In a production environment, you'd fetch real-time exchange rates
        // This is a simplified example
        const mockExchangeRates = {
          SOL: 30, // 1 SOL = $30 USD
          USDC: 1,  // 1 USDC = $1 USD
          USDT: 1,  // 1 USDT = $1 USD
        };

        const pricePerToken = parseFloat(presaleData.price);
        const totalUsdAmount = watchAmount * pricePerToken;
        
        // Convert to selected payment method
        const equivalentAmount = totalUsdAmount / mockExchangeRates[watchPaymentMethod as keyof typeof mockExchangeRates];
        
        setPaymentDetails({
          equivalentAmount: parseFloat(equivalentAmount.toFixed(6)),
          currency: watchPaymentMethod,
        });
      } catch (error) {
        console.error("Error calculating equivalent amount:", error);
      }
    };

    calculateEquivalentAmount();
  }, [watchAmount, watchPaymentMethod, presaleData]);

  // Handle form submission
  const onSubmit = async (data: PurchaseFormValues) => {
    try {
      setError(null);
      setPurchaseSuccess(null);
      
      // Ensure wallet is connected
      if (!connected || !walletAddress) {
        setError("Please connect your wallet first");
        return;
      }

      // Submit purchase to API
      const response = await fetch("/api/presale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: data.amount,
          walletAddress,
          paymentMethod: data.paymentMethod,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to process purchase");
      }

      const successData = await response.json();
      setPurchaseSuccess(successData.data);
      
      // Reset form
      setValue("amount", 100);
    } catch (error: any) {
      console.error("Error submitting purchase:", error);
      setError(error.message || "An error occurred during purchase. Please try again.");
    }
  };

  // Calculate progress percentage
  const calculateProgress = () => {
    if (!presaleData) return 0;
    const allocated = parseInt(presaleData.totalAllocated);
    const sold = parseInt(presaleData.totalSold);
    return Math.min(100, Math.round((sold / allocated) * 100));
  };

  // Check if presale is active
  const isPresaleActive = () => {
    if (!presaleData) return false;
    const now = new Date();
    const startDate = new Date(presaleData.startDate);
    const endDate = new Date(presaleData.endDate);
    return now >= startDate && now <= endDate && !presaleData.soldOut;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="text-xl text-white">Loading presale information...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold">VCoin (VCN) Presale</h1>
          <p className="text-xl text-gray-400">
            Secure your tokens at the best possible price
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg bg-red-900/30 p-4 text-red-200">
            <p>{error}</p>
          </div>
        )}

        {purchaseSuccess && (
          <div className="mb-6 rounded-lg bg-green-900/30 p-4 text-green-200">
            <h3 className="mb-2 text-lg font-semibold">Purchase Successful!</h3>
            <p>Transaction ID: {purchaseSuccess.transactionId}</p>
            <p>Amount: {purchaseSuccess.amount} USD</p>
            <p>Token Amount: {purchaseSuccess.tokenAmount.toLocaleString()} VCN</p>
            <p>Status: {purchaseSuccess.status}</p>
          </div>
        )}

        <div className="mb-8 flex flex-col overflow-hidden rounded-xl bg-gray-800/40 shadow-xl backdrop-blur-sm md:flex-row">
          <div className="flex-1 p-6">
            <h2 className="mb-4 text-2xl font-bold">Presale Information</h2>
            
            <div className="mb-4">
              <p className="mb-1 font-medium">Price per token</p>
              <p className="text-2xl text-indigo-300">${presaleData?.price} USD</p>
            </div>
            
            <div className="mb-4">
              <p className="mb-1 font-medium">Progress</p>
              <div className="mb-1 h-4 w-full overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full bg-indigo-600"
                  style={{ width: `${calculateProgress()}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-400">
                {presaleData?.totalSold} / {presaleData?.totalAllocated} VCN sold ({calculateProgress()}%)
              </p>
            </div>
            
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 font-medium">Start Date</p>
                <p className="text-indigo-300">
                  {new Date(presaleData?.startDate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium">End Date</p>
                <p className="text-indigo-300">
                  {new Date(presaleData?.endDate).toLocaleDateString()}
                </p>
              </div>
            </div>
            
            <div className="mb-4">
              <p className="mb-1 font-medium">Status</p>
              <p className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
                isPresaleActive()
                  ? "bg-green-900/30 text-green-400"
                  : "bg-red-900/30 text-red-400"
              }`}>
                {isPresaleActive() ? "Active" : "Inactive"}
              </p>
            </div>
          </div>
          
          <div className="flex-1 border-t border-gray-700 p-6 md:border-l md:border-t-0">
            <h2 className="mb-4 text-2xl font-bold">Purchase Tokens</h2>
            
            {!connected && (
              <div className="mb-4 rounded-lg bg-indigo-900/30 p-4 text-indigo-200">
                <p className="mb-2">Connect your wallet to participate in the presale</p>
                <button
                  onClick={connect}
                  className="rounded bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  Connect Wallet
                </button>
              </div>
            )}
            
            {connected && (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label htmlFor="walletAddress" className="mb-1 block text-sm font-medium">
                    Your Wallet
                  </label>
                  <input
                    type="text"
                    id="walletAddress"
                    value={walletAddress || ""}
                    disabled
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                  />
                </div>
                
                <div>
                  <label htmlFor="amount" className="mb-1 block text-sm font-medium">
                    Amount (USD)
                  </label>
                  <input
                    type="number"
                    id="amount"
                    {...register("amount", { valueAsNumber: true })}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                    min={1}
                    step={1}
                  />
                  {errors.amount && (
                    <p className="mt-1 text-sm text-red-500">{errors.amount.message}</p>
                  )}
                </div>
                
                <div>
                  <label htmlFor="paymentMethod" className="mb-1 block text-sm font-medium">
                    Payment Method
                  </label>
                  <select
                    id="paymentMethod"
                    {...register("paymentMethod")}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                  >
                    <option value="SOL">Solana (SOL)</option>
                    <option value="USDC">USD Coin (USDC)</option>
                    <option value="USDT">Tether (USDT)</option>
                  </select>
                  {errors.paymentMethod && (
                    <p className="mt-1 text-sm text-red-500">{errors.paymentMethod.message}</p>
                  )}
                </div>
                
                <div className="rounded-md bg-gray-700/50 p-4">
                  <h3 className="mb-2 text-lg font-medium">Order Summary</h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex justify-between">
                      <span>Token Amount:</span>
                      <span>{watchAmount ? (watchAmount / parseFloat(presaleData?.price)).toLocaleString() : 0} VCN</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Price per Token:</span>
                      <span>${presaleData?.price} USD</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Total USD:</span>
                      <span>${watchAmount?.toLocaleString() || 0} USD</span>
                    </li>
                    <li className="flex justify-between border-t border-gray-600 pt-2">
                      <span>Payment Amount:</span>
                      <span>{paymentDetails.equivalentAmount} {paymentDetails.currency}</span>
                    </li>
                  </ul>
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting || !isPresaleActive()}
                  className="w-full rounded-md bg-indigo-600 py-2 px-4 font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting
                    ? "Processing..."
                    : !isPresaleActive()
                    ? "Presale is not active"
                    : "Purchase Tokens"}
                </button>
              </form>
            )}
          </div>
        </div>
        
        <div className="mx-auto max-w-2xl rounded-xl bg-gray-800/40 p-6 backdrop-blur-sm">
          <h2 className="mb-4 text-xl font-bold">Important Information</h2>
          <ul className="list-disc space-y-2 pl-5 text-gray-300">
            <li>VCoin (VCN) is built on Solana using the Token-2022 program.</li>
            <li>Tokens purchased during presale will be distributed after the presale ends.</li>
            <li>Make sure your wallet is compatible with Solana Token-2022 tokens.</li>
            <li>You can only purchase tokens from a wallet that you control.</li>
            <li>All transactions are final and non-refundable.</li>
            <li>For assistance, please contact support@vcoin-example.com</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 