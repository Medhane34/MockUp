'use client'

import { useMemo, useState } from 'react'
import {
    Button,
    Card,
    CardHeader,
    Chip,
    Input,
    Table // ✅ Only import the parent Table component
} from '@heroui/react'
import { RiAddLine, RiSearch2Line } from '@remixicon/react'

import { CreateProjectModal } from './CreateProjectModal'
import { SanityProject } from '@/types/command-center'

interface Props {
    projects: SanityProject[]
}

export function ProjectsTable({ projects }: Props) {
    const [search, setSearch] = useState('')
    const [isOpen, setIsOpen] = useState(false)

    const filteredProjects = useMemo(() => {
        const value = search.trim().toLowerCase()

        if (!value) return projects

        return projects.filter((project) => {
            return (
                project.displayName.toLowerCase().includes(value) ||
                project.id.toLowerCase().includes(value)
            )
        })
    }, [projects, search])

    return (
        <>
            <Card>
                <CardHeader>
                    {/* Toolbar */}
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between w-full">
                        <div>
                            <h2 className="text-xl font-semibold">
                                Tenant Projects
                            </h2>
                            <p className="text-sm text-default-500">
                                Manage all tenant Sanity projects.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <Input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search projects..."
                                className="w-72 md:min-w-80"
                            />
                            <Button onPress={() => setIsOpen(true)}>
                                Create Project
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                {/* ✅ FIX: Replaced Card.Content with a clean wrapping container padding layout */}
                <div className="p-5 pt-0">
                    {/* ✅ FIX: Switched entirely to HeroUI v3 Dot-Notation Compound Components */}
                    <Table aria-label="Tenant Projects">
                        <Table.ScrollContainer>
                            <Table.Content>
                                <Table.Header>
                                    <Table.Column>PROJECT</Table.Column>
                                    <Table.Column>PROJECT ID</Table.Column>
                                    <Table.Column>MEMBERS</Table.Column>
                                    <Table.Column>STUDIO HOST</Table.Column>
                                    <Table.Column>CREATED</Table.Column>
                                    <Table.Column>STATUS</Table.Column>
                                </Table.Header>

                                <Table.Body>
                                    {filteredProjects.map((project) => {
                                        const status = project.isBlocked
                                            ? "Blocked"
                                            : project.isDisabled
                                                ? "Disabled"
                                                : "Active"

                                        const color =
                                            status === "Active"
                                                ? "success"
                                                : status === "Disabled"
                                                    ? "warning"
                                                    : "danger"

                                        return (
                                            <Table.Row key={project.id}>
                                                <Table.Cell>
                                                    <div className="font-medium">
                                                        {project.displayName}
                                                    </div>
                                                </Table.Cell>

                                                <Table.Cell>
                                                    <code className="rounded bg-default-100 px-2 py-1 text-xs">
                                                        {project.id}
                                                    </code>
                                                </Table.Cell>

                                                <Table.Cell>
                                                    {project.members.length}
                                                </Table.Cell>
                                                <Table.Cell>
                                                    {project.studioHost}
                                                </Table.Cell>
                                                <Table.Cell>
                                                    {new Date(project.createdAt).toLocaleDateString()}
                                                </Table.Cell>

                                                <Table.Cell>
                                                    <Chip
                                                        color={color}
                                                        size="sm"
                                                    >
                                                        {status}
                                                    </Chip>
                                                </Table.Cell>
                                            </Table.Row>
                                        )
                                    })}
                                </Table.Body>
                            </Table.Content>
                        </Table.ScrollContainer>
                    </Table>
                </div>
            </Card>

            <CreateProjectModal
                isOpen={isOpen}
                onOpenChange={setIsOpen}
            />
        </>
    )
}