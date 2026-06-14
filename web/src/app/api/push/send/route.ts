import { client } from "@/sanity/client";
import { NextResponse } from "next/server";
import webpush from "web-push";

webpush.setVapidDetails(
    "mailto:aligoodigital@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
    // 1. SECURITY CHECK: Verify the secret key
    if (req.headers.get("x-api-key") !== "xX0vkdQ0j9") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // 2. Fetch the latest notification campaign from Sanity
    const campaign = await client.fetch(
        `*[_type == "notificationCampaign"] | order(_createdAt desc)[0]`
    );

    if (!campaign) return NextResponse.json({ error: "No campaign found" }, { status: 404 });

    // 2. Fetch all subscribers
    const subscriptions = await client.fetch(`*[_type == "pushSubscription"]`);

    // 3. Send notifications to all subscribers
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

    return NextResponse.json({ message: "Campaign sent", results });
}