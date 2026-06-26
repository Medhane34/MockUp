import { createTenantClient } from "@/sanity/client";
import { getTenantFromHost } from "@/lib/tenant";
import { NextResponse } from "next/server";
import webpush from "web-push";

webpush.setVapidDetails(
    "mailto:aligoodigital@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // You can restrict this to "https://aligoo.sanity.studio" for better security
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

// Handle Preflight Requests
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
    // 1. Security Check
    if (req.headers.get("x-api-key") !== "xX0vkdQ0j9") {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401, headers: corsHeaders }
        );
    }

    try {
        const host = req.headers.get("host");
        const tenant = await getTenantFromHost(host);
        if (!tenant) {
            return NextResponse.json(
                { error: "Tenant not resolved from host" },
                { status: 400, headers: corsHeaders }
            );
        }
        const tenantClient = createTenantClient(tenant);

        // 2. Fetch the latest notification campaign from Sanity
        const campaign = await tenantClient.fetch(
            `*[_type == "notificationCampaign"] | order(_createdAt desc)[0]`
        );

        if (!campaign) {
            return NextResponse.json(
                { error: "No campaign found" },
                { status: 404, headers: corsHeaders }
            );
        }

        // 3. Fetch all subscribers
        const subscriptions = await tenantClient.fetch(`*[_type == "pushSubscription"]`);

        // 4. Send notifications
        const payload = JSON.stringify({
            title: campaign.title,
            body: campaign.body[0]?.children[0]?.text || "New update from Aligoo!",
            url: campaign.targetUrl,
        });

        const results = await Promise.allSettled(
            subscriptions.map((sub: any) =>
                webpush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
                }, payload)
            )
        );

        return NextResponse.json(
            { message: "Campaign sent", results },
            { status: 200, headers: corsHeaders }
        );

    } catch (error) {
        console.error("Notification trigger error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: corsHeaders }
        );
    }
}