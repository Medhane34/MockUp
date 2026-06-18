import { generateText } from 'ai';

export async function GET() {
    const { text } = await generateText({
        model: 'anthropic/claude-opus-4.8',
        prompt: 'Explain quantum computing in one paragraph.',
    });

    return Response.json({ text });
}