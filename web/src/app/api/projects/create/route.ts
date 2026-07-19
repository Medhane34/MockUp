// src/app/api/projects/create/route.ts
import { sanityManagementFetch } from '@/sanity/lib/managementClient'

export async function POST(req: Request) {
    const body = await req.json()
    const project = await sanityManagementFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({
            displayName: body.displayName,
            organizationId: body.organizationId,
            studioHost: body.studioHost,
        }),
    })
    return Response.json(project)
}