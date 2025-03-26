"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// Define validation schema for user actions
const userActionSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  walletAddress: z.string().min(32, "Please enter a valid wallet address"),
  role: z.enum(["user", "admin"], {
    required_error: "Please select a role",
  }),
});

type UserActionFormValues = z.infer<typeof userActionSchema>;

export default function UserManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  // Initialize form with validation
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<UserActionFormValues>({
    resolver: zodResolver(userActionSchema),
    defaultValues: {
      email: "",
      walletAddress: "",
      role: "user",
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

  // Fetch users data
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        // In a real app, you'd fetch actual users from an API
        // This is simplified for the example
        const mockUsers = [
          {
            id: "1",
            email: "admin@example.com",
            walletAddress: process.env.ADMIN_WALLET_ADDRESSES?.split(',')[0] || "admin_wallet_address",
            role: "admin",
            status: "active",
            lastLogin: new Date().toISOString(),
            totalPurchased: 0,
            securityLevel: "high",
          },
          {
            id: "2",
            email: "user1@example.com",
            walletAddress: "wallet123...7890",
            role: "user",
            status: "active",
            lastLogin: new Date(Date.now() - 86400000 * 3).toISOString(),
            totalPurchased: 16666.67,
            securityLevel: "medium",
          },
          {
            id: "3",
            email: "user2@example.com",
            walletAddress: "wallet456...1234",
            role: "user",
            status: "active",
            lastLogin: new Date(Date.now() - 86400000).toISOString(),
            totalPurchased: 33333.33,
            securityLevel: "medium",
          },
          {
            id: "4",
            email: "user3@example.com",
            walletAddress: "wallet789...5678",
            role: "user",
            status: "locked",
            lastLogin: new Date(Date.now() - 86400000 * 7).toISOString(),
            totalPurchased: 25000,
            securityLevel: "low",
          },
        ];

        setUsers(mockUsers);
      } catch (error) {
        console.error("Error fetching users:", error);
        setError("Failed to load user data");
      } finally {
        setIsLoading(false);
      }
    };

    if (session?.user?.role === "admin") {
      fetchUsers();
    }
  }, [session]);

  // Handle form submission
  const onSubmit = async (data: UserActionFormValues) => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      // In a real app, you would send user data to your backend API
      console.log("Saving user:", data);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // If editing an existing user
      if (selectedUser) {
        // Update user in state
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === selectedUser.id 
              ? { ...user, ...data } 
              : user
          )
        );
        setSuccess(`User ${data.email} updated successfully`);
        setSelectedUser(null);
      } else {
        // Add new user to state
        const newUser = {
          id: `${users.length + 1}`,
          email: data.email,
          walletAddress: data.walletAddress,
          role: data.role,
          status: "active",
          lastLogin: "Never",
          totalPurchased: 0,
          securityLevel: "medium",
        };
        setUsers(prevUsers => [...prevUsers, newUser]);
        setSuccess(`User ${data.email} added successfully`);
      }
      
      // Reset form
      reset();
    } catch (error) {
      console.error("Error saving user:", error);
      setError("Failed to save user");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle user selection for editing
  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    setValue("email", user.email);
    setValue("walletAddress", user.walletAddress);
    setValue("role", user.role === "admin" ? "admin" : "user");
  };

  // Handle user lock/unlock
  const toggleUserStatus = (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "locked" : "active";
    setUsers(prevUsers => 
      prevUsers.map(user => 
        user.id === userId 
          ? { ...user, status: newStatus } 
          : user
      )
    );
    
    const targetUser = users.find(user => user.id === userId);
    if (targetUser) {
      setSuccess(`User ${targetUser.email} ${newStatus === "active" ? "unlocked" : "locked"} successfully`);
    }
  };

  // Cancel editing
  const handleCancel = () => {
    setSelectedUser(null);
    reset();
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
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="mt-1 text-gray-400">
            Manage users and their permissions
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
            <div className="overflow-hidden rounded-xl bg-gray-800/50 shadow-md backdrop-blur-sm">
              <div className="border-b border-gray-700 px-6 py-4">
                <h2 className="text-xl font-bold">User List</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Wallet</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Last Login</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-700/30">
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                          {user.email}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                          {user.walletAddress.length > 15 
                            ? `${user.walletAddress.substring(0, 6)}...${user.walletAddress.substring(user.walletAddress.length - 4)}`
                            : user.walletAddress}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            user.role === 'admin' 
                              ? "bg-purple-900/30 text-purple-400" 
                              : "bg-blue-900/30 text-blue-400"
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            user.status === 'active' 
                              ? "bg-green-900/30 text-green-400" 
                              : "bg-red-900/30 text-red-400"
                          }`}>
                            {user.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                          {user.lastLogin === "Never" 
                            ? "Never" 
                            : new Date(user.lastLogin).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEditUser(user)}
                              className="rounded bg-indigo-900/50 px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-800/50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleUserStatus(user.id, user.status)}
                              className={`rounded px-2 py-1 text-xs font-medium ${
                                user.status === 'active'
                                  ? "bg-red-900/50 text-red-300 hover:bg-red-800/50"
                                  : "bg-green-900/50 text-green-300 hover:bg-green-800/50"
                              }`}
                            >
                              {user.status === 'active' ? 'Lock' : 'Unlock'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <div>
            <div className="rounded-xl bg-gray-800/50 p-6 shadow-md backdrop-blur-sm">
              <h2 className="mb-4 text-xl font-bold">
                {selectedUser ? "Edit User" : "Add New User"}
              </h2>
              
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    {...register("email")}
                    className="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                    placeholder="user@example.com"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>
                  )}
                </div>
                
                <div>
                  <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-300">
                    Wallet Address
                  </label>
                  <input
                    id="walletAddress"
                    type="text"
                    {...register("walletAddress")}
                    className="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                    placeholder="Solana wallet address"
                  />
                  {errors.walletAddress && (
                    <p className="mt-1 text-sm text-red-500">{errors.walletAddress.message}</p>
                  )}
                </div>
                
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-300">
                    Role
                  </label>
                  <select
                    id="role"
                    {...register("role")}
                    className="mt-1 block w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  {errors.role && (
                    <p className="mt-1 text-sm text-red-500">{errors.role.message}</p>
                  )}
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 rounded-md bg-indigo-600 py-2 px-4 font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : selectedUser ? "Update User" : "Add User"}
                  </button>
                  
                  {selectedUser && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="rounded-md border border-gray-600 bg-transparent py-2 px-4 font-medium text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
            
            <div className="mt-6 rounded-xl bg-gray-800/50 p-6 shadow-md backdrop-blur-sm">
              <h2 className="mb-4 text-xl font-bold">Security Overview</h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-400">Total Users</p>
                  <p className="text-2xl font-semibold">{users.length}</p>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-400">Active Users</p>
                  <p className="text-2xl font-semibold">{users.filter(u => u.status === 'active').length}</p>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-400">Security Levels</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-md bg-green-900/30 p-2">
                      <span className="font-medium text-green-400">
                        {users.filter(u => u.securityLevel === 'high').length}
                      </span>
                      <p className="text-gray-400">High</p>
                    </div>
                    <div className="rounded-md bg-yellow-900/30 p-2">
                      <span className="font-medium text-yellow-400">
                        {users.filter(u => u.securityLevel === 'medium').length}
                      </span>
                      <p className="text-gray-400">Medium</p>
                    </div>
                    <div className="rounded-md bg-red-900/30 p-2">
                      <span className="font-medium text-red-400">
                        {users.filter(u => u.securityLevel === 'low').length}
                      </span>
                      <p className="text-gray-400">Low</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 