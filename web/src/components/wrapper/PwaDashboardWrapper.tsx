import { getPwaStats } from "@/sanity/fetchNum";
import PwaDashboardClient from "../PwaDashboardClient";
// Your Tremor-based UI

export default async function PwaDashboardWrapper() {
    const stats = await getPwaStats();

    // Pass the pre-calculated stats as props to the client component
    return <PwaDashboardClient stats={stats} />;
}