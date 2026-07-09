// src/app/studio/[[...tool]]/StudioClient.tsx
'use client'; // Required: Sanity Studio is a client-side single-page React app

import { NextStudio } from 'next-sanity/studio';
import { getDynamicStudioConfig } from '../../../../sanity.config'; // Adjust path to your root file
import type { TenantConfig } from '@/types/tenant';

// Export official metadata and viewports to enforce roboto noindex rules automatically
export { metadata, viewport } from 'next-sanity/studio';

interface StudioClientProps {
    tenant: TenantConfig;
}

/**
 * 🎨 STATE-ISOLATED CLIENT WRAPPER
 * Mounts the Sanity Studio layout container with guaranteed configuration parameters.
 */
export function StudioClient({ tenant }: StudioClientProps) {
    // 🔄 FIXED: Config is computed safely now because the server guaranteed a valid projectId exists!
    const runtimeConfig = getDynamicStudioConfig(tenant);

    // ─── 🟢 FIXED: REMOVED NESTED PROVIDER LOOPS ───
    // Using Pattern 1 from the documentation allows Sanity's internal router to handle tools 
    // and viewport parameters natively without triggering hydration collision warnings!
    return <NextStudio config={runtimeConfig} />;
}
