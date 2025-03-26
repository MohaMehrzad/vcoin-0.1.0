import { NextRequest } from 'next/server';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Type for rate limit configuration
export interface RateLimitOptions {
  interval: number;
  uniqueTokenPerInterval: number;
}

// Type for the rateLimit function return value
interface RateLimiter {
  check: (req: NextRequest, limit: number) => Promise<void>;
}

// Memory store for rate limiting
const memoryStore: Record<string, RateLimiterMemory> = {};

/**
 * Creates a rate limiter to protect API routes from abuse
 * @param options Configuration options for the rate limiter
 * @returns A rate limiter object with a check method
 */
export function rateLimit(options: RateLimitOptions): RateLimiter {
  // Use a unique key for the store based on interval
  const storeKey = `rate-limit-${options.interval}`;
  
  // Create a new rate limiter if it doesn't exist
  if (!memoryStore[storeKey]) {
    memoryStore[storeKey] = new RateLimiterMemory({
      points: 1, // 1 point per request
      duration: options.interval / 1000, // Convert ms to seconds
      keyPrefix: 'rl',
    });
  }

  const rateLimiter = memoryStore[storeKey];

  return {
    /**
     * Checks if a request has exceeded its rate limit
     * @param req The Next.js request object
     * @param limit The maximum number of requests allowed per interval
     */
    check: async (req: NextRequest, limit: number): Promise<void> => {
      // Function to get a client identifier
      const getClientIdentifier = (): string => {
        // First try X-Forwarded-For header (this is set by most proxies)
        const forwardedFor = req.headers.get('x-forwarded-for');
        if (forwardedFor) {
          // Use only the first IP if multiple are present
          return forwardedFor.split(',')[0].trim();
        }
        
        // Fallback to using cookies/headers for a pseudo-identifier
        const cookieValue = req.cookies.get('session-id')?.value;
        if (cookieValue) {
          return `cookie-${cookieValue}`;
        }
        
        // Last resort, use a request-specific identifier
        // This is not ideal as it doesn't actually identify the client
        return req.headers.get('user-agent') || `fallback-${Date.now()}`;
      };
      
      // Get a unique identifier for the current requester
      const identifier = getClientIdentifier();
      
      // Consume points based on the request limit (dynamically adjust consumption)
      const pointsToConsume = limit > 0 ? (1 / limit) : 1;
      
      try {
        await rateLimiter.consume(identifier, pointsToConsume);
      } catch (error) {
        throw new Error('Rate limit exceeded');
      }
    },
  };
} 