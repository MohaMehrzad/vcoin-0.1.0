import { NextResponse } from 'next/server';

/**
 * Applies security headers to all responses
 * @param response The NextResponse object
 * @returns The response with security headers applied
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  // Content Security Policy
  // Customize this based on your app's requirements
  const isProduction = process.env.NODE_ENV === 'production';
  
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' blob: data:;
    connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${isProduction ? 'block-all-mixed-content; upgrade-insecure-requests;' : ''}
  `.replace(/\s{2,}/g, ' ').trim();

  // Apply security headers
  const headers = response.headers;
  
  // Set CSP header (using nonce-based approach would be more secure in production)
  headers.set('Content-Security-Policy', cspHeader);
  
  // Prevent browsers from incorrectly detecting non-scripts as scripts
  headers.set('X-Content-Type-Options', 'nosniff');
  
  // Disable iframes from other domains to prevent clickjacking
  headers.set('X-Frame-Options', 'DENY');
  
  // Disable cross-origin access to prevent XSS
  headers.set('X-XSS-Protection', '1; mode=block');
  
  // Control how much information the browser includes with referrers
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Controls which features and APIs can be used in the browser
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  
  // Strict Transport Security - comment out during development if using HTTP
  if (isProduction) {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
} 