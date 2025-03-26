import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getToken } from 'next-auth/jwt';
import { rateLimit } from '@/lib/utils/rate-limit';

// Define rate limiter for presale operations
const limiter = rateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 500, // Max 500 users per interval
});

// Define validation schema for presale purchase
const presalePurchaseSchema = z.object({
  amount: z.number().positive({ message: "Amount must be positive" }),
  walletAddress: z.string().min(32, { message: "Invalid wallet address" }),
  paymentMethod: z.enum(["SOL", "USDC", "USDT"], { 
    message: "Payment method must be one of: SOL, USDC, USDT" 
  }),
});

// GET handler to get presale status and information
export async function GET(req: NextRequest) {
  try {
    // Apply rate limiting
    try {
      await limiter.check(req, 10); // 10 requests per minute
    } catch {
      return NextResponse.json(
        { error: "Rate limit exceeded" }, 
        { status: 429 }
      );
    }

    // In a real app, fetch actual presale data from your backend or database
    const presaleData = {
      startDate: process.env.NEXT_PUBLIC_PRESALE_START_DATE,
      endDate: process.env.NEXT_PUBLIC_PRESALE_END_DATE,
      price: process.env.NEXT_PUBLIC_PRESALE_PRICE_USD,
      totalAllocated: "100000000",
      totalSold: "25000000",
      active: true,
      soldOut: false,
    };

    return NextResponse.json(presaleData);
  } catch (error) {
    console.error("Error in presale GET:", error);
    return NextResponse.json(
      { error: "Failed to fetch presale information" }, 
      { status: 500 }
    );
  }
}

// POST handler to process a presale purchase
export async function POST(req: NextRequest) {
  try {
    // Apply more strict rate limiting for purchase operations
    try {
      await limiter.check(req, 3); // 3 purchase attempts per minute
    } catch {
      return NextResponse.json(
        { error: "Rate limit exceeded" }, 
        { status: 429 }
      );
    }

    // Get authenticated user from session
    const token = await getToken({ 
      req, 
      secret: process.env.NEXTAUTH_SECRET,
    });

    // Ensure the user is authenticated
    if (!token) {
      return NextResponse.json(
        { error: "Authentication required" }, 
        { status: 401 }
      );
    }

    // Parse and validate the request body
    const body = await req.json();
    const validationResult = presalePurchaseSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.format() }, 
        { status: 400 }
      );
    }

    const { amount, walletAddress, paymentMethod } = validationResult.data;

    // Additional security check: Ensure wallet address in the request matches the user's wallet
    if (token.walletAddress && token.walletAddress !== walletAddress) {
      return NextResponse.json(
        { error: "Wallet address mismatch" }, 
        { status: 403 }
      );
    }

    // Check if presale is active
    const currentDate = new Date();
    const startDate = new Date(process.env.NEXT_PUBLIC_PRESALE_START_DATE || '');
    const endDate = new Date(process.env.NEXT_PUBLIC_PRESALE_END_DATE || '');

    if (currentDate < startDate) {
      return NextResponse.json(
        { error: "Presale has not started yet" }, 
        { status: 400 }
      );
    }

    if (currentDate > endDate) {
      return NextResponse.json(
        { error: "Presale has ended" }, 
        { status: 400 }
      );
    }

    // In a real app, you would:
    // 1. Calculate the exact amount in the chosen currency
    // 2. Process the payment using a secure payment processor
    // 3. Update your database with the purchase
    // 4. Trigger the actual token allocation logic on your backend

    // For this example, we'll just return a mock response
    const mockPurchaseData = {
      transactionId: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount,
      tokenAmount: amount / parseFloat(process.env.NEXT_PUBLIC_PRESALE_PRICE_USD || '0.03'),
      walletAddress,
      paymentMethod,
      timestamp: new Date().toISOString(),
      status: "processing",
    };

    return NextResponse.json({
      success: true,
      message: "Purchase request submitted successfully",
      data: mockPurchaseData,
    });
  } catch (error) {
    console.error("Error in presale POST:", error);
    return NextResponse.json(
      { error: "Failed to process purchase" }, 
      { status: 500 }
    );
  }
} 