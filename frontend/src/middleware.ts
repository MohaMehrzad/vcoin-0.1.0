import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { applySecurityHeaders } from './lib/utils/security-headers';

// Paths that don't require authentication
const publicPaths = [
  '/',
  '/auth/login',
  '/auth/register',
  '/api/auth/signin',
  '/api/auth/callback',
  '/api/auth/signout',
  '/user/presale',
];

// Admin-only paths
const adminPaths = [
  '/admin',
  '/admin/dashboard',
  '/admin/presales',
  '/admin/users',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if the path is an API route
  const isApiRoute = pathname.startsWith('/api/');
  
  // Allow public assets and API routes
  if (
    pathname.startsWith('/_next') || 
    pathname.startsWith('/favicon.ico') ||
    (isApiRoute && !pathname.startsWith('/api/admin'))
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Check if path is public
  const isPublicPath = publicPaths.some(path => 
    pathname === path || pathname.startsWith(`${path}/`)
  );
  
  if (isPublicPath) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Get the user's session token
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  // Check if the user is not authenticated
  if (!token) {
    // Redirect unauthenticated users to login
    const url = new URL('/auth/login', request.url);
    url.searchParams.set('callbackUrl', encodeURI(pathname));
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  // Check admin access
  const isAdminPath = adminPaths.some(path => 
    pathname === path || pathname.startsWith(`${path}/`)
  );
  
  if (isAdminPath && token.role !== 'admin') {
    // Redirect non-admin users trying to access admin pages
    return applySecurityHeaders(NextResponse.redirect(new URL('/', request.url)));
  }

  return applySecurityHeaders(NextResponse.next());
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 