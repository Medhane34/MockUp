// src/lib/ai/format.ts
import { ProductSummary, ProductDetails } from "@/lib/sanity/queries";

/**
 * Escapes characters that might break Telegram's standard Markdown parsing.
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
 */
export function markdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```(?:[a-zA-Z0-9]+)?\n([\s\S]*?)\n```/g, "<pre>$1</pre>");
  html = html.replace(/`([^`]+?)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^\n]+?)\*\*/g, "<b>$1</b>");
  html = html.replace(/\*([^\n*]+?)\*/g, "<i>$1</i>");
  html = html.replace(/\[([^\n\]]+?)\]\(([^\n)]+?)\)/g, '<a href="$2">$1</a>');

  return html;
}

export function formatProductList(products: ProductSummary[], companyName?: string): string {
  if (products.length === 0) return "😔 No products found in this category.";
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
  const stockStatus = product.inStock ? `🟢 In Stock (${product.stockQuantity ?? 50} units)` : "🔴 Out of Stock";
  let formatted = `📦 *${escapeMarkdown(product.name)}*\n`;
  if (product.category) formatted += `📂 Category: _${escapeMarkdown(product.category)}_\n`;
  formatted += `💵 Price: *${product.price} ETB*\n`;
  formatted += `status: ${stockStatus}\n\n`;
  if (product.description) formatted += `📝 *Description:*\n${escapeMarkdown(product.description)}\n\n`;
  if (product.features && product.features.length > 0) {
    formatted += `✨ *Key Features:*\n`;
    product.features.forEach((feat) => { formatted += `• ${escapeMarkdown(feat)}\n`; });
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
  if (!botToken) throw new Error("sendFormattedMessage: botToken is required");

  const cleanToken = botToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");
  const telegramApi = "https://api.telegram.org/bot" + cleanToken + "/sendMessage";

  const processedText = parseMode === "HTML" ? markdownToHtml(text) : text;

  const body: any = {
    chat_id: chatId,
    text: processedText,
  };

  if (parseMode) body.parse_mode = parseMode;
  if (replyMarkup) {
    body.reply_markup = typeof replyMarkup === "object" ? JSON.stringify(replyMarkup) : replyMarkup;
  }

  // ✅ FIXED LOG EXPRESSION: Properly outputs the target URL location context for verification
  console.log("[Telegram Transport Request] Dispatching message payload to endpoint: " + telegramApi.slice(0, 32) + ".../sendMessage");

  const res = await fetch(telegramApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    if ((parseMode === "Markdown" || parseMode === "HTML") && res.status === 400) {
      console.warn(`[Telegram] ${parseMode} parsing failed, retrying plain fallback...`);
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
      throw new Error(`Telegram fallback delivery failed: ${await fallbackRes.text()}`);
    }
    throw new Error(`Telegram sendMessage failed: ${err}`);
  }
}
