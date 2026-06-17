// app/api/test-ai/route.ts

import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function GET() {
    try {
        const { text } = await generateText({
            model: google('gemini-2.5-flash-lite'),
            prompt: 'Say hello',
        });

        return Response.json({
            success: true,
            text,
        });
    } catch (err: any) {
        return Response.json({
            success: false,
            error: err.message,
        });
    }
}
