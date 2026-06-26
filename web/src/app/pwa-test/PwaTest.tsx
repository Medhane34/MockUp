import { getPwaStats } from "@/sanity/fetchNum";
import { headers } from "next/headers";
import { getTenantBySubdomain } from "@/lib/tenant";
import { createTenantClient } from "@/sanity/client";

export default async function PwaTestPage() {
    const headersList = await headers();
    const subdomain = headersList.get("x-tenant-subdomain") || "default";
    const tenant = await getTenantBySubdomain(subdomain);
    
    let stats = null;
    if (tenant) {
        const tenantClient = createTenantClient(tenant);
        stats = await getPwaStats(tenantClient);
    }
    console.log("PWA Stats:", stats); // Visible in your server terminal

    return (
        <main className="p-8">
            <h1 className="text-2xl font-bold mb-4">PWA Stats Debug</h1>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-auto">
                {JSON.stringify(stats, null, 2)}
            </pre>
        </main>
    );
}