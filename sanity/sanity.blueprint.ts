import { defineBlueprint, defineDocumentFunction, defineRobotToken } from '@sanity/blueprints'
import { env } from 'process'

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
      /*       env: {
              GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
            } */
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
    }),
  ],

})

