import { defineBlueprint, defineDocumentFunction } from '@sanity/blueprints'
import 'dotenv/config'
import process from 'node:process'

const {
  GOOGLE_API_KEY,
  SANITY_STUDIO_PROJECT_ID,
  SANITY_STUDIO_DATASET,
  SANITY_API_WRITE_TOKEN,
} = process.env


export default defineBlueprint({
  resources: [
    defineDocumentFunction({
      name: 'classify-conversation-aligoo',
      project: 'k524z1wm',
      src: './functions/classify-conversation',
      event: {
        on: ['create', 'update'],
        filter: '_type == "sanity.agentContextConversation"'
      },
      // ✅ TypeScript now knows these are string — not string | undefined
      env: {
        SANITY_STUDIO_PROJECT_ID: process.env.SANITY_STUDIO_PROJECT_ID!,
        SANITY_STUDIO_DATASET: process.env.SANITY_STUDIO_DATASET!,
        SANITY_API_WRITE_TOKEN: process.env.SANITY_API_WRITE_TOKEN_ALIGOO!,
        GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
        SANITY_MANAGEMENT_TOKEN: process.env.SANITY_MANAGEMENT_TOKEN!,
      },
    }),

    // Same function code, deployed to Tenant B
    defineDocumentFunction({
      name: 'classify-conversation-muko',
      project: 'q0xynhos',
      src: './functions/classify-conversation',
      event: {
        on: ['create', 'update'],
        filter: '_type == "sanity.agentContextConversation"'
      },
      env: {
        SANITY_STUDIO_PROJECT_ID: process.env.SANITY_STUDIO_PROJECT_ID!,
        SANITY_STUDIO_DATASET: process.env.SANITY_STUDIO_DATASET!,
        SANITY_API_WRITE_TOKEN: process.env.SANITY_API_WRITE_TOKEN_MUKO!,
        GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
        SANITY_MANAGEMENT_TOKEN: process.env.SANITY_MANAGEMENT_TOKEN!,
      },
    }),
  ],

})
