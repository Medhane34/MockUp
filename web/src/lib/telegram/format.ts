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

  // 🔄 CRITICAL FIX 1: Clean the token string of hidden spaces, tabs, or newlines
  let cleanToken = botToken.trim().replace(/[\n\r\t]/g, "");

  // 🔄 CRITICAL FIX 2: Prevent "botbot" URL duplication anomalies
  if (cleanToken.toLowerCase().startsWith("bot")) {
    cleanToken = cleanToken.substring(3); // Strips 'bot' if it was accidentally prefixed in Sanity
  }

  // Build the clean, bulletproof URL string
  const telegramApi = `https://telegram.org{cleanToken}/sendMessage`;

  // Process markdown into HTML if parseMode is HTML
  const processedText = parseMode === "HTML" ? markdownToHtml(text) : text;

  const body: any = {
    chat_id: chatId,
    text: processedText,
  };

  if (parseMode) {
    body.parse_mode = parseMode;
  }

  if (replyMarkup) {
    body.reply_markup = typeof replyMarkup === "object" ? JSON.stringify(replyMarkup) : replyMarkup;
  }

  // 🔄 CRITICAL FIX 3: Diagnostic URL verification logger
  console.log(`[Telegram Transport Request] Posting payload to computed endpoint: https://telegram.org{cleanToken.slice(0,6)}...***:${cleanToken.slice(-4)}/sendMessage`);

  const res = await fetch(telegramApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();

    if ((parseMode === "Markdown" || parseMode === "HTML") && res.status === 400) {
      console.warn(`[Telegram] ${parseMode} parsing failed, retrying with plain text...`);
      const fallbackBody: any = { chat_id: chatId, text: text };
      if (replyMarkup) {
        fallbackBody.reply_markup = typeof replyMarkup === "object" ? JSON.stringify(replyMarkup) : replyMarkup;
      }

      const fallbackRes = await fetch(telegramApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackBody),
      });
      if (fallbackRes.ok) return;

      const fallbackErr = await fallbackRes.text();
      throw new Error(`Telegram sendMessage fallback failed: ${fallbackErr} (Original error: ${err})`);
    }
    throw new Error(`Telegram sendMessage failed: ${err}`);
  }
}
