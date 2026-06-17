import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
});

const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Hello, what's good",
});

console.log(response.text);