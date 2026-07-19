// src/app/command-center/CreateProjectForm.tsx

'use client'

import { useActionState } from 'react'
import { createProject } from './actions'

export function CreateProjectForm() {
    const [state, formAction, isPending] = useActionState(createProject, null)

    return (
        <form action={formAction}>
            <div>
                <label htmlFor="displayName">Project Name</label>
                <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    placeholder="My Tenant Project"
                    required
                />
            </div>

            <div>
                <label htmlFor="organizationId">Organization ID</label>
                <input
                    id="organizationId"
                    name="organizationId"
                    type="text"
                    placeholder="org_123"
                />
            </div>

            <button type="submit" disabled={isPending}>
                {isPending ? 'Creating...' : 'Create Project'}
            </button>

            {state?.error && (
                <p style={{ color: 'red' }}>{state.error}</p>
            )}
            {state?.success && (
                <p style={{ color: 'green' }}>
                    Project "{state.project?.displayName}" created! ID: {state.project?.id}
                </p>
            )}
        </form>
    )
}