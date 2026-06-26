// src/app/pwa-test/page.tsx (Server Component)
import { getPwaStats } from "@/sanity/fetchNum";

export default async function PwaTestPage() {
    const stats = await getPwaStats();
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