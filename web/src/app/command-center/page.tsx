import { sanityManagementFetch } from '@/sanity/lib/managementClient'

import { StatsCards } from './components/StatsCards'
import { SanityProject } from 'next-sanity'
import { ProjectsTable } from './components/ProjectsTable'


async function getProjects(): Promise<SanityProject[]> {
    return sanityManagementFetch('/projects')
}

export default async function CommandCenterPage() {
    const projects = await getProjects()

    return (
        <main className="mx-auto flex max-w-7xl flex-col gap-8 p-8">
            <StatsCards projects={projects} />
            <ProjectsTable projects={projects} />

        </main>
    )
}