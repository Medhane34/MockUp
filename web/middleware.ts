// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTenantFromHost } from './src/lib/tenant';

/**
 * In-memory cache for tenants (Edge-friendly)
 * TTL = 5 minutes to balance freshness and performance
 */
const tenantCache = new Map<string, { tenant: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Main Middleware - Tenant Resolution
 * Runs on every request to resolve tenant from hostname/subdomain
 */
export async function middleware(request: NextRequest) {
    const host = request.headers.get('host') || '';
    const pathname = request.nextUrl.pathname;

    // Skip middleware for static assets, API routes that don't need tenant, etc.
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api/webhook') || // Let webhook handle its own tenant logic
        pathname.startsWith('/favicon') ||
        pathname === '/404'
    ) {
        return NextResponse.next();
    }

    try {
        // Check cache first
        const cached = tenantCache.get(host);
        let tenant = cached?.tenant;

        if (!cached || Date.now() > cached.expires) {
            tenant = await getTenantFromHost(host);

            // Cache the result
            tenantCache.set(host, {
                tenant,
                expires: Date.now() + CACHE_TTL,
            });
        }

        if (!tenant || tenant.status !== 'active') {
            console.warn(`[Middleware] Tenant not found or inactive for host: ${host}`);
            return NextResponse.redirect(new URL('/404', request.url));
        }

        // Add tenant context to headers for downstream routes (UI layer only)
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-tenant-id', tenant._id);
        requestHeaders.set('x-tenant-subdomain', tenant.subdomain?.current || tenant.subdomain);
        requestHeaders.set('x-tenant-name', tenant.companyName);
        requestHeaders.set('x-tenant-niche', tenant.niche);
        // NOTE: Do NOT forward sanityApiToken or sanityProjectId — sensitive credentials
        // stay server-side. Server components should call getTenantBySubdomain() directly.

        // Optional: Add Cache-Control for better performance
        const response = NextResponse.next({
            request: { headers: requestHeaders },
        });

        response.headers.set('x-tenant-id', tenant._id);
        return response;
    } catch (error) {
        console.error(`[Middleware] Error resolving tenant for host ${host}:`, error);
        return NextResponse.redirect(new URL('/404', request.url));
    }
}

// Apply middleware to all routes except static assets
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};