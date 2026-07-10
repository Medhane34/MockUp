// src/app/api/projects/route.ts
import { sanityManagementFetch } from '@/sanity/lib/managementClient'

export async function GET() {
    const projects = await sanityManagementFetch('/projects')
    return Response.json(projects)
}