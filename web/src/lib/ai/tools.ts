import { tool } from "ai";
import { z } from "zod";
import { getProductList, getProductDetails, getFAQs } from "@/lib/sanity/queries";

export const sanityTools = {
  getProductList: tool({
    description: "Get the list of products from the Aligoo shop, optionally filtered by category (electronics, fashion, home, beauty, agriculture).",
    inputSchema: z.object({
      category: z.string().optional().describe("Optional product category: electronics, fashion, home, beauty, agriculture."),
    }),
    execute: async ({ category }) => {
      return await getProductList(category);
    },
  }),
  getProductDetails: tool({
    description: "Get detailed information about a specific product, including price, stock status, features, and description, using its slug.",
    inputSchema: z.object({
      slug: z.string().describe("The unique slug of the product (e.g., 'electronics-item', 'cotton-shirt')."),
    }),
    execute: async ({ slug }) => {
      const details = await getProductDetails(slug);
      if (!details) {
        return { error: `Product with slug '${slug}' not found.` };
      }
      return details;
    },
  }),
  getFAQs: tool({
    description: "Get Frequently Asked Questions (FAQs) related to General, Shipping, Returns, Pricing, or Product.",
    inputSchema: z.object({
      category: z.string().optional().describe("Optional FAQ category: General, Shipping, Returns, Pricing, Product."),
    }),
    execute: async ({ category }) => {
      return await getFAQs(category);
    },
  }),
};
export type SanityTools = typeof sanityTools;
