'use client'

import { Button } from '@heroui/react'
import { RiAddLine } from '@remixicon/react'

interface Props {
    onCreate: () => void
}

export function PageHeader({ onCreate }: Props) {
    return (
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                    Platform Operations Center
                </h1>

                <p className="mt-2 max-w-2xl text-default-500">
                    Manage tenant projects, deployments and shared infrastructure across
                    your organization.
                </p>
            </div>

            <Button
                size="lg"
                onPress={onCreate}
            >
                Create Project
            </Button>
        </div>
    )
}