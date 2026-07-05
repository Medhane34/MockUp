import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./schemaTypes";
import { SendNotificationAction } from "./actions/SendNotificationAction";
import { contextPlugin } from '@sanity/context/studio'

export default defineConfig({

  title: "Studio",
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  plugins: [structureTool(), visionTool(), contextPlugin()],
  schema: {
    types: schemaTypes,
  },
  document: {
    actions: (prev, context) => {
      if (context.schemaType === 'notificationCampaign') {
        return [...prev, SendNotificationAction];
      }
      return prev;
    },
  },
});
