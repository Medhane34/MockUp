import { defineBlueprint, defineDocumentFunction, defineRobotToken } from '@sanity/blueprints'

export default defineBlueprint({
  resources: [
    defineRobotToken({
      name: 'classify-robot',
      label: 'Multi-Tenant Classification Robot',
      memberships: [
        {
          // ✅ Organization-level scope covers all child projects
          resourceType: 'organization',
          resourceId: 'oO3tV4D7g',
          roleNames: ['editor'],
        },
        {
          resourceType: 'project',
          resourceId: 'q0xynhos',
          roleNames: ['editor'],
        },
      ],
    }),
    defineDocumentFunction({
      name: 'classify-conversation',
      robotToken: '$.resources.classify-robot.token',
      event: {
        on: ['create', 'update'],
        filter: '_type == "sanity.agentContextConversation"'
      },
      src: './functions/classify-conversation',
    }),
  ],

})

