// src/sanity/lib/managementClient.ts

const SANITY_API_BASE = 'https://api.sanity.io/v2021-06-07'
const token = process.env.SANITY_MANAGEMENT_TOKEN

export async function sanityManagementFetch(
    path: string,
    options: RequestInit = {}
) {
    const res = await fetch(`${SANITY_API_BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    })

    if (!res.ok) {
        throw new Error(`Management API error: ${res.status} ${res.statusText}`)
    }

    return res.json()
}