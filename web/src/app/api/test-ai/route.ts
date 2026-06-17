// app/api/test-gemini/route.ts

import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export async function GET() {
    console.log("START");

    const result = await generateText({
        model: google("gemini-2.5-flash"),
        prompt: "Say hello",
    });

    console.log("END");

    return Response.json({
        text: result.text,
    });
}