'use client'

import { useActionState, useEffect } from 'react'
import {
    Button,
    Input,
    Modal,
    Spinner,
} from '@heroui/react'

import { createProject } from '../actions'

interface Props {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
}

export function CreateProjectModal({
    isOpen,
    onOpenChange,
}: Props) {
    // ✅ 1. Leverage the native isPending state provided directly by useActionState
    const [state, formAction, isPending,] = useActionState(
        createProject,
        null
    )

    useEffect(() => {
        if (state?.success) {
            onOpenChange(false)
        }
    }, [state, onOpenChange])

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
        >
            {/* Keeping Modal.Container exactly as your documentation specifies */}
            <Modal.Container>
                <form action={formAction}>

                    <Modal.Header>
                        Create Tenant Project
                    </Modal.Header>

                    <Modal.Body className="space-y-4">
                        <div className="flex w-full flex-col gap-3">
                            {/* ✅ 2. FIX: Swapped invalid variants for official "primary" theme layouts */}
                            <Input
                                name="displayName"
                                placeholder="Hirut Export"

                            />
                            <Input
                                name="organizationId"
                                placeholder="Leave blank to use default organization"
                                variant="primary"
                            />
                        </div>

                        {state?.error && (
                            <div className="rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">
                                {state.error}
                            </div>
                        )}

                        {state?.success && (
                            <div className="rounded-lg border border-success bg-success/10 p-3 text-sm text-success">
                                Project "{state.project?.displayName}" created successfully.
                            </div>
                        )}
                    </Modal.Body>

                    <Modal.Footer>
                        <Button
                            onPress={() => onOpenChange(false)}
                            isDisabled={isPending}
                        >
                            Cancel
                        </Button>

                        {/* ✅ 3. FIX: Hooked up real isLoading prop and removed broken render function child */}
                        <Button
                            type="submit"
                            variant="primary"
                            isPending={isPending}
                        >
                            {/* ✅ FIX: Official Render Props Pattern tracking state */}
                            {({ isPending: buttonLoading }) => (
                                <div className="flex items-center gap-2">
                                    {buttonLoading && <Spinner color="current" size="sm" />}
                                    <span>{buttonLoading ? "Creating..." : "Create Project"}</span>
                                </div>
                            )}
                        </Button>
                    </Modal.Footer>

                </form>
            </Modal.Container>
        </Modal>
    )
}