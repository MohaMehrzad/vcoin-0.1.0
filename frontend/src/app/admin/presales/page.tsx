"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// Define validation schema for presale settings
const presaleSettingsSchema = z.object({
  price: z.string().refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    { message: "Price must be a positive number" }
  ),
  startDate: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: "Invalid start date" }
  ),
  endDate: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: "Invalid end date" }
  ),
  active: z.boolean(),
  allocation: z.string().refine(
    (val) => !isNaN(parseInt(val)) && parseInt(val) > 0,
    { message: "Allocation must be a positive integer" }
  ),
});

type PresaleSettingsFormValues = z.infer<typeof presaleSettingsSchema>;

export default function PresaleManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Initialize form with validation
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PresaleSettingsFormValues>({
    resolver: zodResolver(presaleSettingsSchema),
    defaultValues: {
      price: "0.03",
      startDate: "",
      endDate: "",
      active: true,
      allocation: "100000000",
    },
  });

  // Check authentication
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
    
    // Only proceed if user is an admin
    if (session?.user?.role !== "admin") {
      router.push("/");
    }
  }, [session, status, router]);

  // Fetch presale data and transactions
  useEffect(() => {
    const fetchPresaleData = async () => {
      try {
        setIsLoading(true);
        // In a real app, you'd fetch the actual presale data from an API
        // This is simplified for the example
        const presaleData = {
          price: process.env.NEXT_PUBLIC_PRESALE_PRICE_USD || "0.03",
          startDate: process.env.NEXT_PUBLIC_PRESALE_START_DATE || "",
          endDate: process.env.NEXT_PUBLIC_PRESALE_END_DATE || "",
          active: true,
          allocation: "100000000",
        };

        // Set form values
        setValue("price", presaleData.price);
        setValue("startDate", presaleData.startDate);
        setValue("endDate", presaleData.endDate);
        setValue("active", presaleData.active);
        setValue("allocation", presaleData.allocation);

        // Mock transactions for display
        // In a real app, you'd fetch these from your database
        const mockTransactions = [
          {
            id: "tx-1682345678",
            user: "wallet123...7890",
            amount: 500,
            tokenAmount: 16666.67,
            paymentMethod: "SOL",
            status: "completed",
            timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
          {
            id: "tx-1682345679",
            user: "wallet456...1234",
            amount: 1000,
            tokenAmount: 33333.33,
            paymentMethod: "USDC",
            status: "completed",
            timestamp: new Date(Date.now() - 86400000).toISOString(),
          },
          {
            id: "tx-1682345680",
            user: "wallet789...5678",
            amount: 750,
            tokenAmount: 25000,
            paymentMethod: "USDT",
            status: "processing",
            timestamp: new Date().toISOString(),
          },
        ];

        setTransactions(mockTransactions);
      } catch (error) {
        console.error("Error fetching presale data:", error);
        setError("Failed to load presale data");
      } finally {
        setIsLoading(false);
      }
    };

    if (session?.user?.role === "admin") {
      fetchPresaleData();
    }
  }, [session, setValue]);

  // Handle form submission
  const onSubmit = async (data: PresaleSettingsFormValues) => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      // Validate date range
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      
      if (endDate <= startDate) {
        setError("End date must be after start date");
        return;
      }

      // In a real app, you would send these settings to your backend API
      // This is a simplified example
      console.log("Saving presale settings:", data);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSuccess("Presale settings updated successfully");
    } catch (error) {
      console.error("Error saving presale settings:", error);
      setError("Failed to update presale settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="text-xl text-white">Loading...</div>
      </div>
    );
  }

  if (!session || session?.user?.role !== "admin") {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Presale Management</h1>
          <p className="mt-1 text-gray-400">
            Configure and monitor your token presale
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg bg-red-900/30 p-4 text-red-200">
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-lg bg-green-900/30 p-4 text-green-200">
            <p>{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-gray-800/50 p-6 shadow-md backdrop-blur-sm">
              <h2 className="mb-6 text-xl font-bold">Presale Settings</h2>
              
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label htmlFor="price" className="block text-sm font-medium text-gray-300">
                      Token Price (USD)
                    </label>
                    <input
                      id="price"
                      type="text"
                      {...register("price")}
                      className="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                      placeholder="0.03"
                    />
                    {errors.price && (
                      <p className="mt-1 text-sm text-red-500">{errors.price.message}</p>
                    )}
                  </div>
                  
                  <div>
                    <label htmlFor="allocation" className="block text-sm font-medium text-gray-300">
                      Total Allocation
                    </label>
                    <input
                      id="allocation"
                      type="text"
                      {...register("allocation")}
                      className="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                      placeholder="100000000"
                    />
                    {errors.allocation && (
                      <p className="mt-1 text-sm text-red-500">{errors.allocation.message}</p>
                    )}
                  </div>
                  
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-300">
                      Start Date
                    </label>
                    <input
                      id="startDate"
                      type="date"
                      {...register("startDate")}
                      className="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                    />
                    {errors.startDate && (
                      <p className="mt-1 text-sm text-red-500">{errors.startDate.message}</p>
                    )}
                  </div>
                  
                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-300">
                      End Date
                    </label>
                    <input
                      id="endDate"
                      type="date"
                      {...register("endDate")}
                      className="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                    />
                    {errors.endDate && (
                      <p className="mt-1 text-sm text-red-500">{errors.endDate.message}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center">
                  <input
                    id="active"
                    type="checkbox"
                    {...register("active")}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="active" className="ml-2 block text-sm font-medium text-gray-300">
                    Presale Active
                  </label>
                </div>
                
                <div className="border-t border-gray-700 pt-6">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-md bg-indigo-600 py-2 px-4 font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </form>
            </div>
          </div>
          
          <div>
            <div className="rounded-xl bg-gray-800/50 p-6 shadow-md backdrop-blur-sm">
              <h2 className="mb-4 text-xl font-bold">Quick Actions</h2>
              
              <div className="space-y-4">
                <button
                  className="w-full rounded-md bg-indigo-600 py-2 px-4 font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  onClick={() => {
                    setValue("active", true);
                    setSuccess("Presale activated");
                  }}
                >
                  Activate Presale
                </button>
                
                <button
                  className="w-full rounded-md border border-red-500 bg-transparent py-2 px-4 font-medium text-red-400 hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  onClick={() => {
                    setValue("active", false);
                    setSuccess("Presale paused");
                  }}
                >
                  Pause Presale
                </button>
                
                <div className="rounded-md bg-gray-700/50 p-4">
                  <h3 className="mb-2 text-lg font-medium">Emergency Controls</h3>
                  <p className="mb-4 text-sm text-gray-400">
                    Use these controls only in case of emergency.
                  </p>
                  
                  <button
                    className="w-full rounded-md border border-red-600 bg-red-900/30 py-2 px-4 font-medium text-red-300 hover:bg-red-800/50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to halt all transactions? This is an emergency action.")) {
                        setSuccess("Emergency halt activated. All transactions have been paused.");
                      }
                    }}
                  >
                    Emergency Halt
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8">
          <h2 className="mb-4 text-xl font-bold">Recent Transactions</h2>
          <div className="overflow-hidden rounded-xl bg-gray-800/50 shadow-md backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Tokens</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Method</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {transactions.map((tx, index) => (
                    <tr key={tx.id} className="hover:bg-gray-700/30">
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                        {tx.id}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                        {tx.user}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                        ${tx.amount.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                        {tx.tokenAmount.toLocaleString()} VCN
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                        {tx.paymentMethod}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          tx.status === 'completed' 
                            ? "bg-green-900/30 text-green-400" 
                            : tx.status === 'processing'
                            ? "bg-yellow-900/30 text-yellow-400"
                            : "bg-red-900/30 text-red-400"
                        }`}>
                          {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                        {new Date(tx.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 