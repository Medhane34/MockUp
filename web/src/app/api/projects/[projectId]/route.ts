// src/app/api/projects/[projectId]/route.ts

import { sanityManagementFetch } from '@/sanity/lib/managementClient'

export async function GET(
    _req: Request,
    { params }: { params: { projectId: string } }
) {
    try {
        const project = await sanityManagementFetch(`/projects/${params.projectId}`)
        return Response.json(project)
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : 'Failed to retrieve project.' },
            { status: 500 }
        )
    }
}
export async function PATCH(
    req: Request,
    { params }: { params: { projectId: string } }
) {
    try {
        const body = await req.json()

        // Only allow fields supported by the Projects API
        const payload: {
            displayName?: string
            isDisabledByUser?: boolean
            activityFeedEnabled?: boolean
            metadata?: { color?: string; externalStudioHost?: string }
        } = {}

        if (body.displayName) payload.displayName = body.displayName
        if (body.isDisabledByUser !== undefined) payload.isDisabledByUser = body.isDisabledByUser
        if (body.activityFeedEnabled !== undefined) payload.activityFeedEnabled = body.activityFeedEnabled
        if (body.metadata) payload.metadata = body.metadata

        const project = await sanityManagementFetch(`/projects/${params.projectId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        })

        return Response.json(project)
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : 'Failed to update project.' },
            { status: 500 }
        )
    }
}

// Delete Project
// src/app/api/projects/[projectId]/route.ts (extended — add to same file)

export async function DELETE(
    _req: Request,
    { params }: { params: { projectId: string } }
) {
    try {
        await sanityManagementFetch(`/projects/${params.projectId}`, {
            method: 'DELETE',
        })
        return Response.json({ success: true, deletedProjectId: params.projectId })
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : 'Failed to delete project.' },
            { status: 500 }
        )
    }
}