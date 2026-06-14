import { createClient } from "next-sanity";

export const client = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID,
  dataset: "production",
  token: process.env.SANITY_API_WRITE_TOKEN,
  apiVersion: "2026-05-05",
  useCdn: false,
});