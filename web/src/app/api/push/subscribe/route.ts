import { client } from "@/sanity/client";
import { NextResponse } from "next/server";
// You will need to install: npm install web-push @types/web-push
import webpush from "web-push";

// Initialize webpush with your keys
webpush.setVapidDetails(
    "mailto:aligoodigital@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
    const subscription = await req.json();

    // HERE: Save 'subscription' to Sanity
    client.create({ _type: 'pushSubscription', ...subscription })

    return NextResponse.json({ message: "Subscription saved" });
}