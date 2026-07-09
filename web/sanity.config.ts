// sanity.config.ts
'use client';

import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { contextPlugin } from '@sanity/context/studio';
import type { TenantConfig } from '@/types/tenant';

export function getDynamicStudioConfig(tenant: TenantConfig) {
    // ─── 🟢 FIXED DEFENSIVE CONDITIONAL REALIGNMENT ───
    // Reads the value directly. If it is undefined or missing, we can force a fallback to 
    // false for test verification purposes, or read it precisely from your document field.
    const rawInsightsToggleValue = tenant?.enableInsightsDashboard;

    // Access is granted ONLY if the value is explicitly true or missing (defaults to true)
    // If it is false, shouldMountInsightsDashboard evaluates cleanly to FALSE!
    const shouldMountInsightsDashboard = rawInsightsToggleValue !== false;

    console.log(`\n⚙️ [Sanity Config Factory] EVALUATING WORKSPACE FEATURE GATES:`);
    console.log(`----------------------------------------------------------------------`);
    console.log(`Active Subdomain Client Code:    "${tenant?.subdomain}"`);
    console.log(`Raw enableInsightsDashboard Flag:`, rawInsightsToggleValue);
    console.log(`Evaluated Gating Decision:       `, shouldMountInsightsDashboard ? "ENABLED (ACCESS GRANTED)" : "DISABLED (LOCKOUT ACTIVE)");
    console.log(`----------------------------------------------------------------------\n`);

    return defineConfig({
        name: tenant?.subdomain || 'aligoo',
        title: `${tenant?.companyName || 'Merchant'} Dashboard`,
        projectId: tenant?.projectId || 'k524z1wm',
        dataset: tenant?.dataset || 'production',
        basePath: '/studio',

        plugins: [
            structureTool(),
            visionTool(),
            contextPlugin({
                insights: {
                    // Mounts or unmounts the Agent Insights dashboard section based on the resolved boolean parameter
                    enabled: shouldMountInsightsDashboard
                }
            })
        ],

        auth: {
            redirectOnSingle: true,
            mode: 'append',
        },
        schema: {
            types: [],
        },
    });
}
