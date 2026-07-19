// src/app/studio/[[...tool]]/page.tsx
import { headers } from 'next/headers';
import { getTenantBySubdomain, getTenantConfig } from '@/lib/tenant';
import { StudioClient } from './StudioClient';

export const dynamic = 'force-dynamic';

/**
 * 🔒 NATIVE HOST EXTRACTOR FOR SERVER COMPONENTS
 * Duplicates your exact subdomain algorithm to resolve tenant contexts 
 * safely without relying on fragile middleware mutations.
 */
function extractSubdomainFromHost(host: string | null): string {
  if (!host) return 'aligoo';

  const hostname = host.split(':')[0].trim().toLowerCase();
  const hostParts = hostname.split('.');

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'aligoo';
  }

  if (hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return hostParts.length >= 2 ? hostParts[0] : 'aligoo';
  }

  if (hostname.endsWith('-mockup.vercel.app')) {
    return hostname.replace('-mockup.vercel.app', '');
  }

  return hostParts.length >= 3 ? hostParts[0] : 'aligoo';
}

export default async function StudioPage() {
  const headersList = await headers();
  const rawHost = headersList.get('host') || '';

  // ─── 🟢 FIXED: RESOLVE SUBDOMAIN NATIVELY AT SERVER RUNTIME ───
  const targetSubdomain = extractSubdomainFromHost(rawHost);

  console.log(`\n📥 [Studio Server Page Ingress] Resolved Target Subdomain: "${targetSubdomain}"`);

  try {
    // Look up tenant using your optimized query string parameters
    const tenantDoc = await getTenantBySubdomain(targetSubdomain);

    if (!tenantDoc || !tenantDoc._id) {
      return (
        <div style={{ padding: '3rem', fontFamily: 'sans-serif', background: '#fef2f2', color: '#991b1b', margin: '2rem', borderRadius: '8px', border: '1px solid #fee2e2' }}>
          <h3>⚠️ Tenant Profile Not Found</h3>
          <p>The platform registry database could not locate an active merchant document matching the subdomain: <code>"{targetSubdomain}"</code></p>
        </div>
      );
    }

    // Load full tenant credentials configuration maps safely
    const tenantConfig = await getTenantConfig(tenantDoc._id);

    // Pass the fully resolved tenant configuration downstream to the NextStudio layout layer
    return <StudioClient tenant={tenantConfig} />;

  } catch (err: any) {
    console.error("❌ [Studio Server Crash] Initialization failure:", err.message);
    return (
      <div style={{ padding: '3rem', fontFamily: 'sans-serif', background: '#fef2f2', color: '#991b1b', margin: '2rem', borderRadius: '8px' }}>
        <h3>⚠️ Studio Initialization Failure</h3>
        <p>Error details: {err.message}</p>
      </div>
    );
  }
}
