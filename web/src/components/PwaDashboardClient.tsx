"use client";

import {
    Card,
    Metric,
    Text,
    Title,
    Grid,
    DonutChart,
    AreaChart,
    BarChart,
    Flex,
    Badge,
} from "@tremor/react";
import { PwaStats } from "@/sanity/fetchNum";

export default function PwaDashboardClient({ stats }: { stats: PwaStats }) {
    const sourceData = [
        { name: "Homepage", value: stats.bySource.homepage },
        { name: "Blog", value: stats.bySource.blog },
    ];

    const acceptanceData = [
        { name: "Installed", value: stats.totalInstalled },
        { name: "Declined", value: Math.max(0, stats.totalShown - stats.totalInstalled) },
    ];

    const rate = Number(stats.acceptanceRate);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <Title className="text-2xl font-bold">PWA Performance Dashboard</Title>
            <Text className="mt-1 opacity-70">Overview of install prompts and conversion rates.</Text>

            {/* ── KPI Row ── */}
            <Grid numItemsSm={1} numItemsLg={3} className="gap-6 mt-6">
                {/* Prompt Impressions */}
                <Card>
                    <Text>Total Prompt Impressions</Text>
                    <Metric>{stats.totalShown}</Metric>
                    <AreaChart
                        className="h-40 mt-3"
                        data={stats.dailyTrends}
                        index="date"
                        categories={["prompts"]}
                        colors={["sky"]}
                        showAnimation={true}
                        showGridLines={false}
                        showYAxis={false}
                        showXAxis={true}
                        showLegend={false}
                        curveType="monotone"
                        valueFormatter={(n: number) => `${n}`}
                    />
                </Card>

                {/* Total Installations */}
                <Card>
                    <Text>Total Installations</Text>
                    <Metric>{stats.totalInstalled}</Metric>
                    <AreaChart
                        className="h-40 mt-3"
                        data={stats.dailyTrends}
                        index="date"
                        categories={["installs"]}
                        colors={["emerald"]}
                        showAnimation={true}
                        showGridLines={false}
                        showYAxis={false}
                        showXAxis={true}
                        showLegend={false}
                        curveType="monotone"
                        valueFormatter={(n: number) => `${n}`}
                    />
                </Card>

                {/* Acceptance Rate */}
                <Card>
                    <Text>Acceptance Rate</Text>
                    <Flex className="justify-start items-center gap-2">
                        <Metric>{stats.acceptanceRate}%</Metric>
                        <Badge color={rate > 10 ? "emerald" : "amber"} size="sm">
                            {rate > 10 ? "Good" : "Needs Optimization"}
                        </Badge>
                    </Flex>
                    <div className="mt-3 h-40">
                        <DonutChart
                            data={acceptanceData}
                            category="value"
                            index="name"
                            colors={["emerald", "slate"]}
                            showAnimation={true}
                            showLabel={true}
                        />
                    </div>
                </Card>
            </Grid>

            {/* ── Middle Row ── */}
            <Grid numItemsSm={1} numItemsLg={2} className="gap-6 mt-6">
                <Card>
                    <Title>Installs by Source</Title>
                    <DonutChart
                        className="mt-6 h-64"
                        data={sourceData}
                        category="value"
                        index="name"
                        colors={["blue", "cyan"]}
                        showAnimation={true}
                    />
                </Card>

                <Card>
                    <Title>Installation Trends</Title>
                    <AreaChart
                        className="h-72 mt-4"
                        data={stats.dailyTrends}
                        index="date"
                        categories={["installs", "prompts"]}
                        colors={["emerald", "sky"]}
                        yAxisWidth={40}
                        showAnimation={true}
                        showLegend={true}
                        showGridLines={true}
                        valueFormatter={(n: number) => `${n}`}
                    />
                </Card>
            </Grid>

            {/* ── Bottom Row: Funnel ── */}
            <Grid numItemsSm={1} numItemsLg={1} className="gap-6 mt-6">
                <Card>
                    <Title>Conversion Funnel</Title>
                    <BarChart
                        className="h-60 mt-4"
                        data={[
                            { name: "Prompts Shown", value: stats.totalShown },
                            { name: "Installed", value: stats.totalInstalled },
                        ]}
                        index="name"
                        categories={["value"]}
                        colors={["blue"]}
                        showAnimation={true}
                        yAxisWidth={40}
                    />
                </Card>
            </Grid>
        </div>
    );
}