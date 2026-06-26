// src/lib/sanity/queries.ts
import type { SanityClient } from "next-sanity";

/**
 * All query functions accept a `tenantClient` — the per-tenant Sanity client.
 * This ensures product and FAQ data is always fetched from the correct tenant project.
 */

export interface ProductSummary {
    name: string;
    slug: string;
    price: number;
    inStock: boolean;
    category?: string;
}

export interface ProductDetails extends ProductSummary {
    description?: string;
    features?: string[];
    stockQuantity?: number;
}

export interface FAQItem {
    question: string;
    answer: string;
    category?: string;
}

export async function getProductList(tenantClient: SanityClient, category?: string): Promise<ProductSummary[]> {
    const filter = category
        ? `_type == "product" && category == $category`
        : `_type == "product"`;

    const query = `*[${filter}] {
        name,
        "slug": slug.current,
        price,
        inStock,
        category
    }`;

    return tenantClient.fetch(query, { category: category?.toLowerCase() });
}

export async function getProductDetails(tenantClient: SanityClient, slug: string): Promise<ProductDetails | null> {
    const query = `*[_type == "product" && slug.current == $slug][0] {
        name,
        "slug": slug.current,
        price,
        inStock,
        category,
        description,
        features,
        stockQuantity
    }`;
    return tenantClient.fetch(query, { slug });
}

export async function getFAQs(tenantClient: SanityClient, category?: string): Promise<FAQItem[]> {
    let mappedCategory = category;
    if (category) {
        const catLower = category.toLowerCase();
        if (catLower === "general") mappedCategory = "General";
        else if (catLower === "shipping") mappedCategory = "Shipping";
        else if (catLower === "returns") mappedCategory = "Returns";
        else if (catLower === "pricing") mappedCategory = "Pricing";
        else if (catLower === "product") mappedCategory = "Product";
    }

    const filter = mappedCategory
        ? `_type == "faq" && category == $category`
        : `_type == "faq"`;

    const query = `*[${filter}] {
        question,
        answer,
        category
    }`;

    return tenantClient.fetch(query, { category: mappedCategory });
}

/**
 * Fetch unique product categories for this tenant's catalog.
 * Used during onboarding interest selection.
 */
export async function getProductCategories(tenantClient: SanityClient): Promise<string[]> {
    return tenantClient.fetch(
        `array::unique(*[_type == "product" && defined(category)].category)`
    );
}
