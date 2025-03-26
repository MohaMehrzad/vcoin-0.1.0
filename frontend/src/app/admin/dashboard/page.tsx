"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Dashboard Stats Component
interface StatsCardProps {
  title: string;
  value: string | number;
  description: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}

const StatsCard = ({ title, value, description, trend, trendValue }: StatsCardProps) => {
  return (
    <div className="rounded-xl bg-gray-800/50 p-6 shadow-md backdrop-blur-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <h3 className="mt-1 text-2xl font-semibold text-white">{value}</h3>
        </div>
        {trend && (
          <div className={`flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
            ${trend === "up" ? "bg-green-900/30 text-green-400" : 
              trend === "down" ? "bg-red-900/30 text-red-400" : 
              "bg-gray-700/50 text-gray-300"}`}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "–"} {trendValue}
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
    </div>
  );
};

// Quick Actions Component
interface ActionButtonProps {
  title: string;
  icon: string;
  href: string;
}

const ActionButton = ({ title, icon, href }: ActionButtonProps) => {
  return (
    <Link href={href} className="flex flex-col items-center justify-center rounded-xl bg-indigo-900/30 p-4 text-center transition-colors hover:bg-indigo-900/50">
      <div className="mb-2 text-2xl">{icon}</div>
      <span className="text-sm font-medium text-indigo-200">{title}</span>
    </Link>
  );
};

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [presaleStats, setPresaleStats] = useState({
    totalAllocated: "Loading...",
    totalSold: "Loading...",
    percentSold: "Loading...",
    active: true,
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

  // Fetch presale stats
  useEffect(() => {
    const fetchPresaleStats = async () => {
      try {
        const response = await fetch("/api/presale", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch presale stats");
        }

        const data = await response.json();
        
        // Calculate percentage sold
        const allocated = parseInt(data.totalAllocated);
        const sold = parseInt(data.totalSold);
        const percentSold = ((sold / allocated) * 100).toFixed(2);
        
        setPresaleStats({
          totalAllocated: data.totalAllocated.toLocaleString(),
          totalSold: data.totalSold.toLocaleString(),
          percentSold: `${percentSold}%`,
          active: data.active,
        });
      } catch (error) {
        console.error("Error fetching presale stats:", error);
      }
    };

    fetchPresaleStats();
  }, []);

  if (status === "loading") {
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
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="mt-1 text-gray-400">
          Welcome back, {session.user.name || session.user.email}
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-4 text-xl font-semibold">Presale Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Allocated"
            value={presaleStats.totalAllocated}
            description="Total tokens allocated for presale"
          />
          <StatsCard
            title="Total Sold"
            value={presaleStats.totalSold}
            description="Tokens sold in presale so far"
            trend="up"
            trendValue="2.5% today"
          />
          <StatsCard
            title="Percentage Sold"
            value={presaleStats.percentSold}
            description="Progress of presale completion"
          />
          <StatsCard
            title="Presale Status"
            value={presaleStats.active ? "Active" : "Inactive"}
            description={presaleStats.active ? "Presale is currently live" : "Presale is not currently active"}
            trend={presaleStats.active ? "up" : "neutral"}
            trendValue={presaleStats.active ? "Live" : "Inactive"}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-xl font-semibold">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          <ActionButton
            title="Presale Management"
            icon="🚀"
            href="/admin/presales"
          />
          <ActionButton
            title="User Management"
            icon="👥"
            href="/admin/users"
          />
          <ActionButton
            title="Token Allocation"
            icon="🪙"
            href="/admin/token-allocation"
          />
          <ActionButton
            title="Security Settings"
            icon="🔒"
            href="/admin/security"
          />
          <ActionButton
            title="Analytics"
            icon="📊"
            href="/admin/analytics"
          />
          <ActionButton
            title="Audit Log"
            icon="📋"
            href="/admin/logs"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Recent Activity</h2>
        <div className="overflow-hidden rounded-xl bg-gray-800/50 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {[1, 2, 3].map((_, index) => (
                  <tr key={index} className="hover:bg-gray-700/30">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                      {new Date(Date.now() - index * 3600000).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                      {["Token Purchase", "Admin Login", "Settings Update"][index]}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                      {["user123", "admin@example.com", "admin@example.com"][index]}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {[
                        "Purchased 1,500 VCN tokens",
                        "Successful login from 192.168.1.1",
                        "Updated presale configuration"
                      ][index]}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        ["bg-green-900/30 text-green-400", "bg-green-900/30 text-green-400", "bg-blue-900/30 text-blue-400"][index]
                      }`}>
                        {["Completed", "Success", "Updated"][index]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
} 