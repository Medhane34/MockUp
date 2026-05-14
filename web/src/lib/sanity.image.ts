import imageUrlBuilder from '@sanity/image-url'
import { createClient } from 'next-sanity'

// 1. Setup the client
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  apiVersion: '2023-05-03',
  useCdn: true,
})

// 2. Initialize the builder
const builder = imageUrlBuilder(client)

// 3. Export the helper function
export function urlFor(source: any) {
  return builder.image(source).auto('format')
}
