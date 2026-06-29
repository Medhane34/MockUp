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

export interface RecommendationContext {
    intent: string;
    coreNeed: string;
    budgetRange?: string;
    timeline?: string;
    categories?: string[];
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


// Add this helper function directly to your existing queries file

/**
 * Executes a tailored GROQ lookup filtering strictly by price boundaries and category constraints.
 * This ensures the recommendation tool receives a concentrated knowledge context slot.
 */
// src/lib/sanity/queries.ts

export async function getProductRecommendations(
    tenantClient: any,
    category?: string,
    minPrice: number = 0,
    maxPrice: number = Infinity
): Promise<any[]> {
    // Basic numerical filtering parameters
    let filter = `_type == "product" && price >= $minPrice && price <= $maxPrice`;

    // 🔄 FIXED CASE-SENSITIVITY: Lowercase both the field property and input variable 
    // using string processing wrappers to ensure clean, resilient matches.
    if (category && category.trim() !== "") {
        filter += ` && lower(category) == lower($category)`;
    }

    const query = `*[${filter}]{
        name,
        slug,
        price,
        inStock,
        category,
        description
    }[0...5]`;

    try {
        // Force the input string criteria to lowercase before transmission
        const cleanCategory = category ? category.trim().toLowerCase() : "";
        return await tenantClient.fetch(query, {
            category: cleanCategory,
            minPrice,
            maxPrice
        });
    } catch (err) {
        console.error("[Sanity Query] Recommendation fetch failed:", err);
        return [];
    }
}
