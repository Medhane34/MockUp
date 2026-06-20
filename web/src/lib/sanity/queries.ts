import { client } from "@/sanity/client";

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

export async function getProductList(category?: string): Promise<ProductSummary[]> {
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
  return client.fetch(query, { category: category?.toLowerCase() });
}

export async function getProductDetails(slug: string): Promise<ProductDetails | null> {
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
  return client.fetch(query, { slug });
}

export async function getFAQs(category?: string): Promise<FAQItem[]> {
  // FAQs categories in schema: 'General', 'Shipping', 'Returns', 'Pricing', 'Product'
  // Let's do a case-insensitive check or map it:
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
  return client.fetch(query, { category: mappedCategory });
}
