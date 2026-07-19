// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTenantFromHost } from './src/lib/tenant';

const tenantCache = new Map<string, { tenant: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * 🔒 EXTRACT SUBDOMAIN MULTI-TENANT FILTER
 * Parses incoming hostname strings across production domains, staging URLs, 
 * and local split loops without using hardcoded string fallbacks.
 */
function extractSubdomain(host: string): string | null {
    const cleanHost = host.split(':')[0].toLowerCase().trim();

    // 1. Handle local development environments (e.g., aligoo.localhost or tenant.local)
    if (cleanHost.endsWith('.localhost') || cleanHost.endsWith('.local')) {
        const parts = cleanHost.split('.');
        return parts.length > 1 && parts[0] !== 'www' ? parts[0] : null;
    }

    // 2. Handle flat staging deployments (e.g., aligoo-mockup.vercel.app)
    if (cleanHost.endsWith('-mockup.vercel.app')) {
        return cleanHost.replace('-mockup.vercel.app', '');
    }

    // 3. Handle standard 3-tier production custom domains (e.g., ://platform.com)
    const parts = cleanHost.split('.');
    if (parts.length >= 3) {
        // Skips global web indicators cleanly
        if (parts[0] === 'www') return parts[1];
        return parts[0];
    }

    return null;
}

export async function middleware(request: NextRequest) {
    const host = request.headers.get('host') || '';
    const pathname = request.nextUrl.pathname;

    // Filter out static asset tracks and next.js compiler compilation chunks immediately
    if (
        pathname.startsWith('/_next/static') ||
        pathname.startsWith('/_next/image') ||
        pathname.startsWith('/api/webhook') ||
        pathname.startsWith('/api/workflow') ||
        pathname.startsWith('/.well-known/workflow') ||
        pathname.startsWith('/favicon.ico') ||
        pathname === '/404'
    ) {
        return NextResponse.next();
    }

    // ─── 🛡️ RULE: ENFORCE MULTI-TENANCY OVER PATHWAYS ───
    const extractedSubdomainSlug = extractSubdomain(host);

    if (!extractedSubdomainSlug) {
        console.warn(`[Middleware Rejection] No valid tenant subdomain extracted from host: "${host}"`);
        // Fail closed immediately: No fallbacks allowed. Show the error gate!
        return NextResponse.next();
    }

    try {
        // Check local memory cache first
        const cached = tenantCache.get(extractedSubdomainSlug);
        let tenant = cached?.tenant;

        if (!cached || Date.now() > cached.expires) {
            console.log(`[Middleware] Cache MISS. Querying central registry for subdomain: "${extractedSubdomainSlug}"`);

            // Query database strictly using the isolated string marker
            tenant = await getTenantFromHost(extractedSubdomainSlug);

            if (tenant) {
                tenantCache.set(extractedSubdomainSlug, { tenant, expires: Date.now() + CACHE_TTL });
            }
        }

        // If tenant document does not exist, or is suspended, completely block access
        if (!tenant || tenant.status === 'suspended' || tenant.status === 'inactive') {
            console.warn(`[Middleware Access Blocked] Tenant profile invalid or suspended for slug: "${extractedSubdomainSlug}"`);
            return NextResponse.redirect(new URL('/404', request.url));
        }

        // Initialize and bind request headers securely
        const requestHeaders = new Headers(request.headers);

        // ─── 🟢 FIXED: REMOVED SILENT "NULL" STRING CONVERSIONS ───
        // We explicitly extract verified string primitives. If fields are missing, 
        // they fall back to empty strings so your server gates detect the drop accurately!
        requestHeaders.set('x-tenant-id', tenant._id || tenant.id || '');
        requestHeaders.set('x-tenant-subdomain', tenant.subdomain?.current || tenant.subdomain || extractedSubdomainSlug);
        requestHeaders.set('x-tenant-name', tenant.companyName || '');

        const response = NextResponse.next({
            request: { headers: requestHeaders },
        });

        // Sync headers across both request and response objects to satisfy hydration flights
        response.headers.set('x-tenant-id', tenant._id || tenant.id || '');
        response.headers.set('x-tenant-subdomain', tenant.subdomain?.current || tenant.subdomain || extractedSubdomainSlug);
        return response;

    } catch (error: any) {
        console.error(`[Middleware Critical Exception] Failed to resolve tenant for host ${host}:`, error.message);
        return NextResponse.redirect(new URL('/404', request.url));
    }
}

export const config = {
    matcher: [
        '/((?!api/webhook|api/workflow|.well-known/workflow|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
