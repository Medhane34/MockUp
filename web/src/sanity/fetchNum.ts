import { client } from "@/sanity/client";

export async function getPwaStats() {
    const query = `{
        "totalShown": count(*[_type == "pwaInteraction" && action == "prompt_shown"]),
        "totalAccepted": count(*[_type == "pwaInteraction" && action == "prompt_accepted"]),
        "totalInstalled": count(*[_type == "pwaInteraction" && action == "installed"]),
        
        // Breakdown by Source for the Donut Chart
        "bySource": {
            "homepage": count(*[_type == "pwaInteraction" && source == "homepage"]),
            "blog": count(*[_type == "pwaInteraction" && source == "blog"])
        },
        
        // Trends: Get all interactions, we will group them by day in the JS layer
        "recentInteractions": *[_type == "pwaInteraction"] | order(timestamp desc)[0...100] {
            timestamp,
            action
        }
    }`;

    const data = await client.fetch(query, {}, {
        next: { revalidate: 60, tags: ['pwa-stats'] }
    });

    // Helper to format date for Area Chart (YYYY-MM-DD)
    const getDay = (isoDate: string) => isoDate.split('T')[0];

    // Grouping interactions by day for the Area Chart
    const dailyTrends = data.recentInteractions.reduce((acc: any, curr: any) => {
        const day = getDay(curr.timestamp);
        if (!acc[day]) acc[day] = { date: day, installs: 0, prompts: 0 };

        if (curr.action === 'installed') acc[day].installs += 1;
        if (curr.action === 'prompt_shown') acc[day].prompts += 1;

        return acc;
    }, {});

    return {
        ...data,
        acceptanceRate: data.totalShown > 0
            ? ((data.totalAccepted / data.totalShown) * 100).toFixed(1)
            : 0,
        dailyTrends: Object.values(dailyTrends).reverse() // Sorted chronologically
    };
}
export type PwaStats = Awaited<ReturnType<typeof getPwaStats>>;