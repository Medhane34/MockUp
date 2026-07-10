"use client"
import { SanityProject } from '@/types/command-center'
import { Card } from '@heroui/react'


interface Props {
    projects: SanityProject[]
}

export function StatsCards({ projects }: Props) {
    const total = projects.length

    const active = projects.filter(
        (p) => !p.isBlocked && !p.isDisabled
    ).length

    const disabled = projects.filter((p) => p.isDisabled).length

    const blocked = projects.filter((p) => p.isBlocked).length

    const stats = [
        {
            title: 'Projects',
            value: total,
        },
        {
            title: 'Active',
            value: active,
        },
        {
            title: 'Disabled',
            value: disabled,
        },
        {
            title: 'Blocked',
            value: blocked,
        },
    ]

    return (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((item) => (
                <Card key={item.title}>
                    <Card.Content className="gap-2">
                        <span className="text-sm text-default-500">
                            {item.title}
                        </span>

                        <span className="text-3xl font-bold">
                            {item.value}
                        </span>
                    </Card.Content>
                </Card>
            ))}
        </section>
    )
}