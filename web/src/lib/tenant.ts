// src/lib/tenant.ts

import { adminClient } from "@/sanity/client";

export async function getTenantBySubdomain(subdomain: string) {
    if (!subdomain) return null;

    const query = `*[_type == "tenant" && subdomain.current == $subdomain][0]{
    _id,
    companyName,
    subdomain,
    niche,
    telegramBotToken,
    telegramWebhookSecret,
    systemPrompt,
    conversionGoalDescription,
    status,
    projectId,
    dataset,
    sanityApiToken
  }`;

    return adminClient.fetch(query, { subdomain });
}

export async function getTenantFromHost(host: string | null) {
    if (!host) return null;

    const hostParts = host.split('.');
    let subdomain = 'default'; // fallback

    if (hostParts.length >= 3) {
        subdomain = hostParts[0];
    }

    return getTenantBySubdomain(subdomain);
}