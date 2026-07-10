export interface ProjectMember {
    id: string
    role: string
}

export interface SanityProject {
    id: string
    displayName: string
    createdAt: string
    isBlocked: boolean
    isDisabled: boolean
    studioHost: string | null
    organizationId: string | null
    members: ProjectMember[]
}