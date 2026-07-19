// src/app/command-center/actions.ts

'use server'

import { revalidatePath } from 'next/cache'
import { sanityManagementFetch } from '@/sanity/lib/managementClient'

interface CreateProjectResult {
    error?: string
    success?: boolean
    project?: {
        id: string
        displayName: string
    }
}

// The key fix: type must be CreateProjectResult | null on BOTH sides
type CreateProjectState = CreateProjectResult | null

export async function createProject(
    _prevState: CreateProjectState,  // ← now accepts null
    formData: FormData
): Promise<CreateProjectState> {
    const displayName = formData.get('displayName')?.toString()
    const organizationId = formData.get('organizationId')?.toString() || undefined

    if (!displayName) {
        return { error: 'Project name is required.' }
    }

    try {
        const project = await sanityManagementFetch('/projects', {
            method: 'POST',
            body: JSON.stringify({
                displayName,
                ...(organizationId && { organizationId }),
            }),
        })

        revalidatePath('/command-center')

        return {
            success: true,
            project: { id: project.id, displayName: project.displayName },
        }
    } catch (err) {
        return { error: err instanceof Error ? err.message : 'Failed to create project.' }
    }
}


// Update Project
type UpdateProjectState = { error?: string; success?: boolean } | null

export async function updateProject(
    _prevState: UpdateProjectState,
    formData: FormData
): Promise<UpdateProjectState> {
    const projectId = formData.get('projectId')?.toString()
    const displayName = formData.get('displayName')?.toString()

    if (!projectId) return { error: 'Project ID is required.' }
    if (!displayName) return { error: 'Project name is required.' }

    try {
        await sanityManagementFetch(`/projects/${projectId}`, {
            method: 'PATCH',
            body: JSON.stringify({ displayName }),
        })

        revalidatePath('/command-center')
        return { success: true }
    } catch (err) {
        return { error: err instanceof Error ? err.message : 'Failed to update project.' }
    }
}

// Delete Project
type DeleteProjectState = { error?: string; success?: boolean } | null

export async function deleteProject(
    _prevState: DeleteProjectState,
    formData: FormData
): Promise<DeleteProjectState> {
    const projectId = formData.get('projectId')?.toString()

    if (!projectId) return { error: 'Project ID is required.' }

    try {
        await sanityManagementFetch(`/projects/${projectId}`, {
            method: 'DELETE',
        })

        revalidatePath('/command-center')
        return { success: true }
    } catch (err) {
        return { error: err instanceof Error ? err.message : 'Failed to delete project.' }
    }
}