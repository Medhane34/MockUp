// src/app/api/projects/[projectId]/route.ts

import { sanityManagementFetch } from '@/sanity/lib/managementClient'

type RouteContext = {
    params: Promise<{ projectId: string }>
}

export async function GET(
    _req: Request,
    { params }: RouteContext
) {
    const { projectId } = await params  // ← await params
    try {
        const project = await sanityManagementFetch(`/projects/${projectId}`)
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
    { params }: RouteContext
) {
    const { projectId } = await params  // ← await params
    try {
        const body = await req.json()

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

        const project = await sanityManagementFetch(`/projects/${projectId}`, {
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

export async function DELETE(
    _req: Request,
    { params }: RouteContext
) {
    const { projectId } = await params  // ← await params
    try {
        await sanityManagementFetch(`/projects/${projectId}`, {
            method: 'DELETE',
        })
        return Response.json({ success: true, deletedProjectId: projectId })
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : 'Failed to delete project.' },
            { status: 500 }
        )
    }
}