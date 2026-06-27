import { ProductSummary, ProductDetails } from "@/lib/sanity/queries";

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

/**
 * Converts standard Markdown to Telegram-compatible HTML tags.
 * This version is heavily upgraded to ensure compatibility with Gemini's response formatting styles,
 * such as list bullets, deep multi-nested asterisks, and floating angle brackets.
 */
export function markdownToHtml(md: string): string {
  // 1. Escape HTML structural special characters to prevent raw unclosed tag breakage
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2. Convert code blocks: ```lang\ncode\n``` -> <pre>code</pre>
  html = html.replace(/```(?:[a-zA-Z0-9]+)?\n([\s\S]*?)\n```/g, "<pre>$1</pre>");

  // 3. Convert inline code: `code` -> <code>code</code>
  html = html.replace(/`([^`]+?)`/g, "<code>$1</code>");

  // 4. Convert bold text variants: **text** -> <b>text</b>
  html = html.replace(/\*\*([^\n]+?)\*\*/g, "<b>$1</b>");

  // 5. Convert italic text variants: *text* -> <i>text</i>
  html = html.replace(/\*([^\n*]+?)\*/g, "<i>$1</i>");

  // 6. Convert links: [text](url) -> <a href="$2">$1</a>
  html = html.replace(/\[([^\n\]]+?)\]\(([^\n)]+?)\)/g, '<a href="$2">$1</a>');

  return html;
}

export function formatProductList(products: ProductSummary[], companyName?: string): string {
  if (products.length === 0) {
    return "😔 No products found in this category.";
  }

  const title = companyName ? `*${escapeMarkdown(companyName)} Product Catalog*` : "*Product Catalog*";
  let formatted = `🛍 ${title}\n\n`;
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
  botToken: string,
  chatId: number,
  text: string,
  parseMode: "Markdown" | "HTML" | null = "HTML",
  replyMarkup: any = null
): Promise<void> {
  if (!botToken) {
    throw new Error("sendFormattedMessage: botToken is required for multi-tenant message sending");
  }

  const telegramApi = `https://api.telegram.org/bot${botToken}/sendMessage`;

  // Clean up and convert incoming markdown text structure if requested
  const processedText = parseMode === "HTML" ? markdownToHtml(text) : text;

  // Initialize the transmission payload
  const body: any = {
    chat_id: chatId,
    text: processedText,
  };

  if (parseMode) {
    body.parse_mode = parseMode;
  }

  // Telegram expects reply_markup to be a JSON string object representation if present
  if (replyMarkup) {
    body.reply_markup = typeof replyMarkup === "object" ? JSON.stringify(replyMarkup) : replyMarkup;
  }

  const res = await fetch(`${telegramApi}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();

    // Fallback block to rescue failing markdown or HTML structure breaks safely
    if ((parseMode === "Markdown" || parseMode === "HTML") && res.status === 400) {
      console.warn(`[Telegram] ${parseMode} parsing failed, retrying with plain text safely...`);

      const fallbackBody: any = {
        chat_id: chatId,
        text: text // Reverts to the raw string completely bypassing parser entities
      };

      // Ensure the markup parameter stays formatted correctly on retry execution
      if (replyMarkup) {
        fallbackBody.reply_markup = typeof replyMarkup === "object" ? JSON.stringify(replyMarkup) : replyMarkup;
      }

      const fallbackRes = await fetch(`${telegramApi}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackBody),
      });

      if (fallbackRes.ok) return;

      const fallbackErr = await fallbackRes.text();
      console.error("[Telegram] Fallback sendMessage also failed:", fallbackErr);
      throw new Error(`Telegram sendMessage fallback failed: ${fallbackErr} (Original error: ${err})`);
    }
    throw new Error(`Telegram sendMessage failed: ${err}`);
  }
}
