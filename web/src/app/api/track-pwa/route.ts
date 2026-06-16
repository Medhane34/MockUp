// app/api/track-pwa/route.ts
import { client } from "@/sanity/client"; // Ensure this client has write access
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const data = await req.json();

        // Create the document in Sanity
        await client.create({
            _type: 'pwaInteraction',
            ...data
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("Sanity Tracking Error:", error);
        return NextResponse.json({ error: "Failed to track" }, { status: 500 });
    }
}