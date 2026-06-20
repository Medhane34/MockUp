import { ProductSummary, ProductDetails } from "@/lib/sanity/queries";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/**
 * Escapes characters that might break Telegram's standard Markdown parsing.
 * In legacy 'Markdown' mode, we need to escape '*', '_', '`', and '['.
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[");
}

export function formatProductList(products: ProductSummary[]): string {
  if (products.length === 0) {
    return "😔 No products found in this category.";
  }

  let formatted = "🛍 *Aligoo Product Catalog*\n\n";
  products.forEach((p) => {
    const stockStatus = p.inStock ? "🟢 In Stock" : "🔴 Out of Stock";
    const categoryText = p.category ? ` (${p.category})` : "";
    formatted += `📦 *${escapeMarkdown(p.name)}*${categoryText}\n`;
    formatted += `💵 Price: *${p.price} ETB*\n`;
    formatted += `status: ${stockStatus}\n`;
    formatted += `To view details, ask me about: \`${p.name}\`\n\n`;
  });
  
  return formatted.trim();
}

export function formatProductDetail(product: ProductDetails): string {
  const stockStatus = product.inStock 
    ? `🟢 In Stock (${product.stockQuantity ?? 50} units)` 
    : "🔴 Out of Stock";
  
  let formatted = `📦 *${escapeMarkdown(product.name)}*\n`;
  if (product.category) {
    formatted += `📂 Category: _${escapeMarkdown(product.category)}_\n`;
  }
  formatted += `💵 Price: *${product.price} ETB*\n`;
  formatted += `status: ${stockStatus}\n\n`;

  if (product.description) {
    formatted += `📝 *Description:*\n${escapeMarkdown(product.description)}\n\n`;
  }

  if (product.features && product.features.length > 0) {
    formatted += `✨ *Key Features:*\n`;
    product.features.forEach((feat) => {
      formatted += `• ${escapeMarkdown(feat)}\n`;
    });
    formatted += `\n`;
  }

  formatted += `💬 To order this item, type \`buy ${product.slug}\` or contact our support team.`;
  return formatted;
}

export function formatFAQAnswer(question: string, answer: string): string {
  return `❓ *${escapeMarkdown(question)}*\n\n💡 ${escapeMarkdown(answer)}`;
}

export function formatWithCTA(text: string, ctaLabel: string, ctaUrl?: string): string {
  const linkText = ctaUrl ? ` [${escapeMarkdown(ctaLabel)}](${ctaUrl})` : ` *${escapeMarkdown(ctaLabel)}*`;
  return `${text}\n\n━━━━━━━━━━━━━━━━━━━━\n${linkText}`;
}

export async function sendFormattedMessage(
  chatId: number,
  text: string,
  parseMode: "Markdown" | "HTML" | null = "Markdown"
): Promise<void> {
  const body: any = {
    chat_id: chatId,
    text: text,
  };

  if (parseMode) {
    body.parse_mode = parseMode;
  }

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    // If Markdown parsing fails, try sending as plain text to be resilient
    if (parseMode === "Markdown" && res.status === 400) {
      console.warn("[Telegram] Markdown parsing failed, retrying with plain text...");
      const fallbackBody = { chat_id: chatId, text };
      const fallbackRes = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackBody),
      });
      if (fallbackRes.ok) return;
    }
    throw new Error(`Telegram sendMessage failed: ${err}`);
  }
}
