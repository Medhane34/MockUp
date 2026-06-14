import { client } from "@/sanity/client"; // Ensure this client has the WRITE token configured
import { NextResponse } from "next/server";
import webpush from "web-push";

webpush.setVapidDetails(
    "mailto:aligoodigital@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
    // DEBUG LOGS - These will appear in your Vercel logs
    console.log("DEBUG - Project ID:", process.env.SANITY_STUDIO_PROJECT_ID);
    console.log("DEBUG - API Token exists:", !!process.env.SANITY_API_WRITE_TOKEN);
    if (!process.env.SANITY_STUDIO_PROJECT_ID) {
        return NextResponse.json({ error: "Missing Project ID in environment" }, { status: 500 });
    }
    try {
        const subscription = await req.json();

        // 1. Await the operation. Without this, the function exits before Sanity writes the data.
        // 2. Explicitly map fields. 'keys' is often a nested object, 
        //    ensure your Sanity schema has a 'keys' field of type 'object'.
        const result = await client.create({
            _type: 'pushSubscription',
            endpoint: subscription.endpoint,
            keys: subscription.keys,
        });

        console.log("Sanity write successful:", result._id);
        return NextResponse.json({ message: "Subscription saved", id: result._id }, { status: 200 });

    } catch (error) {
        // This is crucial. If this fails, the error will appear in Vercel Logs.
        console.error("Sanity Write Error:", error);
        return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
    }
}